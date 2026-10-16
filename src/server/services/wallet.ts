import { db } from '@/db';
import { wallets, ledgerEntries, ledgerTransactions } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

/** خطای کسب‌وکار با پیام فارسی */
export class BizError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BizError';
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const SYSTEM_WALLET_KEYS = {
  TREASURY: 'TREASURY',
  GATEWAY_CLEARING: 'GATEWAY_CLEARING',
  WITHDRAWAL_ESCROW: 'WITHDRAWAL_ESCROW',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;

export type SystemWalletType = keyof typeof SYSTEM_WALLET_KEYS;

export type LedgerEntryType = 'DEPOSIT' | 'WITHDRAWAL' | 'PURCHASE' | 'REFUND' | 'ADJUSTMENT' | 'SALE';

/** یک پایهٔ دفتر کل — مبلغ امضادار (مثبت = واریز به این کیف) */
export interface LedgerLeg {
  walletId: string;
  amountRials: number;
  entryType: LedgerEntryType;
  description?: string;
}

export async function getOrCreateWallet(userId: string) {
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(wallets)
    .values({
      userId,
      ownerType: 'USER',
      balanceRials: 0,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const again = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return again[0];
}

export async function getOrCreateWalletInTx(tx: Tx, userId: string) {
  const existing = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await tx
    .insert(wallets)
    .values({
      userId,
      ownerType: 'USER',
      balanceRials: 0,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const again = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return again[0];
}

export async function getSystemWallet(ownerType: SystemWalletType) {
  const key = SYSTEM_WALLET_KEYS[ownerType];
  const existing = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(wallets)
    .values({
      ownerType,
      ownerKey: key,
      balanceRials: 0,
      userId: null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const again = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)))
    .limit(1);
  return again[0];
}

export async function getSystemWalletInTx(tx: Tx, ownerType: SystemWalletType) {
  const key = SYSTEM_WALLET_KEYS[ownerType];
  const existing = await tx
    .select()
    .from(wallets)
    .where(and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [row] = await tx
    .insert(wallets)
    .values({
      ownerType,
      ownerKey: key,
      balanceRials: 0,
      userId: null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const again = await tx
    .select()
    .from(wallets)
    .where(and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)))
    .limit(1);
  return again[0];
}

export async function getWalletBalance(userId: string): Promise<number> {
  const w = await getOrCreateWallet(userId);
  return w.balanceRials;
}

/* ───────────── دفتر کل دوطرفه (فاز ۳-۱) ───────────── */

/**
 * ثبت یک تراکنش دفتر کل با چند پایه — قواعد:
 *  ۱. جمع مبالغ همهٔ پایه‌ها باید دقیقاً صفر باشد (دفتر دوطرفه).
 *  ۲. موجودی هر کیف زیر قفل ردیف (FOR UPDATE به ترتیب شناسه برای جلوگیری از deadlock) به‌روز می‌شود.
 *  ۳. هر ردیف balance_after (موجودی پس از ردیف) ثبت می‌کند — ممیزی زنجیرهٔ موجودی ممکن است.
 *  ۴. کیف کاربر هرگز منفی نمی‌شود (BizError).
 *  ۵. idempotency روی کلید تراکنش — تکرار همان کلید هیچ اثری ندارد.
 */
export async function recordTransactionInTx(
  tx: Tx,
  input: {
    idempotencyKey: string;
    description?: string;
    referenceId?: string | null;
    createdBy?: string | null;
    legs: LedgerLeg[];
  },
): Promise<{ transactionId: string }> {
  if (input.legs.length < 2) {
    throw new BizError('تراکنش دفتر کل حداقل دو پایه دارد');
  }
  const sum = input.legs.reduce((acc, l) => acc + l.amountRials, 0);
  if (sum !== 0) {
    throw new BizError('جمع ردیف‌های تراکنش دفتر کل صفر نیست');
  }
  for (const leg of input.legs) {
    if (!Number.isInteger(leg.amountRials)) {
      throw new BizError('مبالغ دفتر کل باید عدد صحیح ریال باشند');
    }
  }

  // درج تراکنش — idempotent
  const [txn] = await tx
    .insert(ledgerTransactions)
    .values({
      idempotencyKey: input.idempotencyKey,
      description: input.description ?? null,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!txn) {
    // قبلاً ثبت شده — idempotent
    const [existing] = await tx
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    return { transactionId: existing.id };
  }

  // قفل همهٔ کیف‌های درگیر به ترتیب یکتا (جلوگیری از deadlock)
  const walletIds = [...new Set(input.legs.map((l) => l.walletId))].sort();
  const walletInfo = new Map<string, { balance: number; ownerType: string }>();
  for (const wid of walletIds) {
    const locked = await tx
      .select({
        id: wallets.id,
        balance: wallets.balanceRials,
        ownerType: wallets.ownerType,
      })
      .from(wallets)
      .where(eq(wallets.id, wid))
      .for('update');
    if (!locked[0]) throw new BizError('کیف پول یافت نشد');
    walletInfo.set(wid, { balance: locked[0].balance, ownerType: locked[0].ownerType });
  }

  // اعمال پایه‌ها به ترتیب ورودی
  for (const leg of input.legs) {
    const info = walletInfo.get(leg.walletId);
    if (!info) throw new BizError('کیف پول یافت نشد');
    const after = info.balance + leg.amountRials;
    if (info.ownerType === 'USER' && after < 0) {
      throw new BizError('موجودی کیف پول کافی نیست');
    }
    await tx
      .update(wallets)
      .set({ balanceRials: sql`${wallets.balanceRials} + ${leg.amountRials}`, updatedAt: new Date() })
      .where(eq(wallets.id, leg.walletId));
    walletInfo.set(leg.walletId, { balance: after, ownerType: info.ownerType });

    await tx.insert(ledgerEntries).values({
      walletId: leg.walletId,
      transactionId: txn.id,
      amountRials: leg.amountRials,
      balanceAfter: after,
      entryType: leg.entryType,
      referenceId: input.referenceId ?? null,
      idempotencyKey: `${input.idempotencyKey}:${leg.walletId}`,
      description: leg.description ?? input.description ?? null,
    });
  }

  return { transactionId: txn.id };
}

/* ───────────── سازگاری — رابط‌های قدیمی با تراکنش واقعی ─────────────
 * این رابط‌ها برای فراخوانی‌های تک‌پایه استفاده نمی‌شوند؛
 * همهٔ فراخوانی‌ها باید recordTransactionInTx با هر دو پایه را صدا بزنند. */

export { getOrCreateWalletInTx as _getOrCreateWalletInTx, getSystemWalletInTx as _getSystemWalletInTx };
