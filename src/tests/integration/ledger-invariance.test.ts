import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { createReservation, cancelReservation } from '@/server/services/reservation';
import { createStudent, createMenuItemWithPrice, depositUserWallet, testActor, closePool } from './helpers';

/**
 * فاز ۲ — ناوردایی دفتر کل پس از دنبالهٔ تصادفی عملیات:
 *  (الف) جمع همهٔ ledger_entries = صفر (دفتر دوطرفه)
 *  (ب) موجودی هر کیف = جمع ردیف‌های همان کیف
 *  (ج) هیچ کیف کاربری منفی نیست
 */

/** LCG ساده برای دنبالهٔ تکرارپذیر */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('ناوردایی دفتر کل', () => {
  it('پس از ۱۵۰ عملیات تصادفی، همهٔ ناوردایی‌ها برقرارند', async () => {
    const rng = makeRng(42);

    // ۱۲ کاربر و ۶ آیتم منو
    const students = await Promise.all(Array.from({ length: 12 }, () => createStudent()));
    const items = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createMenuItemWithPrice({ priceRials: 20_000 + i * 10_000, capacity: 30 }),
      ),
    );
    for (const s of students) await depositUserWallet(s.userId, 300_000);

    // وضعیت: کدام کاربر رزرو فعال کدام آیتم را دارد
    const active = new Map<string, string>(); // `${userId}:${itemId}` → reservationId

    for (let i = 0; i < 150; i++) {
      const s = students[Math.floor(rng() * students.length)];
      const item = items[Math.floor(rng() * items.length)];
      const key = `${s.userId}:${item.itemId}`;
      const has = active.has(key);
      const roll = rng();

      if (!has && roll < 0.6) {
        const r = await createReservation({
          userId: s.userId,
          menuItemId: item.itemId,
          idempotencyKey: randomUUID(),
          actor: testActor(s.userId),
        });
        if (r.ok && !r.idempotent) active.set(key, r.reservation.id);
      } else if (has && roll >= 0.6) {
        const rid = active.get(key) as string;
        const c = await cancelReservation({
          userId: s.userId,
          reservationId: rid,
          actor: testActor(s.userId),
        });
        if (c.ok) active.delete(key);
      }
      // در غیر این صورت: عملی انجام نشد (شبیه کاربر بیکار)
    }

    // (الف) جمع کل دفتر = صفر — هر جریان کاربر↔سیستمی جفت است
    const total = await db.execute<{ sum: string | null }>(
      sql`SELECT COALESCE(SUM(amount_rials), 0)::text AS sum FROM ledger_entries`,
    );
    expect(Number(total.rows[0].sum)).toBe(0);

    // (ب) موجودی هر کیف = جمع ردیف‌هایش
    const mismatch = await db.execute<{ wallet_id: string }>(sql`
      SELECT w.id AS wallet_id
      FROM wallets w
      LEFT JOIN (SELECT wallet_id, SUM(amount_rials) AS s FROM ledger_entries GROUP BY wallet_id) l
        ON l.wallet_id = w.id
      WHERE w.balance_rials <> COALESCE(l.s, 0)
    `);
    expect(mismatch.rows.length, `کیف‌های ناسازگار: ${JSON.stringify(mismatch.rows)}`).toBe(0);

    // (ج) هیچ کیف کاربری منفی نیست
    const negative = await db.execute<{ id: string }>(sql`
      SELECT id FROM wallets WHERE owner_type = 'USER' AND balance_rials < 0
    `);
    expect(negative.rows.length).toBe(0);

    // صحت‌سنجی اضافی: ظرفیت‌ها همیشه سازگارند
    const badCapacity = await db.execute<{ id: string }>(sql`
      SELECT id FROM menu_items WHERE reserved_count < 0 OR reserved_count > capacity
    `);
    expect(badCapacity.rows.length).toBe(0);
  });
});

afterAll(async () => {
  await closePool();
});
