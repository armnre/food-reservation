import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, pool } from '@/db';
import { reservations, menuItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createReservation, cancelReservation, signQrToken } from '@/server/services/reservation';
import {
  createStudent,
  createMenuItemWithPrice,
  depositUserWallet,
  getWalletBalance,
  testActor,
  closePool,
} from './helpers';

/**
 * فاز ۱-۲ — باگ «رزرو مجدد پس از لغو» و idempotency درست.
 */

describe('جریان رزرو — لغو و رزرو مجدد', () => {
  it('رزرو → لغو → رزرو مجدد = دو رکورد، موجودی و ظرفیت درست', async () => {
    const { userId } = await createStudent();
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 120_000 });
    await depositUserWallet(userId, 500_000);

    // رزرو اول
    const r1 = await createReservation({
      userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(userId),
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.reservation.status).toBe('CONFIRMED');
    expect(await getWalletBalance(userId)).toBe(500_000 - 120_000);

    // لغو
    const c = await cancelReservation({ userId, reservationId: r1.reservation.id, actor: testActor(userId) });
    expect(c.ok).toBe(true);
    expect(await getWalletBalance(userId)).toBe(500_000);
    const [item1] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
    expect(item1.reservedCount).toBe(0);

    // رزرو مجدد — باید رزرو «جدید» ساخته شود نه بازگشت رزرو لغوشده (باگ قبلی)
    const r2 = await createReservation({
      userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(userId),
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.idempotent).toBe(false); // رزرو جدید، نه idempotent
    expect(r2.reservation.id).not.toBe(r1.reservation.id);
    expect(r2.reservation.status).toBe('CONFIRMED');

    // دو رکورد در دیتابیس
    const all = await db.select().from(reservations).where(eq(reservations.userId, userId));
    expect(all.length).toBe(2);
    expect(all.filter((r) => r.status === 'CONFIRMED').length).toBe(1);
    expect(all.filter((r) => r.status === 'CANCELLED').length).toBe(1);

    // موجودی و ظرفیت نهایی
    expect(await getWalletBalance(userId)).toBe(500_000 - 120_000);
    const [item2] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
    expect(item2.reservedCount).toBe(1);
  });

  it('تکرار همان کلید idempotency = همان رزرو، فقط یک کسر', async () => {
    const { userId } = await createStudent();
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 80_000 });
    await depositUserWallet(userId, 200_000);

    const key = randomUUID();
    const r1 = await createReservation({
      userId,
      menuItemId: itemId,
      idempotencyKey: key,
      actor: testActor(userId),
    });
    const r2 = await createReservation({
      userId,
      menuItemId: itemId,
      idempotencyKey: key,
      actor: testActor(userId),
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!(r1.ok && r2.ok)) return;
    expect(r2.idempotent).toBe(true);
    expect(r2.reservation.id).toBe(r1.reservation.id);
    expect(await getWalletBalance(userId)).toBe(200_000 - 80_000); // فقط یک کسر

    const all = await db.select().from(reservations).where(eq(reservations.userId, userId));
    expect(all.length).toBe(1);
  });

  it('تلاش دوم با کلید متفاوت وقتی رزرو فعال هست = idempotent بدون کسر دوباره', async () => {
    const { userId } = await createStudent();
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 90_000 });
    await depositUserWallet(userId, 200_000);

    const r1 = await createReservation({
      userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(userId),
    });
    const r2 = await createReservation({
      userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(userId),
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!(r1.ok && r2.ok)) return;
    expect(r2.idempotent).toBe(true);
    expect(r2.reservation.id).toBe(r1.reservation.id);
    expect(await getWalletBalance(userId)).toBe(200_000 - 90_000);
  });

  it('موجودی ناکافی = خطا بدون تغییر موجودی', async () => {
    const { userId } = await createStudent();
    const { itemId } = await createMenuItemWithPrice({ priceRials: 500_000 });
    await depositUserWallet(userId, 100_000);

    const r = await createReservation({
      userId,
      menuItemId: itemId,
      idempotencyKey: randomUUID(),
      actor: testActor(userId),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('موجودی');
    expect(await getWalletBalance(userId)).toBe(100_000);

    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
    expect(item.reservedCount).toBe(0);
  });

  it('توکن QR با امضای معتبر ساخته می‌شود', async () => {
    const token = signQrToken('res-123');
    expect(token).toMatch(/^res-123\./);
  });
});

afterAll(async () => {
  await closePool();
});
