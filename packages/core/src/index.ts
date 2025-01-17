import {SDBAdapter, STask} from "./types";
import {orThrow} from "../utils/general";

export class SScheduler {
    private readonly workflow: Array<STask> = [];

    constructor(private readonly dbAdapter: SDBAdapter) {}

    /**
     * Adds a new task to the workflow.
     * Ensures proper chaining by linking the current task to the previous task.
     */
    add(task: Pick<STask, "payload" | "url" | "scheduledAt">): SScheduler {
        const newTask: STask = {
            id: crypto.randomUUID(),
            maxRetries: 0,
            retryCount: 0,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
            payload: orThrow(task.payload, "payload is required"),
            scheduledAt: orThrow(task.scheduledAt, "scheduledAt is required"),
            url: orThrow(task.url, "url is required"),
        };

        // Chain tasks by setting the nextTaskId
        if (this.workflow.length > 0) {
            this.workflow[this.workflow.length - 1].nextTaskId = newTask.id;
        }

        this.workflow.push(newTask);
        return this;
    }

    /**
     * Persists the workflow to the database.
     */
    async schedule() {
        if (this.workflow.length === 0) {
            console.warn("No tasks to schedule.");
            return;
        }

        try {
            await this.dbAdapter.createTasks(this.workflow);
            console.log("Tasks scheduled successfully.");
        } catch (error) {
            console.error("Failed to schedule tasks:", error);
        }

        return true;
    }

    /**
     * Synchronizes tasks by claiming, executing, and updating them.
     */
    async sync() {
        try {
            // Retrieve the last sync timestamp
            const lastSync = await this.dbAdapter.getLastSync();
            const fromDate = new Date(lastSync.timestamp as number ?? 0);
            const toDate = new Date();

            // Fetch tasks to be executed
            const toExecuteTasks = await this.dbAdapter.listTasks({
                from: fromDate,
                to: toDate,
                status: "pending",
            });

            if (toExecuteTasks.length === 0) {
                console.log("No tasks to execute.");
                return;
            }

            // Claim tasks for processing
            const inProgressTasks = await this.dbAdapter.claimTasks(toExecuteTasks);
            console.log(`Claimed ${inProgressTasks.length} tasks.`);

            // Update the last sync timestamp
            await this.dbAdapter.setLastSync(toDate, {
                totalTasks: inProgressTasks.length,
            });

            // Execute tasks sequentially (can be optimized for parallel processing later)
            for (const task of inProgressTasks) {
                await this.executeTask(task);
            }
        } catch (error) {
            console.error("Error during sync:", error);
        }

        return true;
    }

    /**
     * Executes a single task, handling success and failure.
     */
    private async executeTask(task: STask) {
        try {
            console.log(`Executing task ${task.id}...`);

            // Simulate task execution (e.g., an HTTP call)
            // await fetch(task.url, {
            //     method: "POST",
            //     body: JSON.stringify(task.payload),
            //     headers: { "Content-Type": "application/json" },
            // });

            // Update task status to completed
            await this.dbAdapter.updateTask(task.id, {
                status: "completed",
                lastAttemptAt: new Date(),
            });

            console.log(`Task ${task.id} completed successfully.`);
        } catch (error) {
            console.error(`Task ${task.id} failed:`, error);

            // Update task status to failed
            await this.dbAdapter.updateTask(task.id, {
                status: "failed",
                lastAttemptAt: new Date(),
            });

            // TODO: Implement retry logic if necessary
        }

        return true;
    }
}