import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import { reservations, menuItems, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createReservation, cancelReservation, markReservationUsed } from '@/server/services/reservation';
import { createStudent, createMenuItemWithPrice, depositUserWallet, getWalletBalance, testActor, closePool } from './helpers';

/**
 * فاز ۲ — تست‌های هم‌زمانی روی دیتابیس واقعی.
 */

describe('هم‌زمانی رزرو', () => {
  it('۵۰ رزرو هم‌زمان برای ظرفیت ۱۰ ← دقیقاً ۱۰ موفق', async () => {
    const { itemId } = await createMenuItemWithPrice({ capacity: 10, priceRials: 50_000 });
    const students = await Promise.all(Array.from({ length: 50 }, () => createStudent()));
    for (const s of students) await depositUserWallet(s.userId, 100_000);

    const results = await Promise.all(
      students.map((s) =>
        createReservation({ userId: s.userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(s.userId) }),
      ),
    );

    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(10);

    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
    expect(item.reservedCount).toBe(10);

    // موجودی‌ها: ۱۰ نفر کم شده، ۴۰ نفر دست‌نخورده
    for (const s of students) {
      const b = await getWalletBalance(s.userId);
      expect(b).toBeLessThanOrEqual(100_000);
      expect(b).toBeGreaterThanOrEqual(50_000);
    }
    const charged = await Promise.all(students.map((s) => getWalletBalance(s.userId)));
    expect(charged.filter((b) => b === 50_000).length).toBe(10);
    expect(charged.filter((b) => b === 100_000).length).toBe(40);
  });

  it('دو رزرو هم‌زمان یک کاربر برای یک آیتم ← یک موفق', async () => {
    const { userId } = await createStudent();
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 60_000 });
    await depositUserWallet(userId, 500_000);

    const [a, b] = await Promise.all([
      createReservation({ userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(userId) }),
      createReservation({ userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(userId) }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!(a.ok && b.ok)) return;
    expect(a.reservation.id).toBe(b.reservation.id); // هر دو به همان رزرو رسیدند
    expect(await getWalletBalance(userId)).toBe(500_000 - 60_000); // فقط یک کسر

    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
    expect(item.reservedCount).toBe(1);
  });

  it('رزرو هم‌زمان با موجودی فقط برای یکی ← یکی موفق، دیگری خطای موجودی، کیف هرگز منفی نمی‌شود', async () => {
    const { itemId, priceRials } = await createMenuItemWithPrice({ capacity: 10, priceRials: 100_000 });
    const s1 = await createStudent();
    const s2 = await createStudent();
    await depositUserWallet(s1.userId, 100_000); // فقط برای یکی
    await depositUserWallet(s2.userId, 0); // کیف صفر — depositUserWallet با صفر هم جفت ledger می‌سازد

    const results = await Promise.all([
      createReservation({ userId: s1.userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(s1.userId) }),
      createReservation({ userId: s2.userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(s2.userId) }),
    ]);

    const oks = results.filter((r) => r.ok);
    expect(oks.length).toBe(1);
    expect(await getWalletBalance(s1.userId)).toBeGreaterThanOrEqual(0);
    expect(await getWalletBalance(s2.userId)).toBeGreaterThanOrEqual(0);
    // کیف کاربر هرگز منفی نیست — قید دیتابیس هم تضمین می‌کند
    expect(await getWalletBalance(s2.userId)).toBe(0);
  });

  it('لغو هم‌زمان با اسکن ← فقط یکی برنده می‌شود', async () => {
    const { userId } = await createStudent();
    // منوی امروز تا اسکن مجاز باشد
    const { itemId, priceRials } = await createMenuItemWithPrice({ priceRials: 40_000, dayOffset: 0 });
    await depositUserWallet(userId, 100_000);

    const r = await createReservation({ userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(userId) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [cancelRes, scanRes] = await Promise.all([
      cancelReservation({ userId, reservationId: r.reservation.id, actor: testActor(userId) }),
      markReservationUsed({ qrToken: r.reservation.qrToken, operatorId: userId, actor: testActor(userId, 'CAFETERIA_OPERATOR') }),
    ]);

    // دقیقاً یکی موفق است
    const winners = [cancelRes.ok, scanRes.ok].filter(Boolean).length;
    expect(winners).toBe(1);

    // وضعیت نهایی یکتاست
    const [final] = await db.select().from(reservations).where(eq(reservations.id, r.reservation.id));
    expect(['CANCELLED', 'USED']).toContain(final.status);

    // اگر لغو برده: بازپرداخت؛ اگر اسکن برده: بدون بازپرداخت
    const balance = await getWalletBalance(userId);
    if (cancelRes.ok) expect(balance).toBe(100_000);
    else expect(balance).toBe(100_000 - priceRials);
  });

  it('دو اسکن هم‌زمان یک بلیط ← فقط یکی موفق', async () => {
    const { userId } = await createStudent();
    const { itemId } = await createMenuItemWithPrice({ priceRials: 30_000, dayOffset: 0 });
    await depositUserWallet(userId, 100_000);

    const r = await createReservation({ userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(userId) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [s1, s2] = await Promise.all([
      markReservationUsed({ qrToken: r.reservation.qrToken, operatorId: userId, actor: testActor(userId, 'CAFETERIA_OPERATOR') }),
      markReservationUsed({ qrToken: r.reservation.qrToken, operatorId: userId, actor: testActor(userId, 'CAFETERIA_OPERATOR') }),
    ]);

    expect([s1.ok, s2.ok].filter(Boolean).length).toBe(1);
    const [final] = await db.select().from(reservations).where(eq(reservations.id, r.reservation.id));
    expect(final.status).toBe('USED');
    expect(final.usedAt).not.toBeNull();
  });
});

afterAll(async () => {
  await closePool();
});
