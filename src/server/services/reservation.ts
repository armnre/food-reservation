import { db } from '@/db';
import {
  reservations, menuItems, menus, menuItemPrices, mealSlots, foods,
  users, studentProfiles, staffProfiles,
} from '@/db/schema';
import { and, eq, isNull, sql, desc, inArray } from 'drizzle-orm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { audit, type AuditActor } from '@/lib/audit';
import { BizError, getOrCreateWalletInTx, creditWalletInTx, debitWalletInTx, adjustSystemWalletInTx } from './wallet';
import { toJalaliDateTime } from '@/lib/jalali';
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
  const expected = createHmac('sha256', env.dataHashKey)
    .update(`reservation:${id}`)
    .digest('base64url');
  if (expected.length !== sig.length) return null;
  return timingSafeEqual(Buffer.from(expected),Buffer.from(sig)) ? id : null;
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
  actor: AuditActor;
}) {
  const idempotencyKey = `reserve:${input.userId}:${input.menuItemId}`;

  // idempotency — درخواست تکراری همان رزرو را Charge دوباره نمی‌دهد
  const existing = await db.select().from(reservations)
    .where(eq(reservations.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing[0]) {
    return { ok: true as const, reservation: existing[0], idempotent: true };
  }

  const itemRows = await db.select().from(menuItems).where(eq(menuItems.id, input.menuItemId)).limit(1);
  const item = itemRows[0];
  if (!item) return { ok: false as const, error: 'آیتم منو یافت نشد' };

  const menuRows = await db.select().from(menus).where(eq(menus.id, item.menuId)).limit(1);
  const menu = menuRows[0];
  if (!menu) return { ok: false as const, error: 'منو یافت نشد' };
  if (menu.status !== 'PUBLISHED') {
    return { ok: false as const, error: 'این منو هنوز منتشر نشده است' };
  }

  const now = new Date();
  if (menu.reservationOpensAt && now < menu.reservationOpensAt) {
    return { ok: false as const, error: 'زمان رزرو این وعده هنوز شروع نشده است' };
  }
  if (menu.reservationClosesAt && now > menu.reservationClosesAt) {
    return { ok: false as const, error: 'زمان رزرو این وعده به پایان رسیده است' };
  }

  const group = await getUserCustomerGroup(input.userId);

  const priceRows = await db.select().from(menuItemPrices)
    .where(and(
      eq(menuItemPrices.menuItemId, input.menuItemId),
      eq(menuItemPrices.customerGroup, group as never),
    ))
    .limit(1);
  if (!priceRows[0]) {
    return { ok: false as const, error: 'این غذا برای گروه شما تعریف نشده است' };
  }
  const price = priceRows[0].priceRials;

  const reservationId = randomUUID();
  const qrToken = signQrToken(reservationId);

  try {
    const reservation = await db.transaction(async (tx) => {
      // قفل ردیف آیتم منو
      const locked = await tx.select().from(menuItems)
        .where(eq(menuItems.id, input.menuItemId))
        .for('update');
      const lockedItem = locked[0];
      if (!lockedItem) throw new BizError('آیتم منو یافت نشد');
      if (lockedItem.reservedCount >= lockedItem.capacity) {
        throw new BizError('ظرفیت این غذا تکمیل شده است');
      }

      //город débit کاربر
      const userWallet = await getOrCreateWalletInTx(tx, input.userId);
      await debitWalletInTx(
        tx, userWallet.id, price, 'PURCHASE', reservationId,
        `purchase:${reservationId}`, 'رزرو غذا',
      );

      // tazkqiye TREASURY
      await adjustSystemWalletInTx(
        tx, 'TREASURY', price, 'SALE', reservationId,
        `sale:${reservationId}`, 'فروش غذا',
      );

      // افزایش شمارنده رزرو
      await tx.update(menuItems)
        .set({ reservedCount: sql`${menuItems.reservedCount} + 1`, updatedAt: new Date() })
        .where(eq(menuItems.id, input.menuItemId));

      // ایجاد رزرو
      const [r] = await tx.insert(reservations).values({
        id: reservationId,
        userId: input.userId,
        menuItemId: input.menuItemId,
        status: 'CONFIRMED',
        quantity: 1,
        priceSnapshotRials: price,
        qrToken,
        idempotencyKey,
        reservedAt: new Date(),
      }).returning();

      return r;
    });

    await audit({
      actor: input.actor,
      action: 'reservation:created',
      entityType: 'reservation',
      entityId: reservation.id,
      after: { menuItemId: input.menuItemId, priceRials: price, group },
    });

    return { ok: true as const, reservation, idempotent: false };
  } catch (e) {
    if (e instanceof BizError) return { ok: false as const, error: e.message };
    // race: unique constraint — резرو همزمان
    const dup = await db.select().from(reservations)
      .where(eq(reservations.idempotencyKey, idempotencyKey))
      .limit(1);
    if (dup[0]) return { ok: true as const, reservation: dup[0], idempotent: true };
    throw e;
  }
}

/* ───────────── لغو رزرو ───────────── */

export async function cancelReservation(input: {
  userId: string;
  reservationId: string;
  actor: AuditActor;
}) {
  const rows = await db.select().from(reservations)
    .where(eq(reservations.id, input.reservationId))
    .limit(1);
  const r = rows[0];
  if (!r) return { ok: false as const, error: 'رزرو یافت نشد' };
  if (r.userId !== input.userId) {
    return { ok: false as const, error: 'این رزرو متعلق به شما نیست' };
  }
  if (r.status !== 'CONFIRMED') {
    return { ok: false as const, error: 'این رزرو قابل لغو نیست' };
  }

  const itemRows = await db.select().from(menuItems).where(eq(menuItems.id, r.menuItemId)).limit(1);
  const item = itemRows[0];
  if (!item) return { ok: false as const, error: 'آیتم منو یافت نشد' };
  const menuRows = await db.select().from(menus).where(eq(menus.id, item.menuId)).limit(1);
  const menu = menuRows[0];
  if (!menu) return { ok: false as const, error: 'منو یافت نشد' };

  const now = new Date();
  const cancelDeadline = menu.reservationClosesAt ?? menu.date;
  if (now > cancelDeadline) {
    return { ok: false as const, error: 'زمان لغو این رزرو به پایان رسیده است' };
  }

  try {
    await db.transaction(async (tx) => {
      const locked = await tx.select().from(reservations)
        .where(eq(reservations.id, r.id))
        .for('update');
      if (locked[0].status !== 'CONFIRMED') {
        throw new BizError('این رزرو قابل لغو نیست');
      }

      // remboursement کاربر
      const userWallet = await getOrCreateWalletInTx(tx, input.userId);
      await creditWalletInTx(
        tx, userWallet.id, r.priceSnapshotRials, 'REFUND', r.id,
        `refund:${r.id}`, 'لغو رزرو غذا',
      );

      // کسر از TREASURY
      await adjustSystemWalletInTx(
        tx, 'TREASURY', -r.priceSnapshotRials, 'REFUND', r.id,
        `refund_out:${r.id}`, 'بازگشت فروش غذا',
      );

      // کاهش شمارنده
      await tx.update(menuItems)
        .set({ reservedCount: sql`${menuItems.reservedCount} - 1`, updatedAt: new Date() })
        .where(eq(menuItems.id, r.menuItemId));

      await tx.update(reservations)
        .set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, r.id));
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
    after: { refundedRials: r.priceSnapshotRials },
  });

  return { ok: true as const };
}

/* ───────────── اسکن و تأیید سرو (سلف) ───────────── */

export async function scanReservation(qrToken: string) {
  const reservationId = verifyQrToken(qrToken);
  if (!reservationId || !/^[0-9a-f-]{36}$/i.test(reservationId)) {
    return { ok: false as const, error: 'QR نامعتبر است' };
  }

  const rows = await db.select().from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  const r = rows[0];
  if (!r) return { ok: false as const, error: 'رزرو یافت نشد' };

  const itemRows = await db.select().from(menuItems).where(eq(menuItems.id, r.menuItemId)).limit(1);
  const item = itemRows[0];
  const menuRows = await db.select().from(menus).where(eq(menus.id, item?.menuId ?? '')).limit(1);
  const menu = menuRows[0];
  const slotRows = menu ? await db.select().from(mealSlots).where(eq(mealSlots.id, menu.mealSlotId)).limit(1) : [];
  const slot = slotRows[0];
  const foodRows = item ? await db.select().from(foods).where(eq(foods.id, item.foodId)).limit(1) : [];
  const food = foodRows[0];
  const userRows = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
  const user = userRows[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const menuDay = menu ? new Date(menu.date) : null;
  if (menuDay) menuDay.setHours(0, 0, 0, 0);
  const isToday = menuDay?.getTime() === today.getTime();

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

export async function markReservationUsed(input: {
  qrToken: string;
  operatorId: string;
  actor: AuditActor;
}) {
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

  const consumed=await db.update(reservations)
    .set({status:'USED',usedAt:new Date(),updatedAt:new Date()})
    .where(and(eq(reservations.id,reservation.id),eq(reservations.status,'CONFIRMED'))).returning({id:reservations.id});
  if(!consumed.length)return {ok:false as const,error:'این بلیط قبلاً تحویل شده است'};

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

/* ─────────────Sede查询 — رزروهای من ───────────── */

export async function getMyReservations(userId: string) {
  const rows = await db.select().from(reservations)
    .where(and(eq(reservations.userId, userId), isNull(reservations.deletedAt)))
    .orderBy(desc(reservations.createdAt))
    .limit(100);

  if (rows.length === 0) return [];

  const itemIds = rows.map((r) => r.menuItemId);
  const items = await db.select().from(menuItems).where(inArray(menuItems.id, itemIds));
  const menuIds = items.map((i) => i.menuId);
  const menuRows = menuIds.length > 0
    ? await db.select().from(menus).where(inArray(menus.id, menuIds))
    : [];
  const slotIds = menuRows.map((m) => m.mealSlotId);
  const slotRows = slotIds.length > 0
    ? await db.select().from(mealSlots).where(inArray(mealSlots.id, slotIds))
    : [];
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
      menuDate: menu ? toJalaliDateTime(menu.date) : '—',
      menuStatus: menu?.status ?? null,
      reservationClosesAt: menu?.reservationClosesAt?.toISOString() ?? null,
      menuDateIso: menu?.date.toISOString() ?? null,
    };
  });
}

/** رزروهای امروز برای اپراتور سلف */
export async function getTodayReservations() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const menuRows = await db.select().from(menus).where(
    and(sql`${menus.date} >= ${today}`, sql`${menus.date} < ${tomorrow}`),
  );
  if (menuRows.length === 0) return [];

  const menuIds = menuRows.map((m) => m.id);
  const items = await db.select().from(menuItems).where(inArray(menuItems.menuId, menuIds));
  const itemIds = items.map((i) => i.id);
  const rows = itemIds.length > 0
    ? await db.select().from(reservations).where(
        and(inArray(reservations.menuItemId, itemIds), isNull(reservations.deletedAt)),
      )
    : [];

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const userRows = userIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
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
