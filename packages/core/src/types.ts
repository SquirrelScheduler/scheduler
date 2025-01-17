// packages/core/src/types.ts
export interface STask {
    id: string
    url: string
    payload: unknown
    scheduledAt: number
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
    retryCount: number
    maxRetries: number
    lastAttemptAt?: number
    nextAttemptAt?: number
    createdAt: number
    updatedAt: number
    metadata?: unknown
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
    from: number
    to?: number
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
    recordTaskAttempt(taskId: string, result: TaskAttemptResult): Promise<void>
    pruneTasks(params: PruneTasksParams): Promise<number>
    getStats(): Promise<{
        pending: number
        inProgress: number
        completed: number
        failed: number
        totalTasks: number
    }>
    getLastSync():Promise<{
        timestamp:number,
        totalTasks:number,
    }>
}

export type Awaitable<T> = Promise<T>;