# @squirrel-scheduler/drizzle-adapter

Official Drizzle ORM adapter for SquirrelScheduler. This package provides a ready-to-use database adapter for SQLite databases using Drizzle ORM.

## Features

- **SQLite Support**: Works with any SQLite-compatible database (Turso, libSQL, better-sqlite3)
- **Type Safety**: Fully typed with TypeScript
- **Schema Management**: Includes Drizzle schema definitions for task tables
- **Migrations**: Ready-to-use migration files for setting up your database

## Installation

```bash
npm install @squirrel-scheduler/drizzle-adapter
```

Or with pnpm:

```bash
pnpm add @squirrel-scheduler/drizzle-adapter
```

## Usage

### 1. Set Up Database Schema

First, import and use the provided schema in your Drizzle configuration:

```typescript
import { taskSchema } from "@squirrel-scheduler/drizzle-adapter/schema";

// In your schema.ts file
export const schema = {
  ...taskSchema,
  // your other tables
};
```

### 2. Run Migrations

The adapter provides migration files to set up the required tables:

```typescript
import { migrate } from "@squirrel-scheduler/drizzle-adapter/migrations";

// In your migration script
await migrate(db);
```

### 3. Create and Use the Adapter

```typescript
import { SScheduler } from "@squirrel-scheduler/core";
import { SQLiteDrizzleAdapter } from "@squirrel-scheduler/drizzle-adapter";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

// Initialize your database client
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});
const db = drizzle(client);

// Create the adapter
const dbAdapter = SQLiteDrizzleAdapter(db);

// Use it with SquirrelScheduler
const scheduler = new SScheduler(dbAdapter);

// Now you can use the scheduler as normal
scheduler
  .add({
    payload: { type: "sendEmail", to: "user@example.com" },
    scheduledAt: new Date(Date.now() + 10_000),
  })
  .add({
    payload: { type: "generateReport", reportId: "abc123" },
    scheduledAt: new Date(Date.now() + 30_000),
  });

await scheduler.schedule();
```

## Schema Details

The adapter creates the following tables:

- `squirrel_tasks`: Stores the scheduled tasks
- `squirrel_sync`: Tracks synchronization metadata

```typescript
// Task table structure
interface Task {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  payload: JSONObject;
  scheduledAt: Date;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

## Examples

### With Turso (SQLite)

```typescript
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { SQLiteDrizzleAdapter } from "@squirrel-scheduler/drizzle-adapter";

const client = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN
});

const db = drizzle(client);
const adapter = SQLiteDrizzleAdapter(db);
```

### With better-sqlite3

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SQLiteDrizzleAdapter } from "@squirrel-scheduler/drizzle-adapter";

const sqlite = new Database("path/to/database.db");
const db = drizzle(sqlite);
const adapter = SQLiteDrizzleAdapter(db);
```

## Configuration

The adapter accepts optional configuration:

```typescript
const adapter = SQLiteDrizzleAdapter(db, {
  tableName: "custom_tasks_table", // Default: "squirrel_tasks"
  syncTableName: "custom_sync_table", // Default: "squirrel_sync"
  schema: customSchema // Optional: provide custom schema
});
```

## Migrations

To customize the migration process:

```typescript
import { migrate } from "@squirrel-scheduler/drizzle-adapter/migrations";

await migrate(db, {
  customTables: true, // If you're using custom table names
  force: false, // Set to true to force migration regardless of current state
});
```

## Contributing

We welcome contributions! Please feel free to submit a Pull Request.

## License

MIT

Happy scheduling! If you encounter any issues or have questions, please open an issue on GitHub.