'use server';

import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import {
  approveWithdrawal, rejectWithdrawal,
  listWithdrawalRequests, getSystemWalletBalances, getRecentLedgerEntries,
} from '@/server/services/payment';

async function adminActor() {
  const ctx = await requireRole(ROLES.SUPER_ADMIN);
  return {
    ctx,
    actor: { id: ctx.user.id, role: ctx.user.role, ip: null as string | null, userAgent: null as string | null },
  };
}

export async function approveWithdrawalAction(requestId: string, bankReference: string) {
  try {
    const ctx = await requireRole(ROLES.SUPER_ADMIN, ROLES.NUTRITION_MANAGER);
    const actor = { id: ctx.user.id, role: ctx.user.role, ip: null as string | null, userAgent: null as string | null };
    const res = await approveWithdrawal({ requestId, bankReference, actor });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function rejectWithdrawalAction(requestId: string) {
  try {
    const { actor } = await adminActor();
    const res = await rejectWithdrawal({ requestId, actor });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}



export async function manualChargeAction(userId: string, amountTomanText: string, reason: string) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
    const { parseTomanInput } = await import('@/lib/money');
    const parsed = parseTomanInput(amountTomanText);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const { manualCharge } = await import('@/server/services/wallet-ops');
    const actor = { id: ctx.user.id, role: ctx.user.role, ip: null as string | null, userAgent: null as string | null };
    const res = await manualCharge({ actor, userId, amountRials: parsed.rials, reason });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
