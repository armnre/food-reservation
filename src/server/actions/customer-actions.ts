'use server';

import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { createReservation, cancelReservation } from '@/server/services/reservation';
import { initiateTopUp, completePayment, failPayment, requestWithdrawal } from '@/server/services/payment';
import { tomanToRial, parseTomanInput } from '@/lib/money';
import { randomUUID } from 'node:crypto';

async function customerActor() {
  const ctx = await requireRole(ROLES.STUDENT, ROLES.STAFF);
  return {
    ctx,
    actor: { id: ctx.user.id, role: ctx.user.role, ip: null as string | null, userAgent: null as string | null },
  };
}

export async function reserveFoodAction(menuItemId: string) {
  try {
    const { ctx, actor } = await customerActor();
    const res = await createReservation({ userId: ctx.user.id, menuItemId, actor });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const, idempotent: res.idempotent };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function cancelReservationAction(reservationId: string) {
  try {
    const { ctx, actor } = await customerActor();
    const res = await cancelReservation({ userId: ctx.user.id, reservationId, actor });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function topUpAction(amountTomanText: string) {
  try {
    const { ctx, actor } = await customerActor();
    const parsed = parseTomanInput(amountTomanText);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };

    const res = await initiateTopUp({
      userId: ctx.user.id,
      amountRials: parsed.rials,
      description: 'شارژ کیف پول از درگاه',
      actor,
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const, redirectUrl: res.redirectUrl, paymentId: res.payment.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function confirmSandboxPaymentAction(paymentId: string) {
  try {
    const { ctx, actor } = await customerActor();
    // kondenz seguridad: پرداخت فقط برای صاحب آن
    const { getPayment } = await import('@/server/services/payment');
    const payment = await getPayment(paymentId, ctx.user.id);
    if (!payment) return { ok: false as const, error: 'پرداخت یافت نشد' };

    const res = await completePayment({
      paymentId,
      providerReference: `SBX-${randomUUID().slice(0, 12).toUpperCase()}`,
      actor,
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function failSandboxPaymentAction(paymentId: string) {
  try {
    const { ctx, actor } = await customerActor();
    const { getPayment } = await import('@/server/services/payment');
    const payment = await getPayment(paymentId, ctx.user.id);
    if (!payment) return { ok: false as const, error: 'پرداخت یافت نشد' };
    const res = await failPayment({ paymentId, actor });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function requestWithdrawalAction(amountTomanText: string) {
  try {
    const { ctx, actor } = await customerActor();
    const parsed = parseTomanInput(amountTomanText);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const res = await requestWithdrawal({
      userId: ctx.user.id,
      amountRials: parsed.rials,
      actor,
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
