import { db } from '@/db';
import { users, wallets, reservations, menuItems, menus, mealSlots } from '@/db/schema';
import { and, eq, isNull, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { audit, type AuditActor } from '@/lib/audit';
import { BizError, getOrCreateWalletInTx, getSystemWalletInTx, recordTransactionInTx } from './wallet';
import { mealInstant } from '@/lib/tehran-time';
import { assertUserEligibleInTx } from './eligibility';

/** سقف شارژ دستی تک‌تراکنش (۵ میلیون تومان) */
export const MAX_MANUAL_CHARGE_RIALS = 50_000_000;

/**
 * شارژ دستی کیف پول توسط معاونت/مدیر تغذیه (فاز ۳-۲).
 * ثبت در دفتر کل با حساب ADJUSTMENT — جمع صفر.
 */
export async function manualCharge(input: {
  actor: AuditActor;
  userId: string;
  amountRials: number;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!Number.isInteger(input.amountRials) || input.amountRials <= 0) {
    return { ok: false as const, error: 'مبلغ نامعتبر است' };
  }
  if (input.amountRials > MAX_MANUAL_CHARGE_RIALS) {
    return { ok: false as const, error: 'سقف شارژ دستی ۵٬۰۰۰٬۰۰۰ تومان است' };
  }
  if (reason.length < 3 || reason.length > 200) {
    return { ok: false as const, error: 'دلیل شارژ (۳ تا ۲۰۰ نویسه) الزامی است' };
  }
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
    .limit(1);
  if (!user) return { ok: false as const, error: 'کاربر یافت نشد' };

  const txnId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      // فاز ۱-۶: شارژ حساب غیرفعال/دانشجوی غیر ACTIVE مجاز نیست
      await assertUserEligibleInTx(tx, input.userId, 'charge');
      const userWallet = await getOrCreateWalletInTx(tx, input.userId);
      const adjustment = await getSystemWalletInTx(tx, 'ADJUSTMENT');
      await recordTransactionInTx(tx, {
        idempotencyKey: `charge:${txnId}`,
        referenceId: txnId,
        description: `شارژ دستی: ${reason}`,
        createdBy: input.actor.id,
        legs: [
          {
            walletId: userWallet.id,
            amountRials: input.amountRials,
            entryType: 'DEPOSIT',
            description: `شارژ دستی: ${reason}`,
          },
          {
            walletId: adjustment.id,
            amountRials: -input.amountRials,
            entryType: 'ADJUSTMENT',
            description: 'شارژ دستی توسط مدیریت',
          },
        ],
      });
    });
  } catch (e) {
    if (e instanceof BizError) return { ok: false as const, error: e.message };
    throw e;
  }

  await audit({
    actor: input.actor,
    action: 'wallet:manual_charge',
    entityType: 'wallet',
    entityId: input.userId,
    after: { amountRials: input.amountRials, reason },
  });
  return { ok: true as const };
}

/**
 * علامت‌گذاری NO_SHOW (فاز ۳-۳) — رزروهای CONFIRMED برای وعده‌های گذشته.
 * سیاست: بدون بازپرداخت (مستند و قابل تغییر).
 */
export async function markNoShowReservations(): Promise<{ updated: number }> {
  // وعده‌های گذشته: لحظهٔ پایان وعده = تاریخ منو + ساعت پایان به وقت تهران
  const rows = await db
    .select({ id: reservations.id, menuDate: menus.date, endTime: mealSlots.endTime })
    .from(reservations)
    .innerJoin(menuItems, eq(menuItems.id, reservations.menuItemId))
    .innerJoin(menus, eq(menus.id, menuItems.menuId))
    .innerJoin(mealSlots, eq(mealSlots.id, menus.mealSlotId))
    .where(eq(reservations.status, 'CONFIRMED'));
  const now = Date.now();
  const expired = rows
    .filter((r) => mealInstant(r.menuDate, new Date(r.endTime)).getTime() < now)
    .map((r) => r.id);
  if (expired.length === 0) return { updated: 0 };
  await db
    .update(reservations)
    .set({ status: 'NO_SHOW', updatedAt: new Date() })
    .where(inArray(reservations.id, expired));
  return { updated: expired.length };
}

/**
 * تطبیق دفتر کل (فاز ۳-۱) — ناوردایی‌ها را روی دیتابیس واقعی بررسی می‌کند.
 * خروجی: فهرست اختلاف‌ها (خالی = سالم).
 */
export async function reconcileLedger(): Promise<{
  ok: boolean;
  issues: Array<{ check: string; detail: string }>;
}> {
  const issues: Array<{ check: string; detail: string }> = [];

  // ۱. جمع کل دفتر = صفر
  const total = await db.execute<{ sum: string | null }>(
    sql`SELECT COALESCE(SUM(amount_rials), 0)::text AS sum FROM ledger_entries`,
  );
  const totalSum = Number(total.rows[0].sum);
  if (totalSum !== 0)
    issues.push({ check: 'جمع کل', detail: `جمع دفتر ${totalSum} ریال است (باید صفر باشد)` });

  // ۲. موجودی هر کیف = جمع ردیف‌هایش
  const mismatch = await db.execute<{ wallet_id: string }>(sql`
    SELECT w.id AS wallet_id FROM wallets w
    LEFT JOIN (SELECT wallet_id, SUM(amount_rials) AS s FROM ledger_entries GROUP BY wallet_id) l
      ON l.wallet_id = w.id
    WHERE w.balance_rials <> COALESCE(l.s, 0)
  `);
  for (const row of mismatch.rows) {
    issues.push({ check: 'موجودی vs دفتر', detail: `کیف ${row.wallet_id} با جمع ردیف‌هایش نمی‌خواند` });
  }

  // ۳. هیچ کیف کاربری منفی نیست
  const negative = await db.execute<{ id: string }>(sql`
    SELECT id FROM wallets WHERE owner_type = 'USER' AND balance_rials < 0
  `);
  for (const row of negative.rows) {
    issues.push({ check: 'کیف منفی', detail: `کیف کاربری ${row.id} منفی است` });
  }

  // ۴. هر تراکنش جمع صفر دارد
  const badTxns = await db.execute<{ transaction_id: string; sum: string }>(sql`
    SELECT transaction_id, SUM(amount_rials)::text AS sum FROM ledger_entries
    WHERE transaction_id IS NOT NULL
    GROUP BY transaction_id HAVING SUM(amount_rials) <> 0
  `);
  for (const row of badTxns.rows) {
    issues.push({ check: 'تراکنش نامتوازن', detail: `تراکنش ${row.transaction_id} جمعش ${row.sum} است` });
  }

  return { ok: issues.length === 0, issues };
}
