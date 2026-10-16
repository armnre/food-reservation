import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { getPayment } from '@/server/services/payment';
import { getWalletBalance } from '@/server/services/wallet';
import { formatToman } from '@/lib/money';
import { SandboxPayClient } from '@/components/customer/sandbox-pay-client';

export const dynamic = 'force-dynamic';

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const paymentId = typeof sp.paymentId === 'string' ? sp.paymentId : '';

  const ctx = await requireRole(ROLES.STUDENT, ROLES.STAFF);
  const payment = paymentId ? await getPayment(paymentId, ctx.user.id) : null;

  if (!payment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-5">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-lg">
          <h1 className="text-lg font-bold">پرداخت یافت نشد</h1>
          <p className="mt-2 text-sm text-[var(--color-foreground-muted)]">
            این لینک پرداخت معتبر نیست یا منقضی شده است.
          </p>
          <Link
            href="/student/wallet"
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-[var(--color-brand-950)] px-6 text-sm font-medium text-white"
          >
            بازگشت به کیف پول
          </Link>
        </div>
      </main>
    );
  }

  const balance = await getWalletBalance(ctx.user.id);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-brand-950)] px-5 py-10">
      <div className="absolute inset-0">
        <Image src="/brand/login-panel.jpg" alt="" fill className="object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-l from-[var(--color-brand-950)] via-[var(--color-brand-950)]/90 to-[var(--color-brand-950)]/55" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--color-surface)]/97 shadow-[0_40px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="border-b border-[var(--color-border-subtle)] px-7 py-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-brand-50)] text-[var(--color-brand-800)]">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <h1 className="text-lg font-bold">درگاه پرداخت</h1>
            <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">درگاه Sandbox — محیط آزمایشی</p>
          </div>

          <div className="px-7 py-6">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 text-center">
              <p className="text-xs text-[var(--color-foreground-muted)]">مبلغ قابل پرداخت</p>
              <p className="mt-1.5 text-3xl font-bold tracking-tight">{formatToman(payment.amountRials)}</p>
              <p className="mt-1.5 text-[11px] text-[var(--color-foreground-muted)]">
                {payment.description ?? 'شارژ کیف پول'}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
              <p className="text-[11px] leading-loose text-amber-800">
                این صفحه، درگاه پرداخت <strong>Sandbox</strong> است. در استقرار واقعی، کاربر به درگاه بانکی
                (زرین‌پال / به‌پرداخت) هدایت می‌شود و پس از پرداخت، درگاه نتیجه را به سامانه callback می‌دهد.
              </p>
            </div>

            {payment.status === 'PENDING' ? (
              <SandboxPayClient
                paymentId={payment.id}
                amountRials={payment.amountRials}
                currentBalance={balance}
              />
            ) : (
              <div className="mt-5 rounded-xl border border-[var(--color-border)] p-4 text-center">
                <p className="text-sm font-semibold">
                  وضعیت پرداخت:{' '}
                  {payment.status === 'COMPLETED'
                    ? 'موفق'
                    : payment.status === 'FAILED'
                      ? 'ناموفق'
                      : payment.status}
                </p>
                <p className="mt-1.5 text-xs text-[var(--color-foreground-muted)]">
                  موجودی فعلی: {formatToman(balance)}
                </p>
                <Link
                  href="/student/wallet"
                  className="mt-4 inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-950)] px-5 text-xs font-medium text-white"
                >
                  بازگشت به کیف پول
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
