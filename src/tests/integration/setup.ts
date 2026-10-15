/**
 * راه‌اندازی تست یکپارچه (فاز ۲) — دیتابیس تمیز + migration واقعی برای هر فایل تست.
 * هرگز به دیتابیس تولید وصل نمی‌شود؛ نام دیتابیس تست همیشه hamsofre_test است.
 */
import { randomBytes } from 'node:crypto';

// NODE_ENV=test را خود vitest تنظیم می‌کند
process.env.TZ = 'Asia/Tehran';
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.DATA_HASH_KEY = randomBytes(32).toString('base64');
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/hamsofre_test';
process.env.REDIS_URL = 'redis://127.0.0.1:1'; // بدون Redis — رد فوری و fallback حافظه
process.env.TRUSTED_PROXY_HOPS = '0';

async function init() {
  const { Client } = await import('pg');
  const admin = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS hamsofre_test WITH (FORCE)');
  await admin.query('CREATE DATABASE hamsofre_test');
  await admin.end();

  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  await pool.end();
}

await init();
process.env.ARGON2_MEMORY_COST = '1024';
process.env.ARGON2_TIME_COST = '1';
process.env.KV_DRIVER = 'memory';
