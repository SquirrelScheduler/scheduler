// tests/SScheduler.test.ts

import {describe, it, expect, beforeEach, vi, MockedFunction} from "vitest";
import { SDBAdapter, STask } from "../lib/types";
import {SScheduler} from "../lib/SScheduler";

// Example: mocking orThrow from ../src/utils/general
// If you want to use the real 'orThrow', just remove this mock.
vi.mock("../src/utils/general", () => ({
    orThrow: vi.fn((val: unknown, msg: string) => {
        if (val === null || val === undefined) throw new Error(msg);
        return val;
    }),
}));

// A helper to create fake tasks
function createFakeTask(overrides: Partial<STask> = {}): STask {
    return {
        id: "task-123",
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
        payload: { foo: "bar" },
        scheduledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAttemptAt: null,
        nextAttemptAt: null,
        nextTaskId: undefined,
        metadata: undefined,
        ...overrides,
    };
}

describe("SScheduler", () => {
    let dbAdapterMock: Mocked<SDBAdapter>; // We'll convert this to a Vitest-friendly mock type

    // In Vitest, we can define a "mocked" type similarly:
    type Mocked<T> = {
      [P in keyof T]: T[P] extends (...args: any[]) => any
        ? MockedFunction<T[P]>
        : T[P];
    };

    // We'll define it inline for simplicity:
    beforeEach(() => {
        dbAdapterMock = {
            createTask:   vi.fn(),
            createTasks:  vi.fn(),
            getTask:      vi.fn(),
            listTasks:    vi.fn(),
            updateTask:   vi.fn(),
            claimTasks:   vi.fn(),
            setLastSync:  vi.fn(),
            recordTaskAttempt: vi.fn(),
            pruneTasks:   vi.fn(),
            getLastSync:  vi.fn(),
        } as any; // Casting as any for convenience (or define a proper "Mocked" type above)
    });

    describe("constructor", () => {
        it("should instantiate with default config", () => {
            const scheduler = new SScheduler(dbAdapterMock);
            expect(scheduler).toBeInstanceOf(SScheduler);
            // Not much else to check for a constructor using private properties
        });
    });

    describe("add()", () => {
        it("should add a task with default values to the workflow", () => {
            const scheduler = new SScheduler(dbAdapterMock);
            const now = new Date();

            scheduler.add({
                payload: { hello: "world" },
                scheduledAt: now,
            });

            // The "workflow" is private, so we can't directly read it.
            // Instead, we can rely on the next operation (schedule) or
            // we could cast to `any` if we really want to peek inside:

            const internalWorkflow = (scheduler as any).workflow as STask[];
            expect(internalWorkflow).toHaveLength(1);
            expect(internalWorkflow[0].payload).toEqual({ hello: "world" });
            expect(internalWorkflow[0].scheduledAt).toEqual(now);
            expect(internalWorkflow[0].status).toBe("pending");
        });

        it("should chain tasks (set nextTaskId) for subsequent add calls", () => {
            const scheduler = new SScheduler(dbAdapterMock);
            const date1 = new Date();
            const date2 = new Date(Date.now() + 60000);

            scheduler.add({ payload: { step: 1 }, scheduledAt: date1 });
            scheduler.add({ payload: { step: 2 }, scheduledAt: date2 });

            const internalWorkflow = (scheduler as any).workflow as STask[];
            expect(internalWorkflow[0].nextTaskId).toBe(internalWorkflow[1].id);
            expect(internalWorkflow[1].nextTaskId).toBeUndefined();
        });

        it("should throw if required fields are missing", () => {
            const scheduler = new SScheduler(dbAdapterMock);
            expect(() => scheduler.add({ payload: null as any, scheduledAt: new Date() }))
                .toThrowError(/payload is required/i);
            expect(() => scheduler.add({ payload: { test: true }, scheduledAt: null as any }))
                .toThrowError(/scheduledAt is required/i);
        });
    });

    describe("schedule()", () => {
        it("should return an empty array if workflow is empty", async () => {
            const scheduler = new SScheduler(dbAdapterMock);

            const result = await scheduler.schedule();
            expect(result).toEqual([]);
            expect(dbAdapterMock.createTasks).not.toHaveBeenCalled();
        });

        it("should call createTasks with correct data", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            const now = new Date();

            scheduler.add({ payload: { test: true }, scheduledAt: now });
            scheduler.add({ payload: { test: false }, scheduledAt: now });

            const fakeCreatedTasks = [
                createFakeTask({ id: "task1" }),
                createFakeTask({ id: "task2" }),
            ];
            dbAdapterMock.createTasks.mockResolvedValue(fakeCreatedTasks);

            const scheduledTasks = await scheduler.schedule();
            expect(dbAdapterMock.createTasks).toHaveBeenCalledTimes(1);

            // The createTasks method's first argument
            const callArgs = dbAdapterMock.createTasks.mock.calls[0][0];
            expect(callArgs).toHaveLength(2);
            expect(callArgs[0]).toMatchObject({ payload: { test: true } });
            expect(callArgs[1]).toMatchObject({ payload: { test: false } });
            expect(scheduledTasks).toEqual(fakeCreatedTasks);
        });

        it("should throw an enhanced error if createTasks fails", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            scheduler.add({ payload: { foo: "bar" }, scheduledAt: new Date() });

            const originalError = new Error("DB insert failed");
            dbAdapterMock.createTasks.mockRejectedValue(originalError);

            await expect(scheduler.schedule()).rejects.toThrowError(
                /Failed to schedule 1 tasks: DB insert failed/i
            );
        });
    });

    describe("sync()", () => {
        it("should return an empty array if isProcessing = true", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            (scheduler as any).isProcessing = true; // force the private variable

            const result = await scheduler.sync();
            expect(result).toEqual([]);
            expect(dbAdapterMock.getLastSync).not.toHaveBeenCalled();
        });

        it("should return an empty array if no pending tasks", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            dbAdapterMock.getLastSync.mockResolvedValue({ timestamp: 0, totalTasks: 0 });
            dbAdapterMock.listTasks.mockResolvedValue([]);

            const result = await scheduler.sync();
            expect(result).toEqual([]);
            expect(dbAdapterMock.getLastSync).toHaveBeenCalledTimes(1);
            expect(dbAdapterMock.listTasks).toHaveBeenCalledTimes(1);
        });

        it.skip("should only claim tasks that are due (scheduled in the past)", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            dbAdapterMock.getLastSync.mockResolvedValue({ timestamp: 0, totalTasks: 0 });

            const dueTask = createFakeTask({
                id: "due-task",
                scheduledAt: new Date(Date.now() - 5000),
            });
            const futureTask = createFakeTask({
                id: "future-task",
                scheduledAt: new Date(Date.now() + 100000),
            });

            dbAdapterMock.listTasks.mockResolvedValueOnce([dueTask, futureTask]);
            dbAdapterMock.claimTasks.mockResolvedValueOnce([dueTask]);
            dbAdapterMock.setLastSync.mockResolvedValue(undefined);

            const result = await scheduler.sync();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("due-task");
            expect(dbAdapterMock.claimTasks).toHaveBeenCalledWith([dueTask]);
        });

        it("should break if claimedTasks is empty (another process claimed them)", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            dbAdapterMock.getLastSync.mockResolvedValue({ timestamp: 0, totalTasks: 0 });

            const someTask = createFakeTask({ id: "someTask" });
            dbAdapterMock.listTasks.mockResolvedValueOnce([someTask]);
            dbAdapterMock.claimTasks.mockResolvedValueOnce([]); // No tasks ended up claimed
            dbAdapterMock.setLastSync.mockResolvedValue(undefined);

            const result = await scheduler.sync();
            expect(result).toEqual([]);
            expect(dbAdapterMock.listTasks).toHaveBeenCalledTimes(1);
        });

        it("should keep looping for multiple batches", async () => {
            const scheduler = new SScheduler(dbAdapterMock, { batchSize: 2 });
            dbAdapterMock.getLastSync.mockResolvedValue({ timestamp: 0, totalTasks: 0 });

            const taskA = createFakeTask({ id: "taskA" });
            const taskB = createFakeTask({ id: "taskB" });
            const taskC = createFakeTask({ id: "taskC" });

            // Mock the batches
            dbAdapterMock.listTasks
                .mockResolvedValueOnce([taskA, taskB]) // first batch
                .mockResolvedValueOnce([taskC])       // second batch
                .mockResolvedValueOnce([]);           // third => break

            dbAdapterMock.claimTasks
                .mockResolvedValueOnce([taskA, taskB])
                .mockResolvedValueOnce([taskC]);

            dbAdapterMock.setLastSync.mockResolvedValue(undefined);

            const executed = await scheduler.sync();
            expect(executed).toEqual([taskA, taskB, taskC]);
            expect(dbAdapterMock.listTasks).toHaveBeenCalledTimes(3);
            expect(dbAdapterMock.claimTasks).toHaveBeenCalledTimes(2);
            // setLastSync is called once per batch that actually claims tasks
            expect(dbAdapterMock.setLastSync).toHaveBeenCalledTimes(2);
        });

        it("should throw if an error occurs in the sync process", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            dbAdapterMock.getLastSync.mockResolvedValue({ timestamp: 0, totalTasks: 0 });
            dbAdapterMock.listTasks.mockRejectedValueOnce(new Error("DB error"));

            await expect(scheduler.sync()).rejects.toThrow("DB error");
            // After error, isProcessing should revert to false
            expect((scheduler as any).isProcessing).toBe(false);
        });
    });

    describe.skip("Task Execution Integration (via sync)", () => {
        it("should mark task as completed if executeTask succeeds", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            dbAdapterMock.getLastSync.mockResolvedValue({ timestamp: 0, totalTasks: 0 });

            const taskToExecute = createFakeTask({ id: "task-complete" });
            dbAdapterMock.listTasks.mockResolvedValueOnce([taskToExecute]);
            dbAdapterMock.claimTasks.mockResolvedValueOnce([taskToExecute]);
            dbAdapterMock.setLastSync.mockResolvedValue(undefined);
            // Mock updateTask to reflect success
            dbAdapterMock.updateTask.mockResolvedValue({
                ...taskToExecute,
                status: "completed",
            });

            dbAdapterMock.recordTaskAttempt.mockResolvedValue(undefined);

            const executed = await scheduler.sync();
            expect(executed).toHaveLength(1);
            expect(executed[0].id).toBe("task-complete");

            expect(dbAdapterMock.updateTask).toHaveBeenCalledWith(
                "task-complete",
                expect.objectContaining({ status: "completed" })
            );
            expect(dbAdapterMock.recordTaskAttempt).toHaveBeenCalledTimes(1);
        });

        it("should mark task as failed or pending if executeTask throws", async () => {
            const scheduler = new SScheduler(dbAdapterMock);
            dbAdapterMock.getLastSync.mockResolvedValue({ timestamp: 0, totalTasks: 0 });

            const failingTask = createFakeTask({ id: "task-fail", maxRetries: 1 });
            dbAdapterMock.listTasks.mockResolvedValueOnce([failingTask]);
            dbAdapterMock.claimTasks.mockResolvedValueOnce([failingTask]);
            dbAdapterMock.setLastSync.mockResolvedValue(undefined);

            // Mock updateTask => assume the DB is updated accordingly
            dbAdapterMock.updateTask.mockResolvedValue({
                ...failingTask,
                status: "failed",
                retryCount: 1,
            });
            dbAdapterMock.recordTaskAttempt.mockResolvedValue(undefined);

            await expect(scheduler.sync()).rejects.toThrow("Simulated error");

            // After error, isProcessing should revert to false
            expect((scheduler as any).isProcessing).toBe(false);

            // The failing task should have been updated
            expect(dbAdapterMock.updateTask).toHaveBeenCalledWith(
                "task-fail",
                expect.objectContaining({
                    status: "failed", // because newRetryCount=1, maxRetries=1 => it fails
                    retryCount: 1,
                })
            );
            expect(dbAdapterMock.recordTaskAttempt).toHaveBeenCalledWith(
                "task-fail",
                expect.objectContaining({
                    statusCode: 500,
                    error: "Simulated error",
                })
            );
        });
    });
});
