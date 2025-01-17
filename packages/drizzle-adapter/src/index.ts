// drizzle adapter
// 1. factory method among sqlite/mysql/pg to different table definition
// For each db type, implement the required queries (required by SDBAdapter)

/**
 * <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16}}>
 *  <p>Official <a href="https://orm.drizzle.team">Drizzle ORM</a> adapter for Auth.js / NextAuth.js.</p>
 *  <a href="https://orm.drizzle.team">
 *   <img style={{display: "block"}} src="/img/adapters/drizzle.svg" width="38" />
 *  </a>
 * </div>
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install drizzle-orm @auth/drizzle-adapter
 * npm install drizzle-kit --save-dev
 * ```
 *
 * @module @auth/drizzle-adapter
 */

import { is } from "drizzle-orm"
import { MySqlDatabase } from "drizzle-orm/mysql-core"
import { PgDatabase } from "drizzle-orm/pg-core"
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { DefaultSQLiteSchema, SQLiteDrizzleAdapter } from "./lib/sqlite"
import { SDBAdapter } from "@squirrel-scheduler/core"
import {DefaultSchema, SqlFlavorOptions} from "./lib/utils";


export function SquirrelDrizzleAdapter<SqlFlavor extends SqlFlavorOptions>(
    db: SqlFlavor,
    schema?: DefaultSchema<SqlFlavor>
): SDBAdapter {
    if (is(db, MySqlDatabase)) {
        throw new Error("MySQL is not supported yet in Drizzle adapter.")
    } else if (is(db, PgDatabase)) {
        throw new Error("PostgreSQL is not supported yet in Drizzle adapter.")
    } else if (is(db, BaseSQLiteDatabase)) {
        return SQLiteDrizzleAdapter(db, schema as DefaultSQLiteSchema)
    }

    throw new Error(
        `Unsupported database type (${typeof db}) in Drizzle adapter.`
    )
}