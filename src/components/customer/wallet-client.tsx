'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/data';
import { Dialog, useToast, EmptyState } from '@/components/ui/feedback';
import { topUpAction, requestWithdrawalAction } from '@/server/actions/customer-actions';
import { formatToman } from '@/lib/money';
import { toPersianDigits, toLatinDigits } from '@/lib/validation';

export interface LedgerEntryDto {
  id: string;
  amountRials: number;
  entryType: string;
  description: string | null;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  amountRials: number;
  status: string;
  gateway: string;
  description: string | null;
  createdAt: string;
}

const ENTRY_META: Record<string, { label: string; icon: React.ReactNode; tone: 'in' | 'out' | 'neutral' }> = {
  DEPOSIT: { label: 'واریز', icon: <ArrowDownToLine size={13} />, tone: 'in' },
  PURCHASE: { label: 'خرید', icon: <ArrowUpFromLine size={13} />, tone: 'out' },
  REFUND: { label: 'بازگشت', icon: <ArrowDownToLine size={13} />, tone: 'in' },
  WITHDRAWAL: { label: 'برداشت', icon: <ArrowUpFromLine size={13} />, tone: 'out' },
  ADJUSTMENT: { label: 'اصلاح', icon: <AlertCircle size={13} />, tone: 'neutral' },
  SALE: { label: 'فروش', icon: <TrendingUp size={13} />, tone: 'in' },
};

const PAYMENT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'muted' }> =
  {
    PENDING: { label: 'در انتظار', variant: 'warning' },
    COMPLETED: { label: 'موفق', variant: 'success' },
    FAILED: { label: 'ناموفق', variant: 'danger' },
    REFUNDED: { label: 'بازگشت‌داده‌شده', variant: 'muted' },
  };

export function WalletClient({
  balanceRials,
  ledger,
  payments,
  menuHref,
}: {
  balanceRials: number;
  ledger: LedgerEntryDto[];
  payments: PaymentDto[];
  menuHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [withdrawIban, setWithdrawIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [busy, setBusy] = useState(false);

  async function doTopUp() {
    setBusy(true);
    const res = await topUpAction(amount);
    setBusy(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'خطا', description: res.error });
      return;
    }
    setTopUpOpen(false);
    setAmount('');
    router.push(res.redirectUrl);
  }

  async function doWithdraw() {
    setBusy(true);
    const res = await requestWithdrawalAction(amount, withdrawIban, accountHolder);
    setBusy(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'خطا', description: res.error });
      return;
    }
    setWithdrawOpen(false);
    setAmount('');
    setWithdrawIban('');
    setAccountHolder('');
    toast.push({
      kind: 'success',
      title: 'درخواست ثبت شد',
      description: 'پس از بررسی توسط مدیر، مبلغ به حساب شما واریز می‌شود',
    });
    router.refresh();
  }

  const totalIn = ledger.filter((e) => e.amountRials > 0).reduce((a, e) => a + e.amountRials, 0);
  const totalOut = ledger.filter((e) => e.amountRials < 0).reduce((a, e) => a + Math.abs(e.amountRials), 0);

  return (
    <div className="space-y-6">
      {/* کارت موجودی */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[var(--color-brand-950)] via-[#2c2352] to-[var(--color-brand-800)] p-6 text-white shadow-[0_20px_50px_rgba(58,45,125,0.35)]">
        <div
          className="absolute left-0 top-0 h-full w-1/2 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)',
            backgroundSize: '18px 18px',
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-white/60">موجودی کیف پول</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">{formatToman(balanceRials)}</p>
            <p className="mt-2 text-[11px] text-white/50">
              مجموع واریز: {formatToman(totalIn)} — مجموع برداشت: {formatToman(totalOut)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              icon={<Plus size={16} />}
              onClick={() => {
                setAmount('');
                setTopUpOpen(true);
              }}
            >
              شارژ کیف پول
            </Button>
            <button
              onClick={() => {
                setAmount('');
                setWithdrawOpen(true);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <ArrowUpFromLine size={16} /> درخواست برداشت
            </button>
            <button
              onClick={() => router.push(menuHref)}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <Wallet size={16} /> رزرو غذا
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* تاریخچهledger */}
        <section className="lg:col-span-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <History size={15} className="text-[var(--color-brand-700)]" />
            تاریخچهٔ تراکنش‌ها
          </h2>

          {ledger.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                image={false}
                title="تراکنشی ثبت نشده است"
                description="پس از شارژ کیف پول یا رزرو غذا، تراکنش‌های شما اینجا نمایش داده می‌شوند."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-1.5">
              {ledger.map((e) => {
                const meta = ENTRY_META[e.entryType] ?? ENTRY_META.ADJUSTMENT;
                const isIn = e.amountRials > 0;
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] px-3.5 py-2.5"
                  >
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        isIn ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                      }`}
                    >
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{meta.label}</p>
                      <p className="truncate text-[10px] text-[var(--color-foreground-muted)]">
                        {e.description ?? '—'} — {e.createdAt}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 text-xs font-bold tabular-nums ${isIn ? 'text-emerald-600' : 'text-rose-500'}`}
                    >
                      {isIn ? '+' : '−'}
                      {formatToman(Math.abs(e.amountRials))}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* پرداخت‌ها */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold">پرداخت‌های اخیر</h2>
          {payments.length === 0 ? (
            <p className="mt-4 rounded-lg bg-[var(--color-muted)]/50 px-4 py-8 text-center text-xs text-[var(--color-foreground-muted)]">
              پرداختی ثبت نشده است
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {payments.map((p) => {
                const meta = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.PENDING;
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-[var(--color-border-subtle)] px-3.5 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold tabular-nums">{formatToman(p.amountRials)}</p>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--color-foreground-muted)]">{p.createdAt}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* دیالوگ شارژ */}
      <Dialog
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        title="شارژ کیف پول"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTopUpOpen(false)}>
              انصراف
            </Button>
            <Button loading={busy} onClick={doTopUp} icon={<Plus size={15} />}>
              ادامه به پرداخت
            </Button>
          </>
        }
      >
        <Field label="مبلغ (تومان)" required hint="حداقل ۱٬۰۰۰ تومان">
          <TextInput
            dir="ltr"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(toLatinDigits(e.target.value))}
            placeholder="مثلاً 50000"
            className="text-right"
            autoFocus
          />
        </Field>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {['10000', '50000', '100000', '200000'].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] transition-colors hover:bg-[var(--color-brand-50)] hover:border-[var(--color-brand-300)]"
            >
              {formatToman(Number(v) * 10)}
            </button>
          ))}
        </div>
      </Dialog>

      {/* دیالوگ برداشت */}
      <Dialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="درخواست برداشت"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>
              انصراف
            </Button>
            <Button loading={busy} onClick={doWithdraw} icon={<ArrowUpFromLine size={15} />}>
              ثبت درخواست
            </Button>
          </>
        }
      >
        <Field label="مبلغ (تومان)" required hint={`حداکثر ${formatToman(balanceRials)} قابل برداشت است`}>
          <TextInput
            dir="ltr"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(toLatinDigits(e.target.value))}
            placeholder="مثلاً 50000"
            className="text-right"
            autoFocus
          />
        </Field>
        <Field label="شماره شبا (الزامی)" required>
          <TextInput
            dir="ltr"
            value={withdrawIban}
            onChange={(e) => setWithdrawIban(e.target.value)}
            placeholder="IR..."
          />
        </Field>
        <Field label="نام صاحب حساب (الزامی)" required>
          <TextInput
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            placeholder="نام و نام خانوادگی"
          />
        </Field>
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[11px] leading-loose text-amber-800">
            مبلغ درخواستی تا زمان بررسی توسط مدیر سیستم مسدود می‌شود. در صورت تأیید، مبلغ به حساب بانکی شما
            واریز خواهد شد.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

export { TrendingDown, CheckCircle2, XCircle, Clock };
