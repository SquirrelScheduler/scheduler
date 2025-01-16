import {STask} from "../types/STask";
import {SDBAdapter} from "./database-adapter";

export class SScheduler {

    private readonly workflow: Array<STask> = [];

    constructor(
        private readonly dbAdapter: SDBAdapter,
    ) {}

    add(task: STask): SScheduler {
        if (this.workflow.length > 0) {
            this.workflow[this.workflow.length-1].nextTaskId = task.id;
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

    sync() {
        // list events from last timestamp to today
    }

}