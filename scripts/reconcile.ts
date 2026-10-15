/**
 * تطبیق دفتر کل (فاز ۳-۱) — روی دیتابیس واقعی ناوردایی‌ها را بررسی می‌کند.
 *   npx tsx scripts/reconcile.ts
 * خروجی صفر = سالم؛ غیرصفر = تعداد اختلاف.
 */
import 'dotenv/config';
import { pool } from '../src/db/index';
import { reconcileLedger } from '../src/server/services/wallet-ops';

async function main() {
  const result = await reconcileLedger();
  if (result.ok) {
    console.log('✔ دفتر کل سالم است — همهٔ ناوردایی‌ها برقرارند');
  } else {
    console.log(`✗ ${result.issues.length} اختلاف پیدا شد:`);
    for (const issue of result.issues) {
      console.log(`  • [${issue.check}] ${issue.detail}`);
    }
  }
  await pool.end();
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
