import {
    SQLiteColumn,
    SQLiteTableWithColumns,
    integer,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core"

// Example domain types from your core package
import { STask } from "@squirrel-scheduler/core"

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
        url: DefaultSQLiteColumn<{
            dataType: "string"
            columnType: "SQLiteText"
            data: string
            notNull: true
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

// 3. Combine them in a single schema interface
export type DefaultSQLiteSchema = {
    tasksTable?: DefaultSQLiteTasksTable
    taskResultsTable?: DefaultSQLiteTaskResultsTable
    // Todo create a table to keep track of informations about the scheduler such as, last time it refreshed (sync) history of all syncs and number of task executed on each sync
    // syncHistoryTable?: DefaultSQLiteSyncHistoryTable
}

// 4. Provide default table definitions
export const defaultTasksTable = sqliteTable("squirrel_task", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    url: text("url").notNull(),
    payload: text("payload").notNull(),
    scheduledAt: integer("scheduledAt", { mode: "timestamp_ms" }).notNull(),
    status: text("status").$type<STask["status"]>().notNull(),
    retryCount: integer("retryCount").notNull().default(0),
    maxRetries: integer("maxRetries").notNull(),
    lastAttemptAt: integer("lastAttemptAt", { mode: "timestamp_ms" }),
    nextAttemptAt: integer("nextAttemptAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    metadata: text("metadata"),
}) satisfies DefaultSQLiteTasksTable

export const defaultTaskResultsTable = sqliteTable("squirrel_task_result", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    taskId: text("taskId")
        .notNull()
        .references(() => defaultTasksTable.id, { onDelete: "cascade" }),
    attemptedAt: integer("attemptedAt", { mode: "timestamp_ms" }).notNull(),
    statusCode: integer("statusCode").notNull(),
    response: text("response"),
    error: text("error"),
    duration: integer("duration").notNull(),
}) satisfies DefaultSQLiteTaskResultsTable

// 5. defineTables() merges user overrides, returning typed tables
export function defineTables(
    schema: DefaultSQLiteSchema = {}
): {
    tasksTable: DefaultSQLiteTasksTable
    taskResultsTable: DefaultSQLiteTaskResultsTable
} {
    return {
        tasksTable: schema.tasksTable ?? defaultTasksTable,
        taskResultsTable: schema.taskResultsTable ?? defaultTaskResultsTable,
    }
}
