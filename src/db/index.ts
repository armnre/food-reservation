import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

/** تنظیمات pool — از env قابل تنظیم است */
function poolConfig() {
  return {
    connectionString: databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10_000),
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15_000),
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  };
}

const globalForDb = globalThis as typeof globalThis & {
  __hamsofrePgPool?: Pool;
};

export const pool =
  globalForDb.__hamsofrePgPool ??
  new Pool(poolConfig());

if (process.env.NODE_ENV !== "production") {
  globalForDb.__hamsofrePgPool = pool;
}

export const db = drizzle(pool);
