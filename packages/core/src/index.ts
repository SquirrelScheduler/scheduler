import { SDBAdapter, STask, ListTasksParams, TaskAttemptResult } from "./types";
import { orThrow } from "../utils/general";

type TaskStatus = STask["status"];

interface SchedulerConfig {
    concurrency?: number;
    backoffStrategy?: "exponential" | "linear" | "fixed";
    baseRetryDelay?: number;
    maxRetryDelay?: number;
    httpTimeout?: number;
    batchSize?: number;
}

type CreateTaskData = Omit<STask, "id" | "status" | "retryCount" | "createdAt" | "updatedAt">;

export class SScheduler {
    private readonly workflow: STask[] = [];
    private isProcessing = false;
    private readonly config: Required<SchedulerConfig>;

    constructor(
        private readonly dbAdapter: SDBAdapter,
        config: SchedulerConfig = {}
    ) {
        this.config = {
            concurrency: config.concurrency ?? 3,
            backoffStrategy: config.backoffStrategy ?? "exponential",
            baseRetryDelay: config.baseRetryDelay ?? 1000,
            maxRetryDelay: config.maxRetryDelay ?? 1000 * 60 * 60,
            httpTimeout: config.httpTimeout ?? 30000,
            batchSize: config.batchSize ?? 100,
        };
    }

    /**
     * Removed the `url` property.
     * Only "payload" and "scheduledAt" are needed now.
     */
    add(task: Pick<STask, "payload" | "scheduledAt">): this {
        const newTask: STask = {
            id: crypto.randomUUID(),
            status: "pending",
            retryCount: 0,
            maxRetries: 3,
            payload: orThrow(task.payload, "payload is required"),
            scheduledAt: orThrow(task.scheduledAt, "scheduledAt is required"),
            createdAt: new Date(),
            updatedAt: new Date(),
            lastAttemptAt: null,
            nextAttemptAt: null,
            nextTaskId: undefined,
            metadata: undefined,
        };

        if (this.workflow.length > 0) {
            const previousTask = this.workflow[this.workflow.length - 1];
            previousTask.nextTaskId = newTask.id;
        }

        this.workflow.push(newTask);
        return this;
    }

    async schedule(): Promise<STask[]> {
        if (this.workflow.length === 0) {
            return [];
        }

        const tasksToCreate: CreateTaskData[] = this.workflow.map((task) => ({
            payload: task.payload,
            scheduledAt: task.scheduledAt,
            maxRetries: task.maxRetries,
            nextTaskId: task.nextTaskId,
            metadata: task.metadata,
        }));

        try {
            return await this.dbAdapter.createTasks(tasksToCreate);
        } catch (error: any) {
            const enhancedError = new Error(
                `Failed to schedule ${tasksToCreate.length} tasks: ${error.message}`
            );
            (enhancedError as any).cause = error;
            throw enhancedError;
        }
    }

    /**
     * Synchronize tasks by:
     * 1. Fetching tasks in "pending" status in batches.
     * 2. Filtering out tasks not yet due.
     * 3. Claiming (locking) the tasks that are due, marking them "in_progress".
     * 4. Executing each claimed task (in this example, we simply log the payload).
     * 5. Updating tasks in the DB (completed or failed) along with an attempt record.
     *
     * **Returns** an array of all tasks that were actually executed during this sync.
     */
    async sync(): Promise<STask[]> {
        if (this.isProcessing) {
            console.warn("Sync already in progress, skipping...");
            return [];
        }

        this.isProcessing = true;

        // We'll accumulate all claimed tasks here, so we can return them at the end.
        const executedTasks: STask[] = [];

        try {
            const lastSyncInfo = await this.dbAdapter.getLastSync();
            const fromDate = new Date(lastSyncInfo.timestamp);
            const toDate = new Date();

            let processedCount = 0;
            let failedCount = 0;

            // We use a loop to handle multiple "batches" if necessary
            while (true) {
                const params: ListTasksParams = {
                    from: fromDate,
                    to: toDate,
                    status: "pending",
                    limit: this.config.batchSize,
                };

                // 1. Fetch pending tasks within the sync window
                const pendingTasks = await this.dbAdapter.listTasks(params);
                if (pendingTasks.length === 0) break;

                // 2. Filter only tasks that are "due" (i.e. scheduled or nextAttemptAt <= now)
                const dueTasks = this.filterDueTasks(pendingTasks);
                if (dueTasks.length === 0) break;

                // 3. Claim tasks (transition from "pending" to "in_progress")
                const claimedTasks = await this.dbAdapter.claimTasks(dueTasks);
                console.log("Claimed tasks:", claimedTasks.length);

                if (claimedTasks.length === 0) {
                    // It's possible another process claimed them in the meantime
                    // If nothing was claimed, we can just break
                    break;
                }

                // Record them in our aggregator (these are the tasks that *will* be executed now)
                executedTasks.push(...claimedTasks);

                // 4. Execute tasks
                const results = await this.executeTasksBatch(claimedTasks);
                processedCount += results.successful;
                failedCount += results.failed;

                // 5. Update last sync
                await this.dbAdapter.setLastSync(toDate, {
                    totalTasks: processedCount,
                });

                // If fewer tasks were claimed than the batch size,
                // we might be done for now (no more pending tasks).
                // Otherwise, the loop will continue to fetch next batch.
            }
        } catch (error) {
            console.error("Sync failed:", error);
            throw error;
        } finally {
            this.isProcessing = false;
        }

        // Return all tasks that needed to be executed
        return executedTasks;
    }

    private filterDueTasks(tasks: STask[]): STask[] {
        return tasks.filter((task) => {
            const scheduledTime =
                task.scheduledAt instanceof Date
                    ? task.scheduledAt.getTime()
                    : task.scheduledAt;

            // If we have a nextAttemptAt, use that instead
            if (task.nextAttemptAt) {
                const nextAttempt =
                    task.nextAttemptAt instanceof Date
                        ? task.nextAttemptAt.getTime()
                        : task.nextAttemptAt;
                return nextAttempt <= Date.now();
            }

            return scheduledTime <= Date.now();
        });
    }

    private async executeTasksBatch(tasks: STask[]): Promise<{
        successful: number;
        failed: number;
    }> {
        let successful = 0;
        let failed = 0;

        // Process tasks sequentially (or add concurrency if you want)
        for (const task of tasks) {
            try {
                await this.executeTask(task);
                successful++;
            } catch (error) {
                failed++;
                console.error(`Task ${task.id} failed:`, error);
            }
        }

        return { successful, failed };
    }

    private async executeTask(task: STask): Promise<void> {
        const startTime = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.httpTimeout);

        try {
            // EXAMPLE: We removed the "url" concept.
            // The user can do whatever they want with the payload here
            // (e.g., send an HTTP request, push to a queue, etc.).

            console.log(`Executing task ${task.id} with payload:`, task.payload);

            // Simulate success
            const result: TaskAttemptResult = {
                taskId: task.id,
                attemptedAt: Date.now(),
                statusCode: 200,
                duration: Date.now() - startTime,
                response: "OK",
            };

            await this.handleTaskSuccess(task, result);
        } catch (error: any) {
            const result: TaskAttemptResult = {
                taskId: task.id,
                attemptedAt: Date.now(),
                statusCode: error.name === "AbortError" ? 408 : 500,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error),
            };

            await this.handleTaskError(task, result);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async handleTaskSuccess(task: STask, result: TaskAttemptResult): Promise<void> {
        await Promise.all([
            this.dbAdapter.updateTask(task.id, {
                status: "completed",
                lastAttemptAt: new Date(),
                updatedAt: new Date(),
            }),
            this.dbAdapter.recordTaskAttempt(task.id, result),
        ]);
    }

    private async handleTaskError(task: STask, result: TaskAttemptResult): Promise<void> {
        const newRetryCount = task.retryCount + 1;
        const nextAttemptAt = this.calculateNextAttemptTime(newRetryCount);
        const status: TaskStatus = newRetryCount > task.maxRetries ? "failed" : "pending";

        await Promise.all([
            this.dbAdapter.updateTask(task.id, {
                status,
                retryCount: newRetryCount,
                lastAttemptAt: new Date(),
                nextAttemptAt: status === "pending" ? nextAttemptAt : undefined,
                updatedAt: new Date(),
            }),
            this.dbAdapter.recordTaskAttempt(task.id, result),
        ]);
    }

    private calculateNextAttemptTime(retryCount: number): Date {
        let delay: number;
        switch (this.config.backoffStrategy) {
            case "exponential":
                delay = Math.min(
                    this.config.baseRetryDelay * Math.pow(2, retryCount - 1),
                    this.config.maxRetryDelay
                );
                break;
            case "linear":
                delay = Math.min(
                    this.config.baseRetryDelay * retryCount,
                    this.config.maxRetryDelay
                );
                break;
            default: // 'fixed'
                delay = this.config.baseRetryDelay;
        }
        return new Date(Date.now() + delay);
    }
}
