/**
 * علامت‌گذاری NO_SHOW (فاز ۳-۳) — برای زمان‌بندی دوره‌ای (cron).
 *   npx tsx scripts/mark-no-show.ts
 */
import 'dotenv/config';
import { pool } from '../src/db/index';
import { markNoShowReservations } from '../src/server/services/wallet-ops';

async function main() {
  const { updated } = await markNoShowReservations();
  console.log(`✔ ${updated} رزرو استفاده‌نشده به NO_SHOW علامت خورد`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
