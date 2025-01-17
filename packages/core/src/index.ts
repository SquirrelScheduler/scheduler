import {SDBAdapter, STask} from "./types";

export class SScheduler {

    private readonly workflow: Array<STask> = [];

    constructor(
        private readonly dbAdapter: SDBAdapter,
    ) {}

    add(task: STask): SScheduler {
        if (this.workflow.length > 0) {
            // this.workflow[this.workflow.length-1].nextTaskId = task.id;
        }
        this.workflow.push(task);
        return this;
    }

    async schedule() {
        return await this.dbAdapter
            .createTasks(
                this.workflow
            );
    }

    async sync() {

        // last time we did polling for this scheduler
        const lastSync = await this.dbAdapter
            .getLastSync();

        // list events from last timestamp to today
        const toExecuteTasks = await this.dbAdapter
            .listTasks({
                from: lastSync.timestamp,
                status: 'PENDING',
            });

        // claim those tasks so we do not re-execute them by mistake
        const inProgressTasks = await this.dbAdapter
            .claimTasks(toExecuteTasks);

        // for-each task, invoke it firing the http call to the endpoint, with body:
        // TODO: Should we fire events in paralel maybe with a p-queue instead using more of the band-width?
        // For now having small amount of tasks is fine like this
        for(const sTask of inProgressTasks) {

            // finish this
            const res = await fetch(sTask.url,{
                body: JSON.stringify(sTask.payload)
            })
        }

    }

}