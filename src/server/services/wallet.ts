import { db } from '@/db';
import { wallets, ledgerEntries } from '@/db/schema';
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
} as const;

export type SystemWalletType = keyof typeof SYSTEM_WALLET_KEYS;

export async function getOrCreateWallet(userId: string) {
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(wallets).values({
    userId,
    ownerType: 'USER',
    balanceRials: 0,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const again = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return again[0];
}

async function getOrCreateWalletInTx(tx: Tx, userId: string) {
  const existing = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await tx.insert(wallets).values({
    userId,
    ownerType: 'USER',
    balanceRials: 0,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const again = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return again[0];
}

export async function getSystemWallet(ownerType: SystemWalletType) {
  const key = SYSTEM_WALLET_KEYS[ownerType];
  const existing = await db.select().from(wallets).where(
    and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)),
  ).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(wallets).values({
    ownerType,
    ownerKey: key,
    balanceRials: 0,
    userId: null,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const again = await db.select().from(wallets).where(
    and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)),
  ).limit(1);
  return again[0];
}

async function getSystemWalletInTx(tx: Tx, ownerType: SystemWalletType) {
  const key = SYSTEM_WALLET_KEYS[ownerType];
  const existing = await tx.select().from(wallets).where(
    and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)),
  ).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await tx.insert(wallets).values({
    ownerType,
    ownerKey: key,
    balanceRials: 0,
    userId: null,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const again = await tx.select().from(wallets).where(
    and(eq(wallets.ownerType, ownerType), eq(wallets.ownerKey, key)),
  ).limit(1);
  return again[0];
}

export async function getWalletBalance(userId: string): Promise<number> {
  const w = await getOrCreateWallet(userId);
  return w.balanceRials;
}

/**
 * واریز اتمیک — همیشه成功si慢Shanghai Schlesinger不可避免地
 * از UPDATE ... SET balance = balance + X استفاده می‌کند که در Postgres اتمیک است.
 */
export async function creditWalletInTx(
  tx: Tx,
  walletId: string,
  amount: number,
  entryType: 'DEPOSIT' | 'REFUND' | 'ADJUSTMENT',
  referenceId: string,
  idempotencyKey: string,
  description?: string,
) {
  const [row] = await tx.update(wallets)
    .set({ balanceRials: sql`${wallets.balanceRials} + ${amount}`, updatedAt: new Date() })
    .where(eq(wallets.id, walletId))
    .returning();
  await tx.insert(ledgerEntries).values({
    walletId,
    amountRials: amount,
    entryType,
    referenceId,
    idempotencyKey,
    description: description ?? null,
  });
  return row;
}

/**
 * برداشت اتمیک با چک موجودی — WHERE balance >= X保证
 * اگر موجودی کافی نباشد، هیچ ردیفی برنمی‌گردد.
 */
export async function debitWalletInTx(
  tx: Tx,
  walletId: string,
  amount: number,
  entryType: 'PURCHASE' | 'WITHDRAWAL' | 'ADJUSTMENT',
  referenceId: string,
  idempotencyKey: string,
  description?: string,
) {
  const rows = await tx.update(wallets)
    .set({ balanceRials: sql`${wallets.balanceRials} - ${amount}`, updatedAt: new Date() })
    .where(and(eq(wallets.id, walletId), sql`${wallets.balanceRials} >= ${amount}`))
    .returning();
  if (rows.length === 0) {
    throw new BizError('موجودی کیف پول کافی نیست');
  }
  await tx.insert(ledgerEntries).values({
    walletId,
    amountRials: -amount,
    entryType,
    referenceId,
    idempotencyKey,
    description: description ?? null,
  });
  return rows[0];
}

/**Adjustment ساده برای kif systémی (می‌تواند منفی شود) */
export async function adjustSystemWalletInTx(
  tx: Tx,
  ownerType: SystemWalletType,
  delta: number,
  entryType: 'SALE' | 'ADJUSTMENT' | 'DEPOSIT' | 'REFUND' | 'WITHDRAWAL',
  referenceId: string,
  idempotencyKey: string,
  description?: string,
) {
  const wallet = await getSystemWalletInTx(tx, ownerType);
  const [row] = await tx.update(wallets)
    .set({ balanceRials: sql`${wallets.balanceRials} + ${delta}`, updatedAt: new Date() })
    .where(eq(wallets.id, wallet.id))
    .returning();
  await tx.insert(ledgerEntries).values({
    walletId: wallet.id,
    amountRials: delta,
    entryType,
    referenceId,
    idempotencyKey,
    description: description ?? null,
  });
  return row;
}

export { getOrCreateWalletInTx, getSystemWalletInTx };
