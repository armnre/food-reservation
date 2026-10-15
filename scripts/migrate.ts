/**
 * اجرای migrationهای نسخه‌دار روی دیتابیس.
 *   npx tsx scripts/migrate.ts
 *
 * فایل‌های SQL در پوشهٔ drizzle/ به ترتیب journal اعمال می‌شوند.
 * برای محیط تمیز: npx drizzle-kit generate سپس این اسکریپت.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL تنظیم نشده است');

  const folder = path.resolve(process.cwd(), 'drizzle');
  if (!fs.existsSync(path.join(folder, 'meta', '_journal.json'))) {
    throw new Error('پوشهٔ drizzle/migrations یافت نشد — ابتدا npx drizzle-kit generate را اجرا کنید');
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  console.log('▶ اعمال migrationها …');
  await migrate(db, { migrationsFolder: folder });
  console.log('✔ migrationها با موفقیت اعمال شدند');
  await pool.end();
}

main().catch((e) => {
  console.error('خطا در migrate:', e);
  process.exit(1);
});
