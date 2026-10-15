/**
 * چرخش کلیدهای رمزنگاری (فاز ۱-۷) — با کلید قدیمی رمزگشایی و با کلید جدید رمزنگاری می‌کند.
 *
 *   npx tsx scripts/rotate-keys.ts <NEW_DATA_ENCRYPTION_KEY> [--apply]
 *
 * NEW_DATA_ENCRYPTION_KEY باید ۳۲ بایت base64 باشد.
 * بدون --apply فقط گزارش می‌دهد (dry-run).
 *
 * ⚠ چرخش DATA_HASH_KEY توکن نشست‌ها و QR را باطل می‌کند؛ همه باید دوباره وارد شوند.
 * این اسکریپت فقط DATA_ENCRYPTION_KEY را می‌چرخاند.
 */
import 'dotenv/config';
import { db, pool } from '../src/db/index';
import { studentProfiles } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { encryptSecret, decryptSecret } from '../src/lib/crypto';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const newKey = args.find((a) => !a.startsWith('--'));
  if (!newKey) {
    console.error('استفاده: npx tsx scripts/rotate-keys.ts <NEW_KEY_BASE64> [--apply]');
    process.exit(1);
  }
  if (Buffer.from(newKey, 'base64').length !== 32) {
    console.error('کلید جدید باید ۳۲ بایت base64 باشد');
    process.exit(1);
  }

  process.env.DATA_ENCRYPTION_KEY__OLD = process.env.DATA_ENCRYPTION_KEY ?? '';
  process.env.DATA_ENCRYPTION_KEY = newKey;

  const students = await db.select().from(studentProfiles);
  let ok = 0;
  let fail = 0;

  console.log(`▶ ${apply ? 'اعمال' : 'dry-run'} چرخش کلید برای ${students.length} دانشجو …`);
  for (const sp of students) {
    try {
      const raw = decryptSecret(sp.nationalCode); // با کلید قدیمی (در crypto.ts از env خوانده می‌شود)
      const reEncrypted = encryptSecretWith(raw, newKey);
      if (apply) {
        await db.update(studentProfiles)
          .set({ nationalCode: reEncrypted, updatedAt: new Date() })
          .where(eq(studentProfiles.id, sp.id));
      }
      ok += 1;
    } catch {
      fail += 1;
      console.error(`  ✗ رمزگشایی ناموفق: ${sp.studentNumber}`);
    }
  }
  console.log(`✔ موفق: ${ok} — ناموفق: ${fail}`);
  if (!apply) console.log('برای اعمال واقعی، --apply اضافه کنید.');
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

/** رمزنگاری با کلید مشخص — مستقل از env جاری */
function encryptSecretWith(plain: string, newKeyB64: string): string {
  const saved = process.env.DATA_ENCRYPTION_KEY;
  process.env.DATA_ENCRYPTION_KEY = newKeyB64;
  try {
    return encryptSecret(plain);
  } finally {
    if (saved !== undefined) process.env.DATA_ENCRYPTION_KEY = saved;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });