'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/feedback';
import { confirmSandboxPaymentAction, failSandboxPaymentAction } from '@/server/actions/customer-actions';
import { formatToman } from '@/lib/money';

export function SandboxPayClient({
  paymentId, amountRials, currentBalance,
}: {
  paymentId: string;
  amountRials: number;
  currentBalance: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'pay' | 'fail' | null>(null);

  async function doPay() {
    setBusy('pay');
    const res = await confirmSandboxPaymentAction(paymentId);
    setBusy(null);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'پرداخت ناموفق بود', description: res.error });
      return;
    }
    toast.push({
      kind: 'success',
      title: 'پرداخت با موفقیت انجام شد',
      description: `${formatToman(amountRials)} به کیف پول شما اضافه شد`,
    });
    router.push('/student/wallet');
    router.refresh();
  }

  async function doFail() {
    setBusy('fail');
    await failSandboxPaymentAction(paymentId);
    setBusy(null);
    toast.push({ kind: 'warning', title: 'پرداخت لغو شد' });
    router.push('/student/wallet');
    router.refresh();
  }

  return (
    <div className="mt-5 space-y-3">
      <Button block size="lg" onClick={doPay} loading={busy === 'pay'} icon={<ShieldCheck size={17} />}>
        پرداخت {formatToman(amountRials)}
      </Button>
      <div className="flex items-center justify-between">
        <button
          onClick={doFail}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 text-xs text-rose-600 transition-colors hover:underline disabled:opacity-50"
        >
          {busy === 'fail' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
          پرداخت ناموفق (شبیه‌سازی)
        </button>
        <span className="text-[10px] text-[var(--color-foreground-muted)]">
          موجودی فعلی: {formatToman(currentBalance)}
        </span>
      </div>
    </div>
  );
}
