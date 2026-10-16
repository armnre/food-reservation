/**
 * تست یکپارچهٔ فاز ۱ — تثبیت و پاک‌سازی.
 *
 * پوشش:
 *  ۱-۴) ستون menus.date نوع `date` است و «روز تقویمی تهران» را بدون لغزش TZ نگه می‌دارد.
 *  ۱-۶) اعتبار نشست/وضعیت کاربر داخل تراکنش بررسی می‌شود: رزرو، شارژ دستی و برداشت.
 *       همچنین سناریوی هم‌زمانی (غیرفعال‌سازی هم‌زمان با رزرو) — بدون پولِ گمشده.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { db, pool } from '@/db';
import { mealSlots, menus, reservations, studentProfiles, users, wallets } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  closePool,
  createMenuItemWithPrice,
  createStudent,
  createStaffUser,
  depositUserWallet,
  getWalletBalance,
  testActor,
} from './helpers';
import { createReservation } from '@/server/services/reservation';
import { manualCharge } from '@/server/services/wallet-ops';
import { requestWithdrawal } from '@/server/services/payment';
import { setStudentStatus } from '@/server/services/student-status';
import { reconcileLedger } from '@/server/services/wallet-ops';
import { tehranDayKey, tehranMidnight, mealInstant } from '@/lib/tehran-time';

afterAll(async () => {
  await closePool();
});

/* ════════════════════ ۱-۴: ستون تاریخ منو ════════════════════ */

describe('فاز ۱-۴ — ستون menus.date از نوع date', () => {
  it('نوع ستون در دیتابیس واقعاً `date` است (نه timestamp)', async () => {
    const rows = await db.execute<{ data_type: string }>(sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'menus' AND column_name = 'date'
    `);
    expect(rows.rows[0]?.data_type).toBe('date');
  });

  it('مقدار ستون دقیقاً کلید روز تقویمی تهران است و با TZ سرور جابه‌جا نمی‌شود', async () => {
    const { menuId } = await createMenuItemWithPrice({ dayOffset: 3 });
    const [menu] = await db.select().from(menus).where(eq(menus.id, menuId)).limit(1);

    // نوع برگشتی از درایور باید رشتهٔ YYYY-MM-DD باشد، نه Date
    expect(typeof menu.date).toBe('string');
    expect(menu.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // همان روزی است که ساختیم (۳ روز بعد از امروزِ تهران)
    const expected = tehranDayKey(
      new Date(tehranMidnight(tehranDayKey(new Date())).getTime() + 3 * 86400_000),
    );
    expect(menu.date).toBe(expected);
  });

  it('لحظهٔ وعده از کلید روز + ساعت وعده به‌درستی به وقت تهران ساخته می‌شود', async () => {
    const { menuId, slotId } = await createMenuItemWithPrice({ dayOffset: 2 });
    // دقیقاً همان مسیر کد تولید: منو و وعده با Drizzle خوانده می‌شوند
    const [menu] = await db.select().from(menus).where(eq(menus.id, menuId)).limit(1);
    const [slot] = await db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);

    const instant = mealInstant(menu.date, slot.startTime);

    // helpers وعده را با ساعت دیواری ۱۱:۳۰ تهران می‌سازد
    expect(instant.toISOString().slice(11, 16)).toBe('08:00'); // 11:30+03:30 == 08:00Z
    // روز تقویمیِ لحظهٔ وعده باید دقیقاً همان روز منو باشد — بدون لغزش
    expect(tehranDayKey(instant)).toBe(menu.date);
  });
});

/* ════════════════════ ۱-۶: اعتبار کاربر داخل تراکنش ════════════════════ */

describe('فاز ۱-۶ — رزرو برای کاربر غیرفعال/غیر ACTIVE رد می‌شود', () => {
  it('کاربر با is_active=false نمی‌تواند رزرو کند و پولی جابه‌جا نمی‌شود', async () => {
    const student = await createStudent({ active: false });
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 90_000 });
    await depositUserWallet(student.userId, priceRials * 5);
    const before = await getWalletBalance(student.userId);

    const res = await createReservation({
      userId: student.userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(student.userId),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('غیرفعال');
    expect(await getWalletBalance(student.userId)).toBe(before);

    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservations)
      .where(eq(reservations.userId, student.userId));
    expect(count.n).toBe(0);
  });

  it('دانشجوی با وضعیت ON_LEAVE نمی‌تواند رزرو کند (حتی اگر is_active دست‌نخورده باشد)', async () => {
    const student = await createStudent();
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 80_000 });
    await depositUserWallet(student.userId, priceRials * 5);

    // فقط وضعیت پروفایل را عوض می‌کنیم — is_active را عمداً true نگه می‌داریم
    // تا ثابت شود چکِ وضعیت دانشجو مستقل از is_active هم اثر دارد.
    await db
      .update(studentProfiles)
      .set({ status: 'ON_LEAVE' })
      .where(eq(studentProfiles.userId, student.userId));
    await db.update(users).set({ isActive: true }).where(eq(users.id, student.userId));

    const res = await createReservation({
      userId: student.userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(student.userId),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('مرخصی تحصیلی');
  });

  it('دانشجوی ACTIVE با حساب فعال به‌صورت عادی رزرو می‌کند (کنترل)', async () => {
    const student = await createStudent();
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 70_000 });
    await depositUserWallet(student.userId, priceRials * 3);

    const res = await createReservation({
      userId: student.userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(student.userId),
    });

    expect(res.ok).toBe(true);
    expect(await getWalletBalance(student.userId)).toBe(priceRials * 2);
  });
});

describe('فاز ۱-۶ — شارژ دستی و برداشت برای کاربر غیرفعال رد می‌شود', () => {
  it('شارژ دستی توسط معاونت برای حساب غیرفعال رد می‌شود و دفتر کل دست‌نخورده می‌ماند', async () => {
    const student = await createStudent({ active: false });
    const vice = await createStaffUser('VICE_STUDENT');
    const before = await getWalletBalance(student.userId);

    const res = await manualCharge({
      actor: testActor(vice.userId, 'VICE_STUDENT'),
      userId: student.userId,
      amountRials: 500_000,
      reason: 'تست شارژ حساب غیرفعال',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('غیرفعال');
    expect(await getWalletBalance(student.userId)).toBe(before);
  });

  it('درخواست برداشت برای حساب غیرفعال رد می‌شود و مبلغی در escrow بلوکه نمی‌شود', async () => {
    const student = await createStudent();
    await depositUserWallet(student.userId, 2_000_000);
    await db.update(users).set({ isActive: false }).where(eq(users.id, student.userId));

    const res = await requestWithdrawal({
      userId: student.userId,
      amountRials: 1_000_000,
      iban: 'IR820540102680020817909002',
      accountHolder: 'دانشجوی تست',
      actor: testActor(student.userId),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('غیرفعال');
    // کل موجودی باید دست‌نخورده باقی بماند (هیچ بلوکه‌ای رخ نداده)
    expect(await getWalletBalance(student.userId)).toBe(2_000_000);

    const [escrow] = await db
      .select({ balance: wallets.balanceRials })
      .from(wallets)
      .where(eq(wallets.ownerType, 'WITHDRAWAL_ESCROW'))
      .limit(1);
    expect(escrow?.balance ?? 0).toBe(0);
  });
});

describe('فاز ۱-۶ — هم‌زمانی: غیرفعال‌سازی حین رزرو', () => {
  it('غیرفعال‌سازی هم‌زمان با رزرو هیچ‌گاه رزروِ کاربرِ غیرفعال به جا نمی‌گذارد و دفتر کل متوازن است', async () => {
    const student = await createStudent();
    const vice = await createStaffUser('VICE_STUDENT');
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 60_000, capacity: 100 });
    await depositUserWallet(student.userId, priceRials * 20);

    // هر دو عملیات هم‌زمان — ترتیب برنده قطعی نیست، ولی نتیجه باید سازگار باشد
    await Promise.allSettled([
      createReservation({
        userId: student.userId,
        menuItemId: itemId,
        idempotencyKey: randomUUID(),
        actor: testActor(student.userId),
      }),
      setStudentStatus({
        actor: { id: vice.userId, role: 'VICE_STUDENT' },
        userIds: [student.userId],
        status: 'WITHDRAWN',
      }),
    ]);

    const confirmed = await db
      .select()
      .from(reservations)
      .where(sql`${reservations.userId} = ${student.userId} AND ${reservations.status} = 'CONFIRMED'`);

    // ترتیب برنده در این مسابقه قطعی نیست و *هر دو* ترتیب معتبرند:
    //   الف) اول غیرفعال‌سازی، بعد رزرو → رزرو رد می‌شود (confirmed = ۰)
    //   ب) اول رزرو، بعد غیرفعال‌سازی → رزرو در لحظهٔ معتبر ثبت شده (confirmed = ۱)
    // آنچه نباید اتفاق بیفتد: رزروِ بیش از یک بار، یا کسر پول بدون رزرو.
    expect(confirmed.length).toBeLessThanOrEqual(1);

    // ناوردایی مالی قطعی: موجودی باید دقیقاً برابر «واریز − (تعداد رزرو × قیمت)» باشد
    const balance = await getWalletBalance(student.userId);
    expect(balance).toBe(priceRials * 20 - confirmed.length * priceRials);

    // در هر دو حالت دفتر کل باید سالم بماند
    const reconciliation = await reconcileLedger();
    expect(reconciliation.issues).toEqual([]);
    expect(reconciliation.ok).toBe(true);
  });

  it('پس از غیرفعال‌سازی، تلاش *جدید* برای رزرو قطعاً رد می‌شود (بدون مسابقه)', async () => {
    const student = await createStudent();
    const vice = await createStaffUser('VICE_STUDENT');
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 55_000, capacity: 100 });
    await depositUserWallet(student.userId, priceRials * 10);

    const status = await setStudentStatus({
      actor: { id: vice.userId, role: 'VICE_STUDENT' },
      userIds: [student.userId],
      status: 'WITHDRAWN',
    });
    expect(status.ok).toBe(true);

    const res = await createReservation({
      userId: student.userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(student.userId),
    });

    expect(res.ok).toBe(false);
    expect(await getWalletBalance(student.userId)).toBe(priceRials * 10);
  });
});
