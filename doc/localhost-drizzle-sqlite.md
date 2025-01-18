# Using SquirrelScheduler with SQLite + Drizzle (Localhost)

This example demonstrates how to set up SquirrelScheduler in a local environment using SQLite with the Drizzle ORM adapter.

## Setup

```typescript
import { SScheduler } from "@squirrel-scheduler/core"
import { SQLiteDrizzleAdapter } from "@squirrel-scheduler/drizzle-adapter"
import { drizzle } from "drizzle-orm/libsql"
import { createClient } from "@libsql/client"

// 1. Initialize Drizzle
const client = createClient({
    url: process.env.TURSO_DB_URL,
    authToken: process.env.TURSO_DB_TOKEN,
});
const db = drizzle(client);

// 2. Create an adapter
const dbAdapter = SQLiteDrizzleAdapter(db);

// 3. Create a scheduler instance
const scheduler = new SScheduler(dbAdapter);

// 4. Schedule tasks
(async () => {
    // Add tasks to be executed in the future
    scheduler
        .add({
            payload: { type: "sendEmail", to: "user@example.com" },
            scheduledAt: new Date(Date.now() + 10_000), // 10 seconds from now
        })
        .add({
            payload: { type: "generateReport", reportId: "abc123" },
            scheduledAt: new Date(Date.now() + 30_000), // 30 seconds from now
        });

    // Persist tasks
    await scheduler.schedule();

    // Later, call .sync() to execute tasks that are due
    // (You might do this on a setInterval or a CRON job if you're on a serverful environment)
    await scheduler.sync();
})();
```