import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
/** Transaction ou base : les fonctions d'écriture acceptent les deux. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

type Holder = { sql: postgres.Sql; db: Db };
const globalKey = Symbol.for("jobhunt.db");
const g = globalThis as unknown as Record<symbol, Holder | undefined>;

/** Singleton global : évite de multiplier les pools lors des rechargements à chaud de Next. */
export function getDb(): Db {
  let holder = g[globalKey];
  if (!holder) {
    const sql = postgres(env().DATABASE_URL, {
      max: env().DATABASE_POOL_MAX,
      idle_timeout: 30,
      onnotice: () => {},
    });
    holder = { sql, db: drizzle(sql, { schema }) };
    g[globalKey] = holder;
  }
  return holder.db;
}

export async function closeDb(): Promise<void> {
  const holder = g[globalKey];
  if (!holder) return;
  g[globalKey] = undefined;
  await holder.sql.end({ timeout: 5 });
}

export async function pingDb(): Promise<boolean> {
  try {
    getDb();
    const holder = g[globalKey];
    if (!holder) return false;
    await holder.sql`select 1`;
    return true;
  } catch {
    return false;
  }
}
