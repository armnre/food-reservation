'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet, Plus, ArrowUpFromLine, History, ArrowDownToLine,
  TrendingUp, TrendingDown, AlertCircle, Sparkles, Zap,
  ChevronLeft, Receipt,
} from 'lucide-react';
import { Badge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/data';
import { Dialog, useToast, EmptyState } from '@/components/ui/feedback';
import { topUpAction, requestWithdrawalAction } from '@/server/actions/customer-actions';
import { formatToman } from '@/lib/money';
import { toPersianDigits, toLatinDigits } from '@/lib/validation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

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

const ENTRY_META: Record<string, { label: string; tone: 'in' | 'out' | 'neutral'; emoji: string }> = {
  DEPOSIT: { label: 'شارژ', tone: 'in', emoji: '⬇️' },
  PURCHASE: { label: 'خرید غذا', tone: 'out', emoji: '🍽' },
  REFUND: { label: 'بازگشت وجه', tone: 'in', emoji: '↩️' },
  WITHDRAWAL: { label: 'برداشت', tone: 'out', emoji: '⬆️' },
  ADJUSTMENT: { label: 'اصلاح', tone: 'neutral', emoji: '⚙️' },
  SALE: { label: 'فروش', tone: 'in', emoji: '💰' },
};

const PAYMENT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'muted' }> = {
  PENDING: { label: 'در انتظار', variant: 'warning' },
  COMPLETED: { label: 'موفق', variant: 'success' },
  FAILED: { label: 'ناموفق', variant: 'danger' },
  REFUNDED: { label: 'برگشت‌شده', variant: 'muted' },
};

export function WalletStudent({
  balanceRials, ledger, payments, menuHref,
}: {
  balanceRials: number;
  ledger: LedgerEntryDto[];
  payments: PaymentDto[];
  menuHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
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
      description: 'پس از تأیید مدیر، مبلغ به حساب شما واریز می‌شود',
    });
    router.refresh();
  }

  const totalIn = ledger.filter((e) => e.amountRials > 0).reduce((a, e) => a + e.amountRials, 0);
  const totalOut = ledger.filter((e) => e.amountRials < 0).reduce((a, e) => a + Math.abs(e.amountRials), 0);
  const totalSpent = ledger.filter((e) => e.entryType === 'PURCHASE').reduce((a, e) => a + Math.abs(e.amountRials), 0);

  return (
    <div className="space-y-5">
      {/* هیرو بزرگ */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[var(--color-brand-950)] via-[#2c2352] to-[var(--color-brand-800)] p-6 text-white shadow-[0_24px_60px_rgba(58,45,125,0.4)]"
      >
        <div className="absolute left-0 top-0 h-full w-2/3 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)',
          backgroundSize: '16px 16px',
        }} />
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[var(--color-accent-500)] opacity-15 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Wallet size={13} /> موجودی کیف پول
            <Sparkles size={11} className="text-[var(--color-accent-300)]" />
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={balanceRials}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="mt-2 text-4xl font-bold tracking-tight tabular-nums"
            >
              {formatToman(balanceRials)}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1.5 text-[11px] text-white/55">
            کل شارژ: {formatToman(totalIn)} — کل خرج: {formatToman(totalOut)}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            <button
              onClick={() => { setAmount(''); setTopUpOpen(true); }}
              className="group flex flex-col items-center gap-1 rounded-xl bg-[var(--color-accent-500)] py-3 text-white shadow-[0_8px_20px_rgba(240,128,32,0.35)] transition-all hover:scale-[1.02] active:scale-95"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span className="text-[11px] font-bold">شارژ</span>
            </button>
            <button
              onClick={() => { setAmount(''); setWithdrawOpen(true); }}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/20 bg-white/10 py-3 text-white backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
            >
              <ArrowUpFromLine size={18} />
              <span className="text-[11px] font-bold">برداشت</span>
            </button>
            <button
              onClick={() => router.push(menuHref)}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/20 bg-white/10 py-3 text-white backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
            >
              <Zap size={18} />
              <span className="text-[11px] font-bold">رزرو غذا</span>
            </button>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* کارت‌های آمار */}
        <section className="lg:col-span-1 space-y-3">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <h3 className="text-xs font-bold text-[var(--color-foreground-muted)]">خلاصهٔ ۳۰ روز اخیر</h3>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3">
                <span className="flex items-center gap-2 text-xs text-emerald-700">
                  <ArrowDownToLine size={13} /> واریز
                </span>
                <span className="text-xs font-bold tabular-nums text-emerald-700">{formatToman(totalIn)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-rose-50 p-3">
                <span className="flex items-center gap-2 text-xs text-rose-700">
                  <ArrowUpFromLine size={13} /> برداشت
                </span>
                <span className="text-xs font-bold tabular-nums text-rose-700">{formatToman(totalOut)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[var(--color-brand-50)] p-3">
                <span className="flex items-center gap-2 text-xs text-[var(--color-brand-700)]">
                  <Receipt size={13} /> خرج غذا
                </span>
                <span className="text-xs font-bold tabular-nums text-[var(--color-brand-800)]">{formatToman(totalSpent)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* تاریخچهledger */}
        <section className="lg:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <History size={15} className="text-[var(--color-brand-700)]" />
              تاریخچهٔ تراکنش‌ها
            </h3>
            <span className="text-[10px] text-[var(--color-foreground-muted)]">{toPersianDigits(ledger.length)} ردیف</span>
          </div>

          {ledger.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                image={false}
                title="تراکنشی ثبت نشده"
                description="پس از شارژ یا رزرو، تراکنش‌ها اینجا نمایش داده می‌شوند."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-1.5">
              {ledger.slice(0, 30).map((e, i) => {
                const meta = ENTRY_META[e.entryType] ?? ENTRY_META.ADJUSTMENT;
                const isIn = e.amountRials > 0;
                return (
                  <motion.div
                    key={e.id}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.025, 0.4), duration: 0.2 }}
                    className="flex items-center gap-3 rounded-xl border border-[var(--color-border-subtle)] px-3.5 py-2.5"
                  >
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base ${
                      isIn
                        ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600'
                        : 'bg-gradient-to-br from-rose-50 to-rose-100 text-rose-500'
                    }`}>
                      {meta.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{meta.label}</p>
                      <p className="truncate text-[10px] text-[var(--color-foreground-muted)]">
                        {e.description ?? '—'} — {e.createdAt}
                      </p>
                    </div>
                    <p className={`shrink-0 text-xs font-bold tabular-nums ${isIn ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {isIn ? '+' : '−'}{formatToman(Math.abs(e.amountRials))}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* پرداخت‌ها */}
      {payments.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h3 className="text-sm font-bold">پرداخت‌های اخیر</h3>
          <div className="mt-3 space-y-2">
            {payments.map((p) => {
              const sm = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.PENDING;
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border-subtle)] px-3.5 py-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-muted)] text-[var(--color-foreground-muted)]">
                    <Receipt size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold tabular-nums">{formatToman(p.amountRials)}</p>
                    <p className="text-[10px] text-[var(--color-foreground-muted)]">{p.createdAt}</p>
                  </div>
                  <Badge variant={sm.variant}>{sm.label}</Badge>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* حوار شارژ */}
      <Dialog
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        title="شارژ کیف پول"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTopUpOpen(false)}>انصراف</Button>
            <Button variant="accent" loading={busy} onClick={doTopUp} icon={<Plus size={15} />}>ادامه به پرداخت</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="مبلغ (تومان)" required>
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
          <div className="flex flex-wrap gap-1.5">
            {['10000', '50000', '100000', '200000'].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-[var(--color-brand-300)] hover:bg-[var(--color-brand-50)]"
              >
                {formatToman(Number(v) * 10)}
              </button>
            ))}
          </div>
        </div>
      </Dialog>

      {/* حوار برداشت */}
      <Dialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="درخواست برداشت"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>انصراف</Button>
            <Button loading={busy} onClick={doWithdraw} icon={<ArrowUpFromLine size={15} />}>ثبت درخواست</Button>
          </>
        }
      >
        <Field label="مبلغ (تومان)" required hint={`حداکثر ${formatToman(balanceRials)} قابل برداشت`}>
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
            مبلغ تا بررسی توسط مدیر سیستم مسدود می‌شود؛ در صورت تأیید، به حساب بانکی شما واریز خواهد شد.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

export { TrendingUp, TrendingDown };