/**
 * Seed — فقط در محیط توسعه.
 * اجرای این اسکریپت در production ممنوع است.
 *
 *   npm run db:seed
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { db } from './index';
import {
  users, studentProfiles, staffProfiles, systemSettings,
} from './schema';
import { eq, sql } from 'drizzle-orm';
import { hash } from 'argon2';
import { encryptSecret, blindIndex } from '../lib/crypto';
import { isValidNationalCode, normalizeNationalCode } from '../lib/validation';

/** کد ملی معتبر بر اساس الگوریتم رقم کنترلی */
function makeNationalCode(seed: number): string {
  const base = String(10000000 + (seed % 89999999)).padStart(9, '0').slice(0, 9);
  const digits = base.split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (10 - i), 0);
  const rem = sum % 11;
  const check = rem < 2 ? rem : 11 - rem;
  const code = `${base}${check}`;
  if (!isValidNationalCode(code)) throw new Error(`کد ملی ساخته‌شده نامعتبر است: ${code}`);
  return code;
}

const FIRST_NAMES = ['علی', 'مریم', 'حسین', 'زهرا', 'رضا', 'فاطمه', 'محمد', 'ناهید', 'امیر', 'سارا', 'مهدی', 'لیلا', 'سعید', 'الهام', 'پارسا', 'شیدا', 'آرش', 'نگار', 'کیان', 'ترانه'];
const LAST_NAMES = ['رضایی', 'احمدی', 'کریمی', 'محمدی', 'حسینی', 'موسوی', 'کاظمی', 'نوری', 'صادقی', 'عبدی', 'قاسمی', 'جعفری', 'شریفی', 'ملکی', 'اکبری', 'زارعی', 'رحمانی', 'قربانی', 'یوسفی', 'بهرامی'];
const FACULTIES = ['مهندسی', 'علوم پایه', 'علوم انسانی', 'هنر و معماری', 'کشاورزی'];
const MAJORS = ['نرم‌افزار', 'کامپیوتر', 'برق', 'عمران', 'شیمی', 'ریاضی', 'مدیریت', 'حقوق', 'معماری', 'گیاه‌پزشکی'];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('اجرای seed در production ممنوع است.');
    process.exit(1);
  }

  console.log('▶ شروع seed …');

  await db.insert(systemSettings).values({
    key: 'brand',
    value: {
      name: 'هم‌سفره',
      university: 'دانشگاه شمال آمل',
      slogan: 'رزرو آسان غذا، بدون صف',
    },
  }).onConflictDoNothing();

  // ── یک کاربر از هر نقش ───────────────────────────────
  const roleAccounts: { role: string; username: string; displayName: string; password: string }[] = [
    { role: 'SUPER_ADMIN', username: 'admin', displayName: 'مدیر ارشد سامانه', password: 'Admin@12345' },
    { role: 'VICE_STUDENT', username: 'vice', displayName: 'معاون پژوهشی و دانشجویی', password: 'Vice@12345' },
    { role: 'NUTRITION_MANAGER', username: 'nutrition', displayName: 'مدیر تغذیه', password: 'Nutri@12345' },
    { role: 'CAFETERIA_OPERATOR', username: 'cafeteria1', displayName: 'کارمند سلف', password: 'Cafe@12345' },
    { role: 'STAFF', username: 'staff1', displayName: 'کارمند دانشگاه', password: 'Staff@12345' },
  ];

  for (const a of roleAccounts) {
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.username, a.username)).limit(1);
    if (exists[0]) {
      console.log(`  • ${a.username} از قبل موجود است`);
      continue;
    }
    await db.insert(users).values({
      role: a.role as never,
      username: a.username,
      passwordHash: await hash(a.password, { type: 2, memoryCost: 65536, timeCost: 3 }),
      mustChangePassword: true,
      isActive: true,
      displayName: a.displayName,
    });
    if (a.role !== 'SUPER_ADMIN' && a.role !== 'VICE_STUDENT' && a.role !== 'NUTRITION_MANAGER') {
      // پروفایل کارکنان
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, a.username)).limit(1);
      await db.insert(staffProfiles).values({
        userId: u.id,
        kind: a.role === 'CAFETERIA_OPERATOR' ? 'CAFETERIA' : 'EMPLOYEE',
        department: 'ستاد دانشگاه',
      }).onConflictDoNothing();
    }
    console.log(`  • ${a.username} ساخته شد`);
  }

  // ── ۲۰ دانشجوی نمونه ────────────────────────────────
  for (let i = 0; i < 20; i++) {
    const studentNumber = String(40123000 + i);
    const nationalCode = makeNationalCode(1000 + i);
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.username, studentNumber)).limit(1);
    if (exists[0]) continue;

    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];

    const [u] = await db.insert(users).values({
      role: 'STUDENT',
      username: studentNumber,
      // مدل رمز اولیه: password_hash = NULL و رمز اولیه = کد ملی
      passwordHash: null,
      mustChangePassword: true,
      isActive: true,
      displayName: `${firstName} ${lastName}`,
      mobile: `0912${String(1000000 + i).slice(-7)}`,
    }).returning();

    await db.insert(studentProfiles).values({
      userId: u.id,
      studentNumber,
      nationalCode: encryptSecret(nationalCode),
      nationalCodeHash: blindIndex(normalizeNationalCode(nationalCode)),
      firstName,
      lastName,
      faculty: FACULTIES[i % FACULTIES.length],
      major: MAJORS[i % MAJORS.length],
      entryYear: 1401 + (i % 4),
      // چند دانشجو عمداً غیرفعال‌اند تا پیام «حساب فعال نیست» قابل آزمایش باشد
      status: i === 7 || i === 14 ? 'ON_LEAVE' : 'ACTIVE',
      customerGroup: 'STUDENT',
    });
    console.log(`  • دانشجو ${studentNumber} ساخته شد (رمز اولیه: کد ملی)`);
  }

  // ── وعده‌های غذا (فاز ۳) ─────────────────────────────
  const { mealSlots, foods } = await import('./schema');
  const existingSlots = await db.select({ id: mealSlots.id }).from(mealSlots);
  if (existingSlots.length === 0) {
    await db.insert(mealSlots).values([
      {
        name: 'ناهار',
        startTime: new Date('1970-01-01T11:30:00Z'),
        endTime: new Date('1970-01-01T14:00:00Z'),
        isActive: true,
      },
      {
        name: 'شام',
        startTime: new Date('1970-01-01T17:30:00Z'),
        endTime: new Date('1970-01-01T20:00:00Z'),
        isActive: true,
      },
    ]);
    console.log('  • وعده‌های ناهار و شام ساخته شد');
  }

  // ── چند غذای نمونه (فاز ۳) ──────────────────────────
  const existingFoods = await db.select({ id: foods.id }).from(foods);
  if (existingFoods.length === 0) {
    await db.insert(foods).values([
      { name: 'قورمه سبزی', description: 'خورشت سنتی با سبزی تازه و لوبیا', category: 'MAIN', calories: 520, tags: ['سنتی', 'گیاه‌پزه'] },
      { name: 'زرشک پلو با مرغ', description: 'پلوی زرشک با مرغ بریان', category: 'MAIN', calories: 640, tags: ['پرطرفدار'] },
      { name: 'کباب کوبیده', description: 'دو سیخ کوبیده با گوجه و فلفل', category: 'MAIN', calories: 720, tags: ['گوشتی'] },
      { name: 'عدس پلو', description: 'پلوی عدس با کشمش و خرما', category: 'MAIN', calories: 430, tags: ['گیاهی'] },
      { name: 'سالاد فصل', description: 'کاهو، گوجه، خیار و سس مخصوص', category: 'SALAD', calories: 120, tags: ['گیاهی', 'سبک'] },
      { name: 'ماست و خیار', description: 'ماست با خیار، نعناع و گردو', category: 'SIDE', calories: 95, tags: ['گیاهی'] },
      { name: 'شله‌زرد', description: 'دسر سنتی زعفرانی', category: 'DESSERT', calories: 210, tags: ['شیرین'] },
      { name: 'دوغ', description: 'نوشیدنی سنتی گازدار', category: 'DRINK', calories: 60, tags: ['نوشیدنی'] },
    ]);
    console.log('  • ۸ غذای نمونه ساخته شد');
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  console.log(`✔ seed کامل شد — ${count} کاربر در دیتابیس`);
  console.log('⚠ رمزهای اولیه در README.md ثبت شده‌اند؛ در محیط واقعی باید تغییر کنند.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('خطا در seed:', err);
    process.exit(1);
  });

export { makeNationalCode };
export const _internal = { randomBytes };
