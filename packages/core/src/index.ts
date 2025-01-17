// packages/core/src/scheduler.ts
import { SDBAdapter, STask } from "./types";
import { orThrow } from "../utils/general";

/**
 * A simple scheduler class responsible for:
 * 1. Building a workflow of tasks and scheduling them (saving to DB).
 * 2. Providing a method to sync (claim and execute) tasks.
 */
export class SScheduler {
    private readonly workflow: STask[] = [];

    constructor(private readonly dbAdapter: SDBAdapter) {}

    /**
     * Adds a new task to the workflow, chaining it to the previous task if any.
     */
    add(task: Pick<STask, "payload" | "url" | "scheduledAt" | "maxRetries">): this {
        // Create the new task object:
        // - We’ll handle status, retryCount, createdAt, and updatedAt at DB level or default them here.
        // - Provide sensible defaults for certain fields (like `retryCount: 0` and `status: 'pending'`).
        const newTask: STask = {
            id: crypto.randomUUID(),
            status: "pending",
            retryCount: 0,
            maxRetries: task.maxRetries ?? 0,

            payload: orThrow(task.payload, "payload is required"),
            url: orThrow(task.url, "url is required"),
            scheduledAt: orThrow(task.scheduledAt, "scheduledAt is required"),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Chain tasks by setting the previous task's nextTaskId
        if (this.workflow.length > 0) {
            const previousTask = this.workflow[this.workflow.length - 1];
            previousTask.nextTaskId = newTask.id;
        }

        this.workflow.push(newTask);
        return this;
    }

    /**
     * Persists the workflow of tasks to the database.
     */
    async schedule(): Promise<STask[]> {
        if (this.workflow.length === 0) {
            console.warn("No tasks to schedule.");
            return [];
        }

        // Convert tasks to the format your DB adapter expects (which omits
        // certain fields, e.g. `id`, `status`, `retryCount`, etc. if you want
        // your DB to generate them).
        const tasksToCreate = this.workflow.map(task => ({
            url: task.url,
            payload: task.payload,
            scheduledAt: task.scheduledAt,
            maxRetries: task.maxRetries,
            // nextTaskId is optional, so only include it if it exists:
            ...(task.nextTaskId ? { nextTaskId: task.nextTaskId } : {}),
        }));

        try {
            const created = await this.dbAdapter.createTasks(tasksToCreate);
            console.log(`Successfully scheduled ${created.length} tasks.`);
            return created;
        } catch (error) {
            console.error("Failed to schedule tasks:", error);
            // Optionally re-throw or handle error
            throw error;
        }
    }

    /**
     * Synchronizes tasks by:
     * 1. Retrieving tasks that need to be executed (pending)
     * 2. Claiming them for in_progress status
     * 3. Executing tasks
     * 4. Updating the last sync timestamp
     */
    async sync(): Promise<void> {
        try {
            // Retrieve the last sync
            const lastSyncInfo = await this.dbAdapter.getLastSync();
            const fromDate = new Date(lastSyncInfo.timestamp ?? 0);
            const toDate = new Date();

            // Fetch tasks to be executed (status = "pending" by default).
            // You can also filter by "scheduledAt <= new Date()" if your DB does not do that automatically.
            const pendingTasks = await this.dbAdapter.listTasks({
                from: fromDate,
                to: toDate,
                status: "pending",
            });

            if (pendingTasks.length === 0) {
                console.log("No tasks to execute.");
                return;
            }

            // Filter out tasks that are still in the future if needed:
            const dueTasks = pendingTasks.filter((task) => {
                const scheduledTime = task.scheduledAt instanceof Date
                    ? task.scheduledAt.getTime()
                    : task.scheduledAt;
                return scheduledTime <= Date.now();
            });

            if (dueTasks.length === 0) {
                console.log("No tasks due for execution yet.");
                return;
            }

            // Claim tasks
            const claimedTasks = await this.dbAdapter.claimTasks(dueTasks);
            console.log(`Claimed ${claimedTasks.length} tasks.`);

            // Update last sync timestamp
            await this.dbAdapter.setLastSync(toDate, {
                totalTasks: claimedTasks.length,
            });

            // Execute tasks (sequentially or concurrently)
            for (const task of claimedTasks) {
                await this.executeTask(task);
            }
        } catch (error) {
            console.error("Error during sync:", error);
            // Optionally re-throw
            throw error;
        }
    }

    /**
     * Executes a single task.
     * - If successful, marks it "completed"
     * - If it fails, increments retryCount; if it exceeds maxRetries, marks it "failed"
     */
    private async executeTask(task: STask): Promise<void> {
        const startTime = Date.now();
        try {
            console.log(`Executing task ${task.id}...`);

            // Example: Make an HTTP POST request.
            // In real usage, you'd uncomment and handle fetch or axios calls, etc.
            //
            // const response = await fetch(task.url, {
            //   method: "POST",
            //   headers: { "Content-Type": "application/json" },
            //   body: JSON.stringify(task.payload),
            // });
            //
            // const statusCode = response.status;
            // const responseText = await response.text();
            //
            // if (!response.ok) {
            //   throw new Error(`Request failed with status ${statusCode}.`);
            // }

            // If all went well, mark task as "completed"
            await this.dbAdapter.updateTask(task.id, {
                status: "completed",
                lastAttemptAt: new Date(),
                updatedAt: new Date(),
            });

            // Record the attempt
            const duration = Date.now() - startTime;
            await this.dbAdapter.recordTaskAttempt(task.id, {
                taskId: task.id,
                attemptedAt: Date.now(),
                statusCode: 200, // or statusCode from your fetch result
                duration,
                // response: responseText,
            });

            console.log(`Task ${task.id} completed successfully.`);
        } catch (error: unknown) {
            console.error(`Task ${task.id} execution failed:`, error);

            const duration = Date.now() - startTime;
            let updatedStatus: STask["status"] = "pending";
            let nextAttemptTime: Date | undefined;

            // Retry logic
            const newRetryCount = task.retryCount + 1;
            if (newRetryCount > task.maxRetries) {
                updatedStatus = "failed";
            } else {
                updatedStatus = "pending";
                // Optional: schedule the next attempt in the future to avoid
                // immediate retries if you want exponential backoff, etc.
                // For example, nextAttemptTime = new Date(Date.now() + 60_000); // retry in 1 minute
            }

            await this.dbAdapter.updateTask(task.id, {
                retryCount: newRetryCount,
                status: updatedStatus,
                lastAttemptAt: new Date(),
                nextAttemptAt: nextAttemptTime,
                updatedAt: new Date(),
            });

            // Record the attempt
            await this.dbAdapter.recordTaskAttempt(task.id, {
                taskId: task.id,
                attemptedAt: Date.now(),
                statusCode: 500,
                error: error instanceof Error ? error.message : String(error),
                duration,
            });

            console.log(
                `Task ${task.id} ${updatedStatus === "failed" ? "failed permanently" : "will retry"} (retryCount: ${newRetryCount})`
            );
        }
    }
}
