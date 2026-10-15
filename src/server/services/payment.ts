import { db } from '@/db';
import { payments, withdrawalRequests, wallets, ledgerEntries, users } from '@/db/schema';
import { and, eq, sql, desc, isNull, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { audit, type AuditActor } from '@/lib/audit';
import { BizError, getOrCreateWalletInTx, creditWalletInTx, adjustSystemWalletInTx } from './wallet';
import { toJalaliDateTime } from '@/lib/jalali';

/**
 * لایهٔ درگاه پرداخت.
 * در حال حاضر پیاده‌سازی `sandbox` فعال است؛ برای اتصال درگاه واقعی
 * (زرین‌پال / به‌پرداخت) کافی است همین interface را پیاده‌سازی کنید.
 */
export interface PaymentGateway {
  name: string;
  /** ایجاد پرداخت و دریافت URL SvenGate */
  createPayment(input: { paymentId: string; amountRials: number; description: string }): Promise<{ ok: true; redirectUrl: string } | { ok: false; error: string }>;
  /** petrol — callback gateway */
  verifyCallback?(params: Record<string, string>): Promise<{ ok: true; paymentId: string; reference: string } | { ok: false }>;
}

/**
 * درگاه Sandbox — پرداخت فوری و موفق.
 * صفحهٔ `/wallet/pay` این درگاه را شبیه‌سازی می‌کند.
 */
export const sandboxGateway: PaymentGateway = {
  name: 'sandbox',
  async createPayment(input) {
    return {
      ok: true,
      redirectUrl: `/wallet/pay?paymentId=${input.paymentId}`,
    };
  },
};

export function getGateway(name:string):PaymentGateway {if(name==='sandbox'&&process.env.NODE_ENV!=='production')return sandboxGateway;throw new BizError('درگاه پرداخت پیکربندی نشده است');}

/* ───────────── digne Top-up ───────────── */

export async function initiateTopUp(input: {
  userId: string;
  amountRials: number;
  description?: string;
  actor: AuditActor;
}) {
  if (!Number.isInteger(input.amountRials) || input.amountRials <= 0) {
    return { ok: false as const, error: 'مبلغ نامعتبر است' };
  }

  if (process.env.NODE_ENV === 'production') return {ok:false as const,error:'درگاه پرداخت بانکی هنوز پیکربندی نشده است. برای شارژ با معاونت دانشجویی هماهنگ کنید.'};
  const paymentId = randomUUID();
  const gateway = getGateway('sandbox');
  const created = await gateway.createPayment({
    paymentId,
    amountRials: input.amountRials,
    description: input.description ?? 'شارژ کیف پول',
  });
  if (!created.ok) return { ok: false as const, error: created.error };

  const [payment] = await db.insert(payments).values({
    id: paymentId,
    userId: input.userId,
    amountRials: input.amountRials,
    status: 'PENDING',
    gateway: gateway.name,
    idempotencyKey: `topup:${paymentId}`,
    description: input.description ?? 'شارژ کیف پول',
  }).returning();

  await audit({
    actor: input.actor,
    action: 'payment:initiated',
    entityType: 'payment',
    entityId: payment.id,
    after: { amountRials: input.amountRials, gateway: gateway.name },
  });

  return { ok: true as const, payment, redirectUrl: created.redirectUrl };
}

export async function getPayment(paymentId: string, userId: string) {
  const rows = await db.select().from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * تکمیل پرداخت — idempotent.
 * فراخوانی gateway واقعی از طریق callback/cron صورت می‌گیرد.
 */
export async function completePayment(input: {
  paymentId: string;
  providerReference: string;
  actor: AuditActor;
}) {
  if(process.env.NODE_ENV==='production')return {ok:false as const,error:'تأیید آزمایشی پرداخت در محیط عملیاتی مجاز نیست'};
  const rows = await db.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
  const payment = rows[0];
  if (!payment) return { ok: false as const, error: 'پرداخت یافت نشد' };
  if (payment.status === 'COMPLETED') {
    return { ok: true as const, payment, alreadyCompleted: true };
  }
  if (payment.status !== 'PENDING') {
    return { ok: false as const, error: 'این پرداخت قابل تکمیل نیست' };
  }

  try {
    await db.transaction(async (tx) => {
      const locked = await tx.select().from(payments)
        .where(eq(payments.id, payment.id))
        .for('update');
      if (locked[0].status !== 'PENDING') {
        throw new BizError('این پرداخت قبلاً پردازش شده است');
      }

      // واریز به کیف کاربر
      const userWallet = await getOrCreateWalletInTx(tx, payment.userId);
      await creditWalletInTx(
        tx, userWallet.id, payment.amountRials, 'DEPOSIT', payment.id,
        `payment:${payment.id}`, 'شارژ کیف پول',
      );

      // تسویه درگاه
      await adjustSystemWalletInTx(
        tx, 'GATEWAY_CLEARING', -payment.amountRials, 'DEPOSIT', payment.id,
        `payment_settle:${payment.id}`, 'تسویه درگاه پرداخت',
      );

      await tx.update(payments)
        .set({
          status: 'COMPLETED',
          providerReference: input.providerReference,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
    });
  } catch (e) {
    if (e instanceof BizError) {
      return { ok: false as const, error: e.message };
    }
    // race: پرداخت همزمان —ugada idempotent
    const again = await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
    if (again[0]?.status === 'COMPLETED') {
      return { ok: true as const, payment: again[0], alreadyCompleted: true };
    }
    throw e;
  }

  const updated = await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
  await audit({
    actor: input.actor,
    action: 'payment:completed',
    entityType: 'payment',
    entityId: payment.id,
    after: { amountRials: payment.amountRials, reference: input.providerReference },
  });

  return { ok: true as const, payment: updated[0] };
}

export async function failPayment(input: {
  paymentId: string;
  actor: AuditActor;
}) {
  const rows = await db.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
  const payment = rows[0];
  if (!payment) return { ok: false as const, error: 'پرداخت یافت نشد' };
  if (payment.status !== 'PENDING') {
    return { ok: false as const, error: 'وضعیت این پرداخت قابل تغییر نیست' };
  }

  await db.update(payments)
    .set({ status: 'FAILED', updatedAt: new Date() })
    .where(eq(payments.id, payment.id));

  await audit({
    actor: input.actor,
    action: 'payment:failed',
    entityType: 'payment',
    entityId: payment.id,
  });

  return { ok: true as const };
}

/* ───────────── Deposit / Withdrawal ───────────── */

export async function getWalletLedger(userId: string, limit = 50) {
  const wallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (!wallet[0]) return { wallet: null, entries: [] };

  const entries = await db.select().from(ledgerEntries)
    .where(eq(ledgerEntries.walletId, wallet[0].id))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(limit);

  return {
    wallet: wallet[0],
    entries: entries.map((e) => ({
      id: e.id,
      amountRials: e.amountRials,
      entryType: e.entryType,
      description: e.description,
      createdAt: toJalaliDateTime(e.createdAt),
    })),
  };
}

export async function getMyPayments(userId: string, limit = 20) {
  const rows = await db.select().from(payments)
    .where(and(eq(payments.userId, userId), isNull(payments.deletedAt)))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  return rows.map((p) => ({
    id: p.id,
    amountRials: p.amountRials,
    status: p.status,
    gateway: p.gateway,
    description: p.description,
    createdAt: toJalaliDateTime(p.createdAt),
  }));
}

/* ───────────── درخواست برداشت ───────────── */

export async function requestWithdrawal(input: {
  userId: string;
  amountRials: number;
  actor: AuditActor;
}) {
  if (!Number.isInteger(input.amountRials) || input.amountRials <= 0) {
    return { ok: false as const, error: 'مبلغ نامعتبر است' };
  }

  const wallet = await db.select().from(wallets).where(eq(wallets.userId, input.userId)).limit(1);
  if (!wallet[0] || wallet[0].balanceRials < input.amountRials) {
    return { ok: false as const, error: 'موجودی کیف پول کافی نیست' };
  }

  const requestId = randomUUID();

  try {
    await db.transaction(async (tx) => {
      const w = await tx.select().from(wallets)
        .where(eq(wallets.userId, input.userId))
        .for('update');
      if (!w[0] || w[0].balanceRials < input.amountRials) {
        throw new BizError('موجودی کیف پول کافی نیست');
      }

      await tx.update(wallets)
        .set({ balanceRials: sql`${wallets.balanceRials} - ${input.amountRials}`, updatedAt: new Date() })
        .where(eq(wallets.id, w[0].id));

      await tx.insert(ledgerEntries).values({
        walletId: w[0].id,
        amountRials: -input.amountRials,
        entryType: 'WITHDRAWAL',
        referenceId: requestId,
        idempotencyKey: `withdraw_hold:${requestId}`,
        description: 'درخواست برداشت — مسدودسازی مبلغ',
      });
      await adjustSystemWalletInTx(tx,'TREASURY',input.amountRials,'ADJUSTMENT',requestId,`withdraw_hold_counter:${requestId}`,'ذخیره مبلغ برداشت');

      await tx.insert(withdrawalRequests).values({
        id: requestId,
        userId: input.userId,
        amountRials: input.amountRials,
        status: 'PENDING',
      });
    });
  } catch (e) {
    if (e instanceof BizError) return { ok: false as const, error: e.message };
    throw e;
  }

  await audit({
    actor: input.actor,
    action: 'withdrawal:requested',
    entityType: 'withdrawal_request',
    entityId: requestId,
    after: { amountRials: input.amountRials },
  });

  return { ok: true as const, requestId };
}

export async function approveWithdrawal(input: {
  requestId: string;
  actor: AuditActor;
}) {
  const rows = await db.select().from(withdrawalRequests)
    .where(eq(withdrawalRequests.id, input.requestId))
    .limit(1);
  const req = rows[0];
  if (!req) return { ok: false as const, error: 'درخواست یافت نشد' };
  if (req.status !== 'PENDING') {
    return { ok: false as const, error: 'این درخواست قبلاً پردازش شده است' };
  }

  await db.transaction(async (tx) => {
    const locked = await tx.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.id, req.id))
      .for('update');
    if (locked[0].status !== 'PENDING') {
      throw new BizError('این درخواست قبلاً پردازش شده است');
    }

    // کسر از TREASURY (پرداخت نقدی)
    await adjustSystemWalletInTx(
      tx, 'TREASURY', -req.amountRials, 'WITHDRAWAL', req.id,
      `withdraw_out:${req.id}`, 'پرداخت درخواست برداشت',
    );

    await tx.update(withdrawalRequests)
      .set({ status: 'APPROVED', updatedAt: new Date() })
      .where(eq(withdrawalRequests.id, req.id));
  });

  await audit({
    actor: input.actor,
    action: 'withdrawal:approved',
    entityType: 'withdrawal_request',
    entityId: req.id,
    after: { amountRials: req.amountRials, userId: req.userId },
  });

  return { ok: true as const };
}

export async function rejectWithdrawal(input: {
  requestId: string;
  actor: AuditActor;
}) {
  const rows = await db.select().from(withdrawalRequests)
    .where(eq(withdrawalRequests.id, input.requestId))
    .limit(1);
  const req = rows[0];
  if (!req) return { ok: false as const, error: 'درخواست یافت نشد' };
  if (req.status !== 'PENDING') {
    return { ok: false as const, error: 'این درخواست قبلاً پردازش شده است' };
  }

  await db.transaction(async (tx) => {
    const locked = await tx.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.id, req.id))
      .for('update');
    if (locked[0].status !== 'PENDING') {
      throw new BizError('این درخواست قبلاً پردازش شده است');
    }

    // آزادسازی مبلغ مسدودشده
    const userWallet = await getOrCreateWalletInTx(tx, req.userId);
    await creditWalletInTx(
      tx, userWallet.id, req.amountRials, 'REFUND', req.id,
      `withdraw_release:${req.id}`, 'رد درخواست برداشت — آزادسازی مبلغ',
    );
    await adjustSystemWalletInTx(tx,'TREASURY',-req.amountRials,'REFUND',req.id,`withdraw_release_counter:${req.id}`,'آزادسازی ذخیره برداشت');

    await tx.update(withdrawalRequests)
      .set({ status: 'REJECTED', updatedAt: new Date() })
      .where(eq(withdrawalRequests.id, req.id));
  });

  await audit({
    actor: input.actor,
    action: 'withdrawal:rejected',
    entityType: 'withdrawal_request',
    entityId: req.id,
    after: { amountRials: req.amountRials, userId: req.userId },
  });

  return { ok: true as const };
}

/* ───────────── مدیریت — SaudiMMMM ───────────── */

export async function listWithdrawalRequests(filters: { status?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));
  const conditions = [];
  if (filters.status && filters.status !== 'ALL') {
    conditions.push(eq(withdrawalRequests.status, filters.status as never));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select().from(withdrawalRequests)
    .where(where)
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const userRows = userIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((r) => ({
    id: r.id,
    amountRials: r.amountRials,
    status: r.status,
    createdAt: toJalaliDateTime(r.createdAt),
    userName: userById.get(r.userId)?.displayName ?? '—',
    userUsername: userById.get(r.userId)?.username ?? '—',
  }));
}

export async function getSystemWalletBalances() {
  const rows = await db.select().from(wallets).where(
    sql`${wallets.ownerType} <> 'USER'`,
  );
  const userTotal = await db.select({
    total: sql<number>`coalesce(sum(${wallets.balanceRials}), 0)`,
  }).from(wallets).where(eq(wallets.ownerType, 'USER'));

  return {
    system: rows.map((w) => ({
      ownerType: w.ownerType,
      ownerKey: w.ownerKey,
      balanceRials: w.balanceRials,
    })),
    totalUserBalances: Number(userTotal[0]?.total ?? 0),
  };
}

export async function getRecentLedgerEntries(limit = 30) {
  const entries = await db.select().from(ledgerEntries)
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(limit);
  const walletIds = [...new Set(entries.map((e) => e.walletId))];
  const walletRows = walletIds.length > 0
    ? await db.select().from(wallets).where(inArray(wallets.id, walletIds))
    : [];
  const walletById = new Map(walletRows.map((w) => [w.id, w]));
  const userIds = [...new Set(walletRows.map((w) => w.userId).filter((x): x is string => Boolean(x)))];
  const userRows = userIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));

  return entries.map((e) => {
    const w = walletById.get(e.walletId);
    return {
      id: e.id,
      amountRials: e.amountRials,
      entryType: e.entryType,
      description: e.description,
      createdAt: toJalaliDateTime(e.createdAt),
      ownerType: w?.ownerType ?? '—',
      ownerKey: w?.ownerKey ?? null,
      userName: w?.userId ? (userById.get(w.userId)?.displayName ?? '—') : null,
    };
  });
}
