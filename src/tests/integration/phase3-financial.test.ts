import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import { wallets, withdrawalRequests, reservations } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requestWithdrawal, approveWithdrawal, rejectWithdrawal } from '@/server/services/payment';
import { manualCharge, markNoShowReservations, reconcileLedger, MAX_MANUAL_CHARGE_RIALS } from '@/server/services/wallet-ops';
import { getSystemWallet } from '@/server/services/wallet';
import { validateIban } from '@/lib/iban';
import { createStudent, createMenuItemWithPrice, depositUserWallet, getWalletBalance, testActor, closePool } from './helpers';

/** شبای معتبر تستی — تولیدشده با الگوریتم mod-97 */
const VALID_IBAN = 'IR820540102680020817909002';

describe('فاز ۳ — شبا', () => {
  it('شبای معتبر پذیرفته می‌شود', () => {
    const r = validateIban(VALID_IBAN);
    expect(r.ok).toBe(true);
  });

  it('شبای نامعتبر (رقم کنترلی) رد می‌شود', () => {
    const r = validateIban('IR820540102680020817909003');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('معتبر نیست');
  });

  it('طول یا پیشوند غلط رد می‌شود', () => {
    expect(validateIban('IR123').ok).toBe(false);
    expect(validateIban('XX820540102680020817909002').ok).toBe(false);
    expect(validateIban('').ok).toBe(false);
  });

  it('ارقام فارسی و فاصله نرمال می‌شوند', () => {
    expect(validateIban('IR۸۲۰۵۴۰۱۰۲۶۸۰۰۲۰۸۱۷۹۰۹۰۰۲').ok).toBe(true);
  });
});

describe('فاز ۳ — شارژ دستی', () => {
  it('شارژ دستی موجودی را زیاد و دفتر را متوازن می‌کند', async () => {
    const s = await createStudent();
    const before = await getWalletBalance(s.userId);
    const res = await manualCharge({
      actor: { id: s.userId, role: 'SUPER_ADMIN', ip: null, userAgent: 'test' },
      userId: s.userId,
      amountRials: 300_000,
      reason: 'کمک‌هزینه نمایشی',
    });
    expect(res.ok).toBe(true);
    expect(await getWalletBalance(s.userId)).toBe(before + 300_000);

    // حساب ADJUSTMENT به همان اندازه بدهکار است — دفتر متوازن
    const adjustment = await getSystemWallet('ADJUSTMENT');
    expect(adjustment.balanceRials).toBe(-300_000);
  });

  it('بدون دلیل یا با مبلغ نامعتبر رد می‌شود', async () => {
    const s = await createStudent();
    const actor = { id: s.userId, role: 'SUPER_ADMIN', ip: null, userAgent: 'test' } as const;
    const noReason = await manualCharge({ actor, userId: s.userId, amountRials: 100_000, reason: '  ' });
    expect(noReason.ok).toBe(false);
    const negative = await manualCharge({ actor, userId: s.userId, amountRials: -5, reason: 'تست' });
    expect(negative.ok).toBe(false);
    const overCap = await manualCharge({ actor, userId: s.userId, amountRials: MAX_MANUAL_CHARGE_RIALS + 1, reason: 'تست سقف' });
    expect(overCap.ok).toBe(false);
  });
});

describe('فاز ۳ — برداشت با escrow', () => {
  it('درخواست → مسدودسازی در escrow؛ رد → آزادسازی؛ موجودی کاربر درست', async () => {
    const s = await createStudent();
    await depositUserWallet(s.userId, 1_000_000);
    const actor = testActor(s.userId);

    // درخواست برداشت با شبا
    const req = await requestWithdrawal({
      userId: s.userId, amountRials: 400_000,
      iban: VALID_IBAN, accountHolder: 'علی رضایی', actor,
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;

    // کاربر کم شده و escrow بیشتر شده — نه TREASURY
    expect(await getWalletBalance(s.userId)).toBe(600_000);
    const escrow = await getSystemWallet('WITHDRAWAL_ESCROW');
    expect(escrow.balanceRials).toBe(400_000);

    // شبا رمزنگاری‌شده ذخیره شده
    const [wr] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, req.requestId));
    expect(wr.ibanEncrypted).toBeTruthy();
    expect(wr.ibanEncrypted).not.toContain('IR');
    expect(wr.accountHolder).toBe('علی رضایی');

    // رد → آزادسازی
    const rej = await rejectWithdrawal({ requestId: req.requestId, actor });
    expect(rej.ok).toBe(true);
    expect(await getWalletBalance(s.userId)).toBe(1_000_000);
    expect((await getSystemWallet('WITHDRAWAL_ESCROW')).balanceRials).toBe(0);
  });

  it('تأیید → خروج از escrow به ADJUSTMENT با شماره پیگیری و ثبت تأییدکننده', async () => {
    const s = await createStudent();
    await depositUserWallet(s.userId, 500_000);
    const actor = testActor(s.userId);

    const adjustmentBefore = (await getSystemWallet('ADJUSTMENT')).balanceRials;
    const req = await requestWithdrawal({
      userId: s.userId, amountRials: 200_000,
      iban: VALID_IBAN, accountHolder: 'علی رضایی', actor,
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;

    // بدون شماره پیگیری رد می‌شود
    const noRef = await approveWithdrawal({ requestId: req.requestId, bankReference: '  ', actor });
    expect(noRef.ok).toBe(false);

    const app = await approveWithdrawal({ requestId: req.requestId, bankReference: 'PAYA-12345', actor });
    expect(app.ok).toBe(true);

    // escrow صفر و ADJUSTMENT به همان اندازه افزایش یافته (دلتا — تست‌های قبلی فایل روی مانده اثر دارند)
    expect((await getSystemWallet('WITHDRAWAL_ESCROW')).balanceRials).toBe(0);
    const adjustment = await getSystemWallet('ADJUSTMENT');
    expect(adjustment.balanceRials).toBe(adjustmentBefore + 200_000);

    // رکورد برداشت کامل است
    const [wr] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, req.requestId));
    expect(wr.status).toBe('APPROVED');
    expect(wr.bankReference).toBe('PAYA-12345');
    expect(wr.approvedBy).toBe(s.userId);
    expect(wr.processedAt).not.toBeNull();
  });

  it('تأیید و رد هم‌زمان ← فقط یکی برنده', async () => {
    const s = await createStudent();
    await depositUserWallet(s.userId, 800_000);
    const actor = testActor(s.userId);

    const req = await requestWithdrawal({
      userId: s.userId, amountRials: 300_000,
      iban: VALID_IBAN, accountHolder: 'تست', actor,
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;

    const [a, r] = await Promise.all([
      approveWithdrawal({ requestId: req.requestId, bankReference: 'REF-1', actor }),
      rejectWithdrawal({ requestId: req.requestId, actor }),
    ]);
    expect([a.ok, r.ok].filter(Boolean).length).toBe(1);

    const [wr] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, req.requestId));
    expect(['APPROVED', 'REJECTED']).toContain(wr.status);
    // escrow در هر دو حالت صفر است
    expect((await getSystemWallet('WITHDRAWAL_ESCROW')).balanceRials).toBe(0);
  });

  it('شبای نامعتبر در درخواست برداشت رد می‌شود', async () => {
    const s = await createStudent();
    await depositUserWallet(s.userId, 500_000);
    const res = await requestWithdrawal({
      userId: s.userId, amountRials: 100_000,
      iban: 'IR123', accountHolder: 'تست', actor: testActor(s.userId),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('شبا');
  });
});

describe('فاز ۳ — دفتر دوطرفه', () => {
  it('هر تراکنش جمع صفر دارد و balance_after زنجیرهٔ موجودی است', async () => {
    const s = await createStudent();
    await depositUserWallet(s.userId, 250_000);

    // ۱. هیچ تراکنشی جمع غیرصفر ندارد
    const badTxns = await db.execute<{ transaction_id: string; s: string }>(sql`
      SELECT transaction_id::text AS transaction_id, SUM(amount_rials)::text AS s
      FROM ledger_entries WHERE transaction_id IS NOT NULL
      GROUP BY transaction_id HAVING SUM(amount_rials) <> 0
    `);
    expect(badTxns.rows.length, `تراکنش‌های نامتوازن: ${JSON.stringify(badTxns.rows)}`).toBe(0);

    // ۲. زنجیرهٔ balance_after: هر ردیف = جمع تجمعی مبالغ تا آن ردیف
    const [w] = await db.select().from(wallets).where(eq(wallets.userId, s.userId));
    const rows = await db.execute<{ amount: string; after: string }>(sql`
      SELECT amount_rials::text AS amount, balance_after::text AS after
      FROM ledger_entries WHERE wallet_id = ${w.id} AND balance_after IS NOT NULL
      ORDER BY created_at, id
    `);
    expect(rows.rows.length).toBeGreaterThanOrEqual(1);
    let running = 0;
    for (const row of rows.rows) {
      running += Number(row.amount);
      expect(Number(row.after)).toBe(running);
    }
    // موجودی نهایی = آخرین balance_after
    expect(running).toBe(await getWalletBalance(s.userId));
  });
});

describe('فاز ۳ — NO_SHOW و تطبیق', () => {
  it('رزرو وعدهٔ گذشته NO_SHOW می‌شود', async () => {
    const s = await createStudent();
    await depositUserWallet(s.userId, 100_000);
    // منوی دیروز — وعده گذشته
    const { itemId } = await createMenuItemWithPrice({ priceRials: 50_000, dayOffset: -1 });
    const { createReservation } = await import('@/server/services/reservation');
    const r = await createReservation({ userId: s.userId, menuItemId: itemId, idempotencyKey: randomUUID(), actor: testActor(s.userId) });
    expect(r.ok).toBe(true);

    const { updated } = await markNoShowReservations();
    expect(updated).toBeGreaterThanOrEqual(1);

    if (r.ok) {
      const [res] = await db.select().from(reservations).where(eq(reservations.id, r.reservation.id));
      expect(res.status).toBe('NO_SHOW');
    }
  });

  it('تطبیق دفتر کل روی دادهٔ تست سالم است', async () => {
    const result = await reconcileLedger();
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

