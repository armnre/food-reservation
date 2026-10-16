import { db } from '@/db';
import {
  reservations,
  menuItems,
  menus,
  menuItemPrices,
  mealSlots,
  foods,
  users,
  studentProfiles,
  staffProfiles,
} from '@/db/schema';
import { and, eq, isNull, sql, desc, inArray } from 'drizzle-orm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { audit, type AuditActor } from '@/lib/audit';
import { BizError, getOrCreateWalletInTx, getSystemWalletInTx, recordTransactionInTx } from './wallet';
import { assertUserEligibleInTx } from './eligibility';
import { getBusinessSettings, getBusinessSettingsInTx } from './settings';
import { mealInstant } from '@/lib/tehran-time';
import { toJalaliDateTime, menuDayToJalali, startOfMenuDay, tehranDayKey } from '@/lib/jalali';
import QRCode from 'qrcode';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ───────────── QR Token (امضای HMAC) ───────────── */

export function signQrToken(reservationId: string): string {
  const sig = createHmac('sha256', env.dataHashKey)
    .update(`reservation:${reservationId}`)
    .digest('base64url');
  return `${reservationId}.${sig}`;
}

export function verifyQrToken(token: string): string | null {
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [id, sig] = parts;
  if (!id || !sig) return null;
  const expected = createHmac('sha256', env.dataHashKey).update(`reservation:${id}`).digest('base64url');
  if (expected.length !== sig.length) return null;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) ? id : null;
}

/** تولید QR به‌صورت Data URL (PNG) */
export async function qrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#3A2D7D', light: '#ffffff' },
  });
}

/* ───────────── گروه مشتری کاربر ───────────── */

export async function getUserCustomerGroup(userId: string): Promise<string> {
  const sp = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  if (sp[0]) return sp[0].customerGroup;

  const st = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);
  if (st[0]) {
    if (st[0].kind === 'FACULTY') return 'FACULTY';
    if (st[0].kind === 'CONTRACTOR') return 'CONTRACTOR';
    return 'EMPLOYEE';
  }

  const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u[0]?.role === 'STUDENT' ? 'STUDENT' : 'EMPLOYEE';
}

/* ───────────── رزرو ───────────── */

export async function createReservation(input: {
  userId: string;
  menuItemId: string;
  /** کلید یکتای این «تلاش» — UUID که فرم برای هر درخواست می‌سازد (تکرار همان تلاش فقط یک رزرو می‌سازد) */
  idempotencyKey: string;
  actor: AuditActor;
}) {
  const idempotencyKey = input.idempotencyKey;
  if (!/^[0-9a-f-]{8,64}$/i.test(idempotencyKey)) {
    return { ok: false as const, error: 'کلید idempotency نامعتبر است' };
  }

  // idempotency — تکرار همان تلاش، رزرو موجود را برمی‌گرداند و دوباره کسر نمی‌کند
  const existing = await db
    .select()
    .from(reservations)
    .where(eq(reservations.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing[0]) {
    return { ok: true as const, reservation: existing[0], idempotent: true };
  }

  // اگر کاربر همین حالا رزرو فعال برای این آیتم دارد، بدون کسر دوباره همان را برگردان
  const activeAlready = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.userId, input.userId),
        eq(reservations.menuItemId, input.menuItemId),
        eq(reservations.status, 'CONFIRMED'),
      ),
    )
    .limit(1);
  if (activeAlready[0]) {
    return { ok: true as const, reservation: activeAlready[0], idempotent: true };
  }

  const group = await getUserCustomerGroup(input.userId);
  const reservationId = randomUUID();
  const qrToken = signQrToken(reservationId);
  let priceRials = 0;

  try {
    const reservation = await db.transaction(async (tx) => {
      // فاز ۱-۶: فعال بودن کاربر و وضعیت ACTIVE دانشجو *داخل* تراکنش و زیر قفل
      // ردیف بررسی می‌شود؛ غیرفعال‌سازی هم‌زمان نمی‌تواند بین چک و ثبت فاصله بیندازد.
      await assertUserEligibleInTx(tx, input.userId, 'reserve');

      // همهٔ چک‌ها داخل تراکنش و زیر قفل ردیف آیتم (فاز ۳-۳)
      const locked = await tx
        .select()
        .from(menuItems)
        .where(eq(menuItems.id, input.menuItemId))
        .for('update');
      const lockedItem = locked[0];
      if (!lockedItem) throw new BizError('آیتم منو یافت نشد');
      if (lockedItem.reservedCount >= lockedItem.capacity) {
        throw new BizError('ظرفیت این غذا تکمیل شده است');
      }

      const menuRows = await tx.select().from(menus).where(eq(menus.id, lockedItem.menuId)).limit(1);
      const menu = menuRows[0];
      if (!menu) throw new BizError('منو یافت نشد');
      if (menu.status !== 'PUBLISHED') throw new BizError('این منو هنوز منتشر نشده است');
      const now = new Date();
      if (menu.reservationOpensAt && now < menu.reservationOpensAt) {
        throw new BizError('زمان رزرو این وعده هنوز شروع نشده است');
      }
      if (menu.reservationClosesAt && now > menu.reservationClosesAt) {
        throw new BizError('زمان رزرو این وعده به پایان رسیده است');
      }

      // فاز ۲-۳: شروع وعده نباید گذشته باشد (محاسبه به وقت تهران)
      const settings = await getBusinessSettingsInTx(tx);
      const slotRows = await tx.select().from(mealSlots).where(eq(mealSlots.id, menu.mealSlotId)).limit(1);
      if (!slotRows[0]) throw new BizError('وعده یافت نشد');
      const mealStart = mealInstant(menu.date, slotRows[0].startTime);
      if (now > mealStart) {
        throw new BizError(`زمان این وعده (${toJalaliDateTime(mealStart)}) گذشته است`);
      }

      // فاز ۲-۳: سقف رزرو فعال یک کاربر در یک وعده (منو = روز + وعده)
      const [capRow] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(reservations)
        .innerJoin(menuItems, eq(menuItems.id, reservations.menuItemId))
        .where(
          and(
            eq(reservations.userId, input.userId),
            eq(menuItems.menuId, menu.id),
            eq(reservations.status, 'CONFIRMED'),
          ),
        );
      const alreadyInMeal = capRow?.n ?? 0;
      if (alreadyInMeal >= settings.max_reservations_per_meal) {
        throw new BizError(
          `شما در این وعده ${alreadyInMeal} رزرو فعال دارید؛ سقف مجاز ${settings.max_reservations_per_meal} است`,
        );
      }

      const priceRows = await tx
        .select()
        .from(menuItemPrices)
        .where(
          and(
            eq(menuItemPrices.menuItemId, input.menuItemId),
            eq(menuItemPrices.customerGroup, group as never),
          ),
        )
        .limit(1);
      if (!priceRows[0]) throw new BizError('این غذا برای گروه شما تعریف نشده است');
      const price = priceRows[0].priceRials;
      priceRials = price;

      // دفتر کل دوطرفه — کاربر −قیمت و TREASURY +قیمت در یک تراکنش با جمع صفر
      const userWallet = await getOrCreateWalletInTx(tx, input.userId);
      const treasury = await getSystemWalletInTx(tx, 'TREASURY');
      await recordTransactionInTx(tx, {
        idempotencyKey: `reserve:${reservationId}`,
        referenceId: reservationId,
        description: 'رزرو غذا',
        legs: [
          { walletId: userWallet.id, amountRials: -price, entryType: 'PURCHASE', description: 'رزرو غذا' },
          { walletId: treasury.id, amountRials: price, entryType: 'SALE', description: 'فروش غذا' },
        ],
      });

      // افزایش شمارنده رزرو
      await tx
        .update(menuItems)
        .set({ reservedCount: sql`${menuItems.reservedCount} + 1`, updatedAt: new Date() })
        .where(eq(menuItems.id, input.menuItemId));

      // ایجاد رزرو
      const [r] = await tx
        .insert(reservations)
        .values({
          id: reservationId,
          userId: input.userId,
          menuItemId: input.menuItemId,
          status: 'CONFIRMED',
          quantity: 1,
          priceSnapshotRials: price,
          qrToken,
          idempotencyKey,
          reservedAt: new Date(),
        })
        .returning();

      return r;
    });

    await audit({
      actor: input.actor,
      action: 'reservation:created',
      entityType: 'reservation',
      entityId: reservation.id,
      after: { menuItemId: input.menuItemId, priceRials, group },
    });

    return { ok: true as const, reservation, idempotent: false };
  } catch (e) {
    if (e instanceof BizError) return { ok: false as const, error: e.message };
    // تداخل هم‌زمان: تکرار همان تلاش (کلید یکتا) یا رزرو فعال هم‌زمان برای همین آیتم
    const dup = await db
      .select()
      .from(reservations)
      .where(eq(reservations.idempotencyKey, idempotencyKey))
      .limit(1);
    if (dup[0]) return { ok: true as const, reservation: dup[0], idempotent: true };
    const active = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.userId, input.userId),
          eq(reservations.menuItemId, input.menuItemId),
          eq(reservations.status, 'CONFIRMED'),
        ),
      )
      .limit(1);
    if (active[0]) return { ok: true as const, reservation: active[0], idempotent: true };
    throw e;
  }
}

/* ───────────── لغو رزرو ───────────── */

/**
 * مهلت لغو و اطلاعات نمایشی آن (فاز ۲-۲).
 *
 * قاعده: لغو تا «شروع وعده − cancel_cutoff_hours» مجاز است — *مستقل* از بازهٔ
 * رزرو (reservationClosesAt). پیش از این از reservationClosesAt استفاده می‌شد که
 * یک فیلد اختیاری و مربوط به «پنجرهٔ رزرو» است، نه مهلت لغو؛ در نتیجه منوهایی
 * که پنجره نداشتند عملاً تا لحظهٔ سرو قابل لغو بودند.
 *
 * لحظهٔ وعده با mealInstant از «روز تقویمی تهران منو» + «ساعت وعده» ساخته می‌شود
 * تا با TZ سرور جابه‌جا نشود.
 */
export async function getCancelDeadline(reservationId: string): Promise<{
  ok: true;
  deadline: Date;
  mealStart: Date;
  cutoffHours: number;
  cancellable: boolean;
} | { ok: false; error: string }> {
  const rows = await db
    .select({
      id: reservations.id,
      menuItemId: reservations.menuItemId,
      menuDate: menus.date,
      slotStart: mealSlots.startTime,
    })
    .from(reservations)
    .innerJoin(menuItems, eq(menuItems.id, reservations.menuItemId))
    .innerJoin(menus, eq(menus.id, menuItems.menuId))
    .innerJoin(mealSlots, eq(mealSlots.id, menus.mealSlotId))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: 'رزرو یافت نشد' };

  const { cancel_cutoff_hours } = await getBusinessSettings();
  const mealStart = mealInstant(row.menuDate, row.slotStart);
  const deadline = new Date(mealStart.getTime() - cancel_cutoff_hours * 3600_000);
  return {
    ok: true,
    deadline,
    mealStart,
    cutoffHours: cancel_cutoff_hours,
    cancellable: Date.now() <= deadline.getTime(),
  };
}

export async function cancelReservation(input: {
  userId: string;
  reservationId: string;
  actor: AuditActor;
  /** دلیل لغو — پیش‌فرض درخواست خود کاربر */
  reason?: 'USER_REQUEST' | 'MEAL_UNAVAILABLE';
}) {
  const rows = await db.select().from(reservations).where(eq(reservations.id, input.reservationId)).limit(1);
  const r = rows[0];
  if (!r) return { ok: false as const, error: 'رزرو یافت نشد' };
  if (r.userId !== input.userId) {
    return { ok: false as const, error: 'این رزرو متعلق به شما نیست' };
  }
  if (r.status !== 'CONFIRMED') {
    return { ok: false as const, error: 'این رزرو قابل لغو نیست' };
  }

  // مهلت لغو — پیش از تراکنش، برای دادن پیام خطای دقیق و خوانا
  const deadlineInfo = await getCancelDeadline(r.id);
  if (deadlineInfo.ok && !deadlineInfo.cancellable) {
    return {
      ok: false as const,
      error: `مهلت لغو این رزرو در ${toJalaliDateTime(deadlineInfo.deadline)} به پایان رسیده است`,
      deadlineIso: deadlineInfo.deadline.toISOString(),
    };
  }

  const reason = input.reason ?? 'USER_REQUEST';

  try {
    await db.transaction(async (tx) => {
      const locked = await tx.select().from(reservations).where(eq(reservations.id, r.id)).for('update');
      if (!locked[0] || locked[0].status !== 'CONFIRMED') {
        throw new BizError('این رزرو قابل لغو نیست');
      }

      // فاز ۲-۲: مهلت لغو *داخل* تراکنش هم بازبینی می‌شود تا لغوِ هم‌زمان با
      // اسکن یا با تغییر مهلت، نتواند از چک بیرون تراکنش عبور کند.
      const settings = await getBusinessSettingsInTx(tx);
      const mealRows = await tx
        .select({ menuDate: menus.date, slotStart: mealSlots.startTime })
        .from(menuItems)
        .innerJoin(menus, eq(menus.id, menuItems.menuId))
        .innerJoin(mealSlots, eq(mealSlots.id, menus.mealSlotId))
        .where(eq(menuItems.id, r.menuItemId))
        .limit(1);
      if (mealRows[0]) {
        const mealStart = mealInstant(mealRows[0].menuDate, mealRows[0].slotStart);
        const deadline = new Date(mealStart.getTime() - settings.cancel_cutoff_hours * 3600_000);
        if (Date.now() > deadline.getTime()) {
          throw new BizError(`مهلت لغو این رزرو در ${toJalaliDateTime(deadline)} به پایان رسیده است`);
        }
      }

      // دفتر کل دوطرفه — کاربر +قیمت و TREASURY −قیمت
      const userWallet = await getOrCreateWalletInTx(tx, input.userId);
      const treasury = await getSystemWalletInTx(tx, 'TREASURY');
      await recordTransactionInTx(tx, {
        idempotencyKey: `cancel:${r.id}`,
        referenceId: r.id,
        description: reason === 'MEAL_UNAVAILABLE' ? 'لغو رزرو — در دسترس نبودن وعده' : 'لغو رزرو غذا',
        legs: [
          {
            walletId: userWallet.id,
            amountRials: r.priceSnapshotRials,
            entryType: 'REFUND',
            description: 'بازپرداخت لغو رزرو',
          },
          {
            walletId: treasury.id,
            amountRials: -r.priceSnapshotRials,
            entryType: 'REFUND',
            description: 'بازگشت فروش غذا',
          },
        ],
      });

      // کاهش شمارنده
      await tx
        .update(menuItems)
        .set({ reservedCount: sql`${menuItems.reservedCount} - 1`, updatedAt: new Date() })
        .where(eq(menuItems.id, r.menuItemId));

      await tx
        .update(reservations)
        .set({ status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(reservations.id, r.id), eq(reservations.status, 'CONFIRMED')));
    });
  } catch (e) {
    if (e instanceof BizError) return { ok: false as const, error: e.message };
    throw e;
  }

  await audit({
    actor: input.actor,
    action: 'reservation:cancelled',
    entityType: 'reservation',
    entityId: r.id,
    after: { refundedRials: r.priceSnapshotRials, reason },
  });

  return { ok: true as const };
}

/* ───────────── اسکن و تأیید سرو (سلف) ───────────── */

export async function scanReservation(qrToken: string) {
  const reservationId = verifyQrToken(qrToken);
  if (!reservationId || !/^[0-9a-f-]{36}$/i.test(reservationId)) {
    return { ok: false as const, error: 'QR نامعتبر است' };
  }

  const rows = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  const r = rows[0];
  if (!r) return { ok: false as const, error: 'رزرو یافت نشد' };

  const itemRows = await db.select().from(menuItems).where(eq(menuItems.id, r.menuItemId)).limit(1);
  const item = itemRows[0];
  const menuRows = await db
    .select()
    .from(menus)
    .where(eq(menus.id, item?.menuId ?? ''))
    .limit(1);
  const menu = menuRows[0];
  const slotRows = menu
    ? await db.select().from(mealSlots).where(eq(mealSlots.id, menu.mealSlotId)).limit(1)
    : [];
  const slot = slotRows[0];
  const foodRows = item ? await db.select().from(foods).where(eq(foods.id, item.foodId)).limit(1) : [];
  const food = foodRows[0];
  const userRows = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
  const user = userRows[0];

  // «امروز» یعنی امروزِ تقویمی تهران — مستقل از TZ سرور
  const isToday = menu ? menu.date === tehranDayKey(new Date()) : false;

  return {
    ok: true as const,
    reservation: r,
    menu,
    slot,
    food,
    user,
    isToday,
    canMarkUsed: r.status === 'CONFIRMED' && isToday,
  };
}

export async function markReservationUsed(input: { qrToken: string; operatorId: string; actor: AuditActor }) {
  const scanned = await scanReservation(input.qrToken);
  if (!scanned.ok) return scanned;

  const { reservation, canMarkUsed, user, food, slot } = scanned;
  if (!canMarkUsed) {
    if (reservation.status === 'USED') {
      return { ok: false as const, error: 'این رزرو قبلاً استفاده شده است' };
    }
    if (reservation.status !== 'CONFIRMED') {
      return { ok: false as const, error: 'وضعیت این رزرو اجازهٔ سرو نمی‌دهد' };
    }
    return { ok: false as const, error: 'این رزرو مربوط به امروز نیست' };
  }

  const consumed = await db
    .update(reservations)
    .set({ status: 'USED', usedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reservations.id, reservation.id), eq(reservations.status, 'CONFIRMED')))
    .returning({ id: reservations.id });
  if (!consumed.length) return { ok: false as const, error: 'این بلیط قبلاً تحویل شده است' };

  await audit({
    actor: input.actor,
    action: 'reservation:used',
    entityType: 'reservation',
    entityId: reservation.id,
    after: { operatorId: input.operatorId },
  });

  return {
    ok: true as const,
    reservation: { ...reservation, status: 'USED' as const },
    user,
    food,
    slot,
  };
}

/* ─────────────کوئری — رزروهای من ───────────── */

export async function getMyReservations(userId: string) {
  const rows = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.userId, userId), isNull(reservations.deletedAt)))
    .orderBy(desc(reservations.createdAt))
    .limit(100);

  if (rows.length === 0) return [];

  const itemIds = rows.map((r) => r.menuItemId);
  const items = await db.select().from(menuItems).where(inArray(menuItems.id, itemIds));
  const menuIds = items.map((i) => i.menuId);
  const menuRows = menuIds.length > 0 ? await db.select().from(menus).where(inArray(menus.id, menuIds)) : [];
  const slotIds = menuRows.map((m) => m.mealSlotId);
  const slotRows =
    slotIds.length > 0 ? await db.select().from(mealSlots).where(inArray(mealSlots.id, slotIds)) : [];
  const foodIds = items.map((i) => i.foodId);
  const foodRows = await db.select().from(foods).where(inArray(foods.id, foodIds));

  const itemById = new Map(items.map((i) => [i.id, i]));
  const menuById = new Map(menuRows.map((m) => [m.id, m]));
  const slotById = new Map(slotRows.map((s) => [s.id, s]));
  const foodById = new Map(foodRows.map((f) => [f.id, f]));

  return rows.map((r) => {
    const item = itemById.get(r.menuItemId);
    const menu = item ? menuById.get(item.menuId) : undefined;
    const slot = menu ? slotById.get(menu.mealSlotId) : undefined;
    const food = item ? foodById.get(item.foodId) : undefined;
    return {
      id: r.id,
      status: r.status,
      priceRials: r.priceSnapshotRials,
      qrToken: r.qrToken,
      reservedAt: toJalaliDateTime(r.reservedAt),
      usedAt: r.usedAt ? toJalaliDateTime(r.usedAt) : null,
      cancelledAt: r.cancelledAt ? toJalaliDateTime(r.cancelledAt) : null,
      foodName: food?.name ?? '—',
      foodThumb: food?.thumbPath ?? null,
      mealSlotName: slot?.name ?? '—',
      menuDate: menu ? menuDayToJalali(menu.date) : '—',
      menuStatus: menu?.status ?? null,
      reservationClosesAt: menu?.reservationClosesAt?.toISOString() ?? null,
      menuDateIso: menu ? startOfMenuDay(menu.date).toISOString() : null,
    };
  });
}

/** رزروهای امروز برای اپراتور سلف */
export async function getTodayReservations() {
  // فاز ۱-۴: «امروز» = کلید روز تقویمی تهران (ستون date نوع `date` است)
  const todayKey = tehranDayKey(new Date());
  const menuRows = await db.select().from(menus).where(eq(menus.date, todayKey));
  if (menuRows.length === 0) return [];

  const menuIds = menuRows.map((m) => m.id);
  const items = await db.select().from(menuItems).where(inArray(menuItems.menuId, menuIds));
  const itemIds = items.map((i) => i.id);
  const rows =
    itemIds.length > 0
      ? await db
          .select()
          .from(reservations)
          .where(and(inArray(reservations.menuItemId, itemIds), isNull(reservations.deletedAt)))
      : [];

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const userRows = userIds.length > 0 ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const foodIds = items.map((i) => i.foodId);
  const foodRows = await db.select().from(foods).where(inArray(foods.id, foodIds));
  const slotIds = menuRows.map((m) => m.mealSlotId);
  const slotRows = await db.select().from(mealSlots).where(inArray(mealSlots.id, slotIds));

  const itemById = new Map(items.map((i) => [i.id, i]));
  const menuById = new Map(menuRows.map((m) => [m.id, m]));
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const foodById = new Map(foodRows.map((f) => [f.id, f]));
  const slotById = new Map(slotRows.map((s) => [s.id, s]));

  return rows.map((r) => {
    const item = itemById.get(r.menuItemId);
    const menu = item ? menuById.get(item.menuId) : undefined;
    const u = userById.get(r.userId);
    const f = item ? foodById.get(item.foodId) : undefined;
    const s = menu ? slotById.get(menu.mealSlotId) : undefined;
    return {
      id: r.id,
      status: r.status,
      qrToken: r.qrToken,
      reservedAt: toJalaliDateTime(r.reservedAt),
      usedAt: r.usedAt ? toJalaliDateTime(r.usedAt) : null,
      userName: u?.displayName ?? '—',
      userUsername: u?.username ?? '—',
      foodName: f?.name ?? '—',
      mealSlotName: s?.name ?? '—',
      priceRials: r.priceSnapshotRials,
    };
  });
}

export type { Tx };
