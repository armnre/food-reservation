'use server';

import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { scanReservation, markReservationUsed } from '@/server/services/reservation';

async function operatorActor() {
  const ctx = await requireRole(ROLES.CAFETERIA_OPERATOR);
  return {
    ctx,
    actor: { id: ctx.user.id, role: ctx.user.role, ip: null as string | null, userAgent: null as string | null },
  };
}

export async function scanQrAction(qrToken: string) {
  try {
    const { ctx } = await operatorActor();
    const res = await scanReservation(qrToken);
    if (!res.ok) return { ok: false as const, error: res.error };

    return {
      ok: true as const,
      reservation: {
        id: res.reservation.id,
        status: res.reservation.status,
        priceRials: res.reservation.priceSnapshotRials,
        reservedAt: res.reservation.reservedAt.toISOString(),
        usedAt: res.reservation.usedAt?.toISOString() ?? null,
      },
      user: res.user ? { displayName: res.user.displayName, username: res.user.username } : null,
      food: res.food ? { name: res.food.name } : null,
      slot: res.slot ? { name: res.slot.name } : null,
      isToday: res.isToday,
      canMarkUsed: res.canMarkUsed,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function markUsedAction(qrToken: string) {
  try {
    const { ctx, actor } = await operatorActor();
    const res = await markReservationUsed({ qrToken, operatorId: ctx.user.id, actor });
    if (!res.ok) return { ok: false as const, error: res.error };
    return {
      ok: true as const,
      user: res.user ? { displayName: res.user.displayName, username: res.user.username } : null,
      food: res.food ? { name: res.food.name } : null,
      slot: res.slot ? { name: res.slot.name } : null,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
