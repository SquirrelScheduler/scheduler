// packages/core/src/types.ts
export interface STask {
    id: string;
    payload: unknown;
    scheduledAt: number | Date;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    retryCount: number;
    maxRetries: number;
    lastAttemptAt?: number | Date;
    nextAttemptAt?: number | Date;
    createdAt: number | Date;
    updatedAt: number | Date;
    metadata?: unknown;
    nextTaskId?: string;
}

export interface TaskAttemptResult {
    taskId: string
    attemptedAt: number
    statusCode: number
    response?: string
    error?: string
    duration: number
}

export interface ListTasksParams {
    from: Date
    to?: Date
    status?: STask['status']
    limit?: number
    offset?: number
}

export interface PruneTasksParams {
    status: STask['status']
    olderThan: number
}

export interface SDBAdapter {
    createTask(data: Omit<STask, 'id'|'status'|'retryCount'|'createdAt'|'updatedAt'>): Promise<STask>
    createTasks(data: Array<Omit<STask, 'id'|'status'|'retryCount'|'createdAt'|'updatedAt'>>): Promise<STask[]>
    getTask(id: string): Promise<STask | null>
    listTasks(params: ListTasksParams): Promise<STask[]>
    updateTask(taskId: string, update: Partial<Omit<STask, 'id'>>): Promise<STask>
    claimTasks(tasks: STask[]): Promise<STask[]>
    setLastSync(at?:Date,args?:{
        totalTasks: number
    }): Promise<void>
    recordTaskAttempt(taskId: string, result: TaskAttemptResult): Promise<void>
    pruneTasks(params: PruneTasksParams): Promise<number>
    getLastSync():Promise<{
        timestamp: number | Date,
        totalTasks: number | Date,
    }>
}