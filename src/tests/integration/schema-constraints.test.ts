import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { createStudent, createMenuItemWithPrice, depositUserWallet, closePool } from './helpers';

/**
 * فاز ۱-۴ — قیدهای واقعی دیتابیس روی migration واقعی.
 * هر قید باید INSERT/UPDATE خلاف‌کننده را رد کند.
 */

async function raw(query: ReturnType<typeof sql>) {
  await db.execute(query);
}

/** انتظار رد شدن با قید مشخص — خطای pg ممکن است در cause باشد (DrizzleQueryError) */
async function expectReject(query: ReturnType<typeof sql>, code: string, constraint: string) {
  let err: unknown;
  try {
    await db.execute(query);
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`کوئری باید با قید ${constraint} رد می‌شد`);
  const pgErr = (err as { cause?: { code?: string; constraint?: string } }).cause ?? err as { code?: string; constraint?: string };
  expect(pgErr.code).toBe(code);
  expect(pgErr.constraint).toBe(constraint);
}

describe('قیدهای دیتابیس (migration واقعی)', () => {
  it('کیف کاربر نمی‌تواند منفی شود', async () => {
    const { userId } = await createStudent();
    await expectReject(
      sql`INSERT INTO wallets (user_id, owner_type, balance_rials) VALUES (${userId}, 'USER', -1)`,
      '23514', 'wallet_balance_check',
    );
  });

  it('مبلغ پرداخت باید مثبت باشد', async () => {
    const { userId } = await createStudent();
    await expectReject(
      sql`INSERT INTO payments (user_id, amount_rials, status, gateway, idempotency_key) VALUES (${userId}, 0, 'PENDING', 'sandbox', ${'pay-neg-' + Date.now()})`,
      '23514', 'positive_payment_check',
    );
  });

  it('مبلغ برداشت باید مثبت باشد', async () => {
    const { userId } = await createStudent();
    await expectReject(
      sql`INSERT INTO withdrawal_requests (user_id, amount_rials, status) VALUES (${userId}, -1000, 'PENDING')`,
      '23514', 'positive_withdrawal_check',
    );
  });

  it('ظرفیت آیتم منو باید مثبت باشد و reserved_count بین ۰ و ظرفیت', async () => {
    const { itemId } = await createMenuItemWithPrice();
    await expectReject(
      sql`UPDATE menu_items SET capacity = 0 WHERE id = ${itemId}`,
      '23514', 'menu_items_capacity_check',
    );
    await expectReject(
      sql`UPDATE menu_items SET reserved_count = capacity + 1 WHERE id = ${itemId}`,
      '23514', 'menu_items_reserved_check',
    );
  });

  it('قیمت نمی‌تواند منفی باشد و (آیتم، گروه) یکتاست', async () => {
    const { itemId } = await createMenuItemWithPrice({ groups: ['STUDENT', 'EMPLOYEE'] });
    await expectReject(
      sql`UPDATE menu_item_prices SET price_rials = -1 WHERE menu_item_id = ${itemId}`,
      '23514', 'menu_item_prices_nonnegative_check',
    );
    await expectReject(
      sql`INSERT INTO menu_item_prices (menu_item_id, customer_group, price_rials) VALUES (${itemId}, 'STUDENT', 50000)`,
      '23505', 'menu_item_prices_item_group_idx',
    );
  });

  it('(منو، غذا) یکتاست — غذای تکراری در یک وعده رد می‌شود', async () => {
    const f = await createMenuItemWithPrice();
    await expectReject(
      sql`INSERT INTO menu_items (menu_id, food_id, capacity) VALUES (${f.menuId}, ${f.foodId}, 10)`,
      '23505', 'menu_items_menu_food_idx',
    );
  });

  it('هر کاربر حداکثر یک رزرو CONFIRMED برای هر آیتم — رزرو فعال تکراری رد می‌شود', async () => {
    const { userId } = await createStudent();
    const { itemId } = await createMenuItemWithPrice();
    await raw(sql`INSERT INTO reservations (user_id, menu_item_id, status, quantity, price_snapshot_rials, qr_token, idempotency_key, reserved_at)
      VALUES (${userId}, ${itemId}, 'CONFIRMED', 1, 100000, ${'qr-' + Date.now()}, ${'idem-' + Date.now()}, now())`);
    await expectReject(
      sql`INSERT INTO reservations (user_id, menu_item_id, status, quantity, price_snapshot_rials, qr_token, idempotency_key, reserved_at)
        VALUES (${userId}, ${itemId}, 'CONFIRMED', 1, 100000, ${'qr2-' + Date.now()}, ${'idem2-' + Date.now()}, now())`,
      '23505', 'reservations_user_item_active_idx',
    );
    // اما رزرو CANCELLED در کنار CONFIRMED مجاز است (رزرو مجدد پس از لغو)
    await raw(sql`INSERT INTO reservations (user_id, menu_item_id, status, quantity, price_snapshot_rials, qr_token, idempotency_key, reserved_at)
      VALUES (${userId}, ${itemId}, 'CANCELLED', 1, 100000, ${'qr3-' + Date.now()}, ${'idem3-' + Date.now()}, now())`);
  });

  it('مقادیر enum نامعتبر رد می‌شوند', async () => {
    const { userId } = await createStudent();
    await expectReject(
      sql`UPDATE users SET role = 'HACKER' WHERE id = ${userId}`,
      '23514', 'users_role_check',
    );
    await expectReject(
      sql`INSERT INTO wallets (user_id, owner_type, balance_rials) VALUES (${userId}, 'SECRET', 0)`,
      '23514', 'wallets_owner_type_check',
    );
  });

  it('جدول audit_logs فقط افزودنی است — UPDATE و DELETE رد می‌شوند', async () => {
    await raw(sql`INSERT INTO audit_logs (action, entity_type) VALUES ('auth:login_failed', 'login')`);
    await expect(raw(sql`UPDATE audit_logs SET action = 'tampered' WHERE action = 'auth:login_failed'`)).rejects.toThrow();
    await expect(raw(sql`DELETE FROM audit_logs WHERE action = 'auth:login_failed'`)).rejects.toThrow();
  });

  it('جدول ledger_entries فقط افزودنی است', async () => {
    const { userId } = await createStudent();
    await depositUserWallet(userId, 100_000);
    await expect(raw(sql`UPDATE ledger_entries SET amount_rials = 999999999`)).rejects.toThrow();
    await expect(raw(sql`DELETE FROM ledger_entries`)).rejects.toThrow();
  });

  it('مبالغ بزرگ (فراتر از سقف integer) در کیف پذیرفته می‌شوند — bigint', async () => {
    const { userId } = await createStudent();
    await depositUserWallet(userId, 3_000_000_000);
    const balance = await db.execute<{ balance: string }>(
      sql`SELECT balance_rials::text AS balance FROM wallets WHERE user_id = ${userId}`,
    );
    expect(Number(balance.rows[0].balance)).toBe(3_000_000_000);
    const entries = await db.execute<{ total: string }>(
      sql`SELECT amount_rials::text AS total FROM ledger_entries WHERE amount_rials = 3000000000`,
    );
    expect(entries.rows.length).toBeGreaterThanOrEqual(1);
  });
});

afterAll(async () => {
  await closePool();
});
