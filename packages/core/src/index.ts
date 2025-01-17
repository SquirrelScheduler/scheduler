import { SDBAdapter, STask, ListTasksParams, TaskAttemptResult } from "./types";
import { orThrow } from "../utils/general";

type TaskStatus = STask['status'];

interface SchedulerConfig {
    concurrency?: number;
    backoffStrategy?: 'exponential' | 'linear' | 'fixed';
    baseRetryDelay?: number;
    maxRetryDelay?: number;
    httpTimeout?: number;
    batchSize?: number;
}

type CreateTaskData = Omit<STask, 'id' | 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>;

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
            backoffStrategy: config.backoffStrategy ?? 'exponential',
            baseRetryDelay: config.baseRetryDelay ?? 1000,
            maxRetryDelay: config.maxRetryDelay ?? 1000 * 60 * 60,
            httpTimeout: config.httpTimeout ?? 30000,
            batchSize: config.batchSize ?? 100
        };
    }

    add(task: Pick<STask, "payload" | "url" | "scheduledAt">): this {
        const newTask: STask = {
            id: crypto.randomUUID(),
            status: "pending",
            retryCount: 0,
            maxRetries: 3,
            payload: orThrow(task.payload, "payload is required"),
            url: orThrow(task.url, "url is required"),
            scheduledAt: orThrow(task.scheduledAt, "scheduledAt is required"),
            createdAt: new Date(),
            updatedAt: new Date(),
            lastAttemptAt: null,
            nextAttemptAt: null,
            nextTaskId: undefined,
            metadata: undefined
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

        const tasksToCreate: CreateTaskData[] = this.workflow.map(task => ({
            url: task.url,
            payload: task.payload,
            scheduledAt: task.scheduledAt,
            maxRetries: task.maxRetries,
            nextTaskId: task.nextTaskId,
            metadata: task.metadata
        }));

        try {
            return await this.dbAdapter.createTasks(tasksToCreate);
        } catch (error) {
            const enhancedError = new Error(
                `Failed to schedule ${tasksToCreate.length} tasks: ${error.message}`
            );
            (enhancedError as any).cause = error;
            throw enhancedError;
        }
    }

    async sync(): Promise<void> {
        if (this.isProcessing) {
            console.warn('Sync already in progress, skipping...');
            return;
        }

        this.isProcessing = true;

        try {
            const lastSyncInfo = await this.dbAdapter.getLastSync();
            const fromDate = new Date(lastSyncInfo.timestamp);
            const toDate = new Date();

            let processedCount = 0;
            let failedCount = 0;

            while (true) {
                const params: ListTasksParams = {
                    from: fromDate,
                    to: toDate,
                    status: "pending",
                    limit: this.config.batchSize
                };

                const pendingTasks = await this.dbAdapter.listTasks(params);
                if (pendingTasks.length === 0) break;

                const dueTasks = this.filterDueTasks(pendingTasks);
                if (dueTasks.length === 0) break;

                const claimedTasks = await this.dbAdapter.claimTasks(dueTasks);
                console.log('Claimed tasks:', claimedTasks.length);

                const results = await this.executeTasksBatch(claimedTasks);
                processedCount += results.successful;
                failedCount += results.failed;

                await this.dbAdapter.setLastSync(toDate, {
                    totalTasks: processedCount
                });
            }

        } catch (error) {
            console.error("Sync failed:", error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    private filterDueTasks(tasks: STask[]): STask[] {
        return tasks.filter(task => {
            const scheduledTime = task.scheduledAt instanceof Date
                ? task.scheduledAt.getTime()
                : task.scheduledAt;

            if (task.nextAttemptAt) {
                const nextAttempt = task.nextAttemptAt instanceof Date
                    ? task.nextAttemptAt.getTime()
                    : task.nextAttemptAt;
                return nextAttempt <= Date.now();
            }

            return scheduledTime <= Date.now();
        });
    }

    private async executeTasksBatch(tasks: STask[]): Promise<{ successful: number; failed: number }> {
        let successful = 0;
        let failed = 0;

        // Process tasks sequentially
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

            // do not make the call for now is just testing
            // const response = await fetch(task.url, {
            //     method: "POST",
            //     headers: {
            //         "Content-Type": "application/json",
            //         "X-Task-ID": task.id,
            //         "X-Retry-Count": String(task.retryCount)
            //     },
            //     body: JSON.stringify(task.payload),
            //     signal: controller.signal
            // });

            const response = {
                status: 200,
                ok: true,
                text: async () => {
                    return 'success';
                }
            }

            const result: TaskAttemptResult = {
                taskId: task.id,
                attemptedAt: Date.now(),
                statusCode: response.status,
                duration: Date.now() - startTime
            };

            if (!response.ok) {
                const errorText = await response.text();
                result.error = errorText;
                await this.handleTaskError(task, result);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            result.response = await response.text();
            await this.handleTaskSuccess(task, result);

        } catch (error) {
            const result: TaskAttemptResult = {
                taskId: task.id,
                attemptedAt: Date.now(),
                statusCode: error.name === 'AbortError' ? 408 : 500,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            };

            await this.handleTaskError(task, result);
            throw error; // Re-throw to increment the failed counter
        } finally {
            clearTimeout(timeout);
        }
    }

    private async handleTaskSuccess(task: STask, result: TaskAttemptResult): Promise<void> {
        await Promise.all([
            this.dbAdapter.updateTask(task.id, {
                status: "completed",
                lastAttemptAt: new Date(),
                updatedAt: new Date()
            }),
            this.dbAdapter.recordTaskAttempt(task.id, result)
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
                updatedAt: new Date()
            }),
            this.dbAdapter.recordTaskAttempt(task.id, result)
        ]);
    }

    private calculateNextAttemptTime(retryCount: number): Date {
        let delay: number;

        switch (this.config.backoffStrategy) {
            case 'exponential':
                delay = Math.min(
                    this.config.baseRetryDelay * Math.pow(2, retryCount - 1),
                    this.config.maxRetryDelay
                );
                break;
            case 'linear':
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