import {
    BaseSQLiteDatabase,
    integer,
    SQLiteColumn,
    sqliteTable,
    SQLiteTableWithColumns,
    text,
} from "drizzle-orm/sqlite-core"
import {and, desc, eq, gte, inArray, lt} from "drizzle-orm";

// Example domain types from your core package
import {SDBAdapter, STask} from "@squirrel-scheduler/core"
import {ListTasksParams, PruneTasksParams, TaskAttemptResult} from "@squirrel-scheduler/core/src/types";

// 1. Define a reusable "DefaultSQLiteColumn" type
type DefaultSQLiteColumn<
    T extends {
        data: string | number | boolean | Date
        dataType: "string" | "number" | "boolean" | "date"
        notNull: boolean
        isPrimaryKey?: boolean
        columnType: "SQLiteText" | "SQLiteInteger" | "SQLiteBoolean" | "SQLiteTimestamp"
    },
> = SQLiteColumn<{
    name: string
    isAutoincrement: boolean
    isPrimaryKey: T["isPrimaryKey"] extends true ? true : false
    hasRuntimeDefault: boolean
    generated: unknown // can refine if needed
    columnType: T["columnType"]
    data: T["data"]
    driverParam: string | number | boolean
    notNull: T["notNull"]
    hasDefault: boolean
    enumValues: any
    dataType: T["dataType"]
    tableName: string
}>

// 2. Define typed interfaces for each table with columns
export type DefaultSQLiteTasksTable = SQLiteTableWithColumns<{
    name: string
    columns: {
        id: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: true
            isPrimaryKey: true
        }>
        payload: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: true
        }>
        scheduledAt: DefaultSQLiteColumn<{
            dataType: "date"
            columnType: "SQLiteTimestamp"
            data: Date | number
            notNull: true
        }>
        status: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: STask["status"]
            notNull: true
        }>
        retryCount: DefaultSQLiteColumn<{
            dataType: "number"
            columnType: "SQLiteInteger"
            data: number
            notNull: true
        }>
        maxRetries: DefaultSQLiteColumn<{
            dataType: "number"
            columnType: "SQLiteInteger"
            data: number
            notNull: true
        }>
        lastAttemptAt: DefaultSQLiteColumn<{
            dataType: "date"
            columnType: "SQLiteTimestamp"
            data: Date | number
            notNull: false
        }>
        nextAttemptAt: DefaultSQLiteColumn<{
            dataType: "date"
            columnType: "SQLiteTimestamp"
            data: Date | number
            notNull: false
        }>
        createdAt: DefaultSQLiteColumn<{
            dataType: "date"
            columnType: "SQLiteTimestamp"
            data: Date | number
            notNull: true
        }>
        updatedAt: DefaultSQLiteColumn<{
            dataType: "date"
            columnType: "SQLiteTimestamp"
            data: Date | number
            notNull: true
        }>
        metadata: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: false
        }>
    }
    dialect: "sqlite"
    schema: string | undefined
}>

export type DefaultSQLiteTaskResultsTable = SQLiteTableWithColumns<{
    name: string
    columns: {
        id: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: true
            isPrimaryKey: true
        }>
        taskId: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: true
        }>
        attemptedAt: DefaultSQLiteColumn<{
            dataType: "date"
            columnType: "SQLiteTimestamp"
            data: Date | number
            notNull: true
        }>
        statusCode: DefaultSQLiteColumn<{
            dataType: "number"
            columnType: "SQLiteInteger"
            data: number
            notNull: true
        }>
        response: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: false
        }>
        error: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: false
        }>
        duration: DefaultSQLiteColumn<{
            dataType: "number"
            columnType: "SQLiteInteger"
            data: number
            notNull: true
        }>
    }
    dialect: "sqlite"
    schema: string | undefined
}>

export type DefaultSQLiteSyncHistoryTable = SQLiteTableWithColumns<{
    name: string
    columns: {
        id: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: true
            isPrimaryKey: true
        }>
        timestamp: DefaultSQLiteColumn<{
            dataType: "date"
            columnType: "SQLiteTimestamp"
            data: Date | number
            notNull: true
        }>
        totalTasks: DefaultSQLiteColumn<{
            dataType: "number"
            columnType: "SQLiteInteger"
            data: number
            notNull: true
        }>
    }
    dialect: "sqlite"
    schema: string | undefined
}>

// 3. Combine them in a single schema interface
export type DefaultSQLiteSchema = {
    tasksTable?: DefaultSQLiteTasksTable
    taskResultsTable?: DefaultSQLiteTaskResultsTable
    syncHistoryTable?: DefaultSQLiteSyncHistoryTable
}

// 4. Provide default table definitions
export const defaultTasksTable = sqliteTable("squirrel_task", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

    payload: text("payload").notNull(),

    scheduledAt: integer("scheduledAt", {mode: "timestamp_ms"}).notNull(),
    status: text("status").$type<STask["status"]>().notNull(),
    retryCount: integer("retryCount").notNull().default(0),
    maxRetries: integer("maxRetries").notNull(),
    lastAttemptAt: integer("lastAttemptAt", {mode: "timestamp_ms"}),
    nextAttemptAt: integer("nextAttemptAt", {mode: "timestamp_ms"}),
    createdAt: integer("createdAt", {mode: "timestamp_ms"})
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", {mode: "timestamp_ms"})
        .notNull()
        .$defaultFn(() => new Date()),
    metadata: text("metadata"),
}) satisfies DefaultSQLiteTasksTable

export const defaultTaskResultsTable = sqliteTable("squirrel_task_result", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    taskId: text("taskId")
        .notNull()
        .references(() => defaultTasksTable.id, {onDelete: "cascade"}),
    attemptedAt: integer("attemptedAt", {mode: "timestamp_ms"}).notNull(),
    statusCode: integer("statusCode").notNull(),
    response: text("response"),
    error: text("error"),
    duration: integer("duration").notNull(),
}) satisfies DefaultSQLiteTaskResultsTable

export const defaultSyncHistoryTable = sqliteTable("squirrel_sync_history", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    timestamp: integer("timestamp", {mode: "timestamp_ms"}).notNull(),
    totalTasks: integer("totalTasks").notNull(),
}) satisfies DefaultSQLiteSyncHistoryTable

// 5. defineTables() merges user overrides, returning typed tables
export function defineTables(
    schema: DefaultSQLiteSchema = {}
): {
    tasksTable: DefaultSQLiteTasksTable
    taskResultsTable: DefaultSQLiteTaskResultsTable,
    syncHistoryTable: DefaultSQLiteSyncHistoryTable
} {
    return {
        tasksTable: schema.tasksTable ?? defaultTasksTable,
        taskResultsTable: schema.taskResultsTable ?? defaultTaskResultsTable,
        syncHistoryTable: schema.syncHistoryTable ?? defaultSyncHistoryTable,
    }
}

// sqlite.ts (continued)

export function SQLiteDrizzleAdapter(
    client: BaseSQLiteDatabase<"sync" | "async", any, any>,
    schema?: DefaultSQLiteSchema
): SDBAdapter {
    const { tasksTable, taskResultsTable, syncHistoryTable } = defineTables(schema);

    return {
        async claimTasks(tasks: STask[]) {
            const ids = tasks.map((task) => task.id);
            await client
                .update(tasksTable)
                .set({ status: "in_progress" })
                .where(and(inArray(tasksTable.id, ids), eq(tasksTable.status, "pending")));

            return await client
                .select()
                .from(tasksTable)
                .where(and(inArray(tasksTable.id, ids), eq(tasksTable.status, "in_progress")))
                .execute();
        },

        async createTask(
            data: Omit<STask, "id" | "status" | "retryCount" | "createdAt" | "updatedAt">
        ) {
            const result = await client
                .insert(tasksTable)
                .values({
                    payload: JSON.stringify(data.payload),
                    scheduledAt: data.scheduledAt,
                    maxRetries: data.maxRetries,
                    // ... add nextTaskId or metadata if needed
                    nextTaskId: data.nextTaskId,
                    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
                    status: "pending",
                    retryCount: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return result[0];
        },

        async createTasks(
            data: Array<Omit<STask, "id" | "status" | "retryCount" | "createdAt" | "updatedAt">>
        ) {
            const results = await client
                .insert(tasksTable)
                .values(
                    data.map((task) => ({
                        // Removed: url: task.url,
                        payload: JSON.stringify(task.payload),
                        scheduledAt: task.scheduledAt,
                        maxRetries: task.maxRetries,
                        nextTaskId: task.nextTaskId,
                        metadata: task.metadata ? JSON.stringify(task.metadata) : null,
                        status: "pending",
                        retryCount: 0,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }))
                )
                .returning();
            return results;
        },

        async getLastSync() {
            const result = await client
                .select()
                .from(syncHistoryTable)
                .orderBy(desc(syncHistoryTable.timestamp))
                .limit(1)
                .execute();

            if (Array.isArray(result) && result.length > 0) {
                return result[0] as any;
            }

            if (result) {
                return result;
            }

            return {
                timestamp: 0,
                totalTasks: 0,
            };
        },

        async getTask(id: string) {
            const task = await client
                .select()
                .from(tasksTable)
                .where(eq(tasksTable.id, id))
                .limit(1)
                .execute();

            return task[0];
        },

        async listTasks(params: ListTasksParams) {
            const { limit, offset, status, from, to } = params;
            const conditions = [];

            if (status) conditions.push(eq(tasksTable.status, status));
            if (from) {
                conditions.push(gte(tasksTable.scheduledAt, from));
            }
            if (to) conditions.push(lt(tasksTable.scheduledAt, to));

            return await client
                .select()
                .from(tasksTable)
                .where(and(...conditions))
                .orderBy(desc(tasksTable.scheduledAt))
                .limit(limit)
                .offset(offset)
                .execute();
        },

        async pruneTasks(params: PruneTasksParams) {
            const { olderThan, status } = params;
            const conditions = [];
            if (status) conditions.push(eq(tasksTable.status, status));
            if (olderThan) conditions.push(lt(tasksTable.updatedAt, olderThan));
            const result = await client.delete(tasksTable).where(and(...conditions)).returning();
            return result.length;
        },

        async setLastSync(at?: Date, args?: { totalTasks: number }) {
            return client.insert(syncHistoryTable).values({
                id: crypto.randomUUID(),
                timestamp: at ?? new Date(),
                totalTasks: args?.totalTasks ?? 0,
            });
        },

        async recordTaskAttempt(taskId: string, result: TaskAttemptResult) {
            return client.insert(taskResultsTable).values({
                id: crypto.randomUUID(),
                taskId,
                attemptedAt: new Date(),
                statusCode: result.statusCode,
                response: result.response || null,
                error: result.error || null,
                duration: result.duration,
            });
        },

        async updateTask(taskId: string, update: Partial<Omit<STask, "id">>) {
            // If your payload changed, ensure JSON stringifying if needed.
            const updatePayload: Partial<Record<string, unknown>> = { updatedAt: new Date() };
            if (typeof update.payload !== "undefined") {
                updatePayload.payload = JSON.stringify(update.payload);
            }
            if (typeof update.metadata !== "undefined") {
                updatePayload.metadata =
                    update.metadata !== null ? JSON.stringify(update.metadata) : null;
            }

            // Add other fields (like status, nextAttemptAt, etc.)
            if (typeof update.status !== "undefined") {
                updatePayload.status = update.status;
            }
            if (typeof update.retryCount !== "undefined") {
                updatePayload.retryCount = update.retryCount;
            }
            if (typeof update.lastAttemptAt !== "undefined") {
                updatePayload.lastAttemptAt = update.lastAttemptAt;
            }
            if (typeof update.nextAttemptAt !== "undefined") {
                updatePayload.nextAttemptAt = update.nextAttemptAt;
            }
            if (typeof update.maxRetries !== "undefined") {
                updatePayload.maxRetries = update.maxRetries;
            }
            if (typeof update.nextTaskId !== "undefined") {
                updatePayload.nextTaskId = update.nextTaskId;
            }

            await client.update(tasksTable).set(updatePayload).where(eq(tasksTable.id, taskId));

            const updatedTask = await client
                .select()
                .from(tasksTable)
                .where(eq(tasksTable.id, taskId))
                .limit(1)
                .execute();

            return updatedTask[0];
        },
    };
}


// 02-11