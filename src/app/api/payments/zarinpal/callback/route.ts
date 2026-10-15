import { NextResponse, type NextRequest } from 'next/server';
import { completePayment } from '@/server/services/payment';
import { zarinpalGateway } from '@/server/services/payment';

export const dynamic = 'force-dynamic';

/**
 * Callback زرین‌پال (فاز ۳-۲) — تأیید سمت سرور:
 * مبلغ از دیتابیس خوانده و با پاسخ verify درگاه تطبیق داده می‌شود؛
 * callback تکراری/جعلی idempotent رد می‌شود.
 */
export async function GET(request: NextRequest) {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => { params[k] = v; });
  const paymentId = params.paymentId;

  const verified = await zarinpalGateway.verifyCallback?.(params);
  if (!verified || !verified.ok || verified.paymentId !== paymentId) {
    return NextResponse.redirect(new URL(`/wallet/pay?paymentId=${paymentId ?? ''}&result=fail`, request.url));
  }

  const res = await completePayment({
    paymentId: verified.paymentId,
    providerReference: verified.reference,
    actor: { id: null, role: null, ip: null, userAgent: 'zarinpal-callback' },
  });

  const result = res.ok ? 'success' : 'fail';
  return NextResponse.redirect(new URL(`/wallet/pay?paymentId=${verified.paymentId}&result=${result}`, request.url));
}
