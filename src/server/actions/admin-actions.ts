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

export async function approveWithdrawalAction(requestId: string) {
  try {
    const { actor } = await adminActor();
    const res = await approveWithdrawal({ requestId, actor });
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


