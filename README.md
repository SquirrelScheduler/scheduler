# SquirrelScheduler

A lightweight, flexible scheduling library for Node.js. Queue future tasks in **any** database, then poll and execute them at the right time.

## Overview

**SquirrelScheduler** offers:

1. A **simple API** to enqueue tasks (with optional chaining)
2. An **abstract interface** (`SDBAdapter`) to store tasks in **your** database
3. A **polling mechanism**: call `.sync()` to claim and execute due tasks
4. A built-in **Drizzle ORM adapter** for SQLite (using Turso or any SQLite-compatible DB)
5. Clean, composable code that you can adapt for other databases

## Why SquirrelScheduler?

- **Database-Agnostic**: Implement a single interface (`SDBAdapter`) to use MySQL, PostgreSQL, MongoDB, etc.
- **Extendable**: Add retry logic, exponential backoff, or concurrency
- **Lightweight**: No cron processes—just call `sync()` periodically (or on an interval) in your Node.js app

## Databases

Currently, we have a **Drizzle Adapter** that supports **SQLite**. Other databases **are not yet implemented**, but you can contribute or roll your own by following the `SDBAdapter` interface.

| Database   | Support                      |
|------------|------------------------------|
| SQLite     | **Yes** (via DrizzleAdapter) |
| MySQL      | Coming soon                  |
| PostgreSQL | Coming soon                  |
| SQL Server | Coming soon                  |
| MongoDB    | Coming soon                  |
| etc.       | We'd love contributions!     |

## Quick Start

### 1. Install

```bash
npm install @squirrel-scheduler/core
npm install @squirrel-scheduler/drizzle-adapter
```

### 2. Examples

#### Local Development
- [SQLite + Drizzle](./doc/localhost-drizzle-sqlite.md)
- [MySQL + Drizzle](./doc/localhost-drizzle-mysql.md) (Coming soon)
- [PostgreSQL + Drizzle](./doc/localhost-drizzle-postgres.md) (Coming soon)
- [MongoDB](./doc/localhost-mongodb.md) (Coming soon)

#### Cloudflare Workers
- [SQLite + Drizzle](./doc/cloudflare-schedule-drizzle-sqlite.md) (Coming soon)
- [MySQL + Drizzle](./doc/cloudflare-schedule-drizzle-mysql.md) (Coming soon)
- [PostgreSQL + Drizzle](./doc/cloudflare-schedule-drizzle-postgres.md) (Coming soon)
- [MongoDB](./doc/cloudflare-schedule-mongodb.md) (Coming soon)

#### AWS Lambda
- [SQLite + Drizzle](./doc/aws-cron-lambda-drizzle-sqlite.md) (Coming soon)
- [MySQL + Drizzle](./doc/aws-cron-lambda-drizzle-mysql.md) (Coming soon)
- [PostgreSQL + Drizzle](./doc/aws-cron-lambda-drizzle-postgres.md) (Coming soon)
- [MongoDB](./doc/aws-cron-lambda-mongodb.md) (Coming soon)

### 3. Running `sync()`

- The `.sync()` method fetches due tasks (based on `scheduledAt` and any `nextAttemptAt` logic), marks them as `in_progress`, and executes them sequentially (by default)
- Once a task is done, it's marked as `completed`. If it fails, it's either marked as `failed` or retried (depending on your configuration)

## Contributing

- **Database adapters** are welcome! If you'd like to create a MySQL or MongoDB adapter, check out how the Drizzle adapter is implemented, follow the `SDBAdapter` interface, and open a PR
- For feature requests, bug fixes, or general feedback, please open an issue on GitHub

## License

MIT License. See LICENSE for details.

**Enjoy scheduling with SquirrelScheduler**—no more crons or external queue servers required!