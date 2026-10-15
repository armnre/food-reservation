'use client';

import React from 'react';
import { Landmark, CreditCard, Wallet, TrendingUp, TrendingDown, History } from 'lucide-react';
import { StatCard, Badge } from '@/components/ui/data';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';

interface SystemWallet {
  ownerType: string;
  ownerKey: string | null;
  balanceRials: number;
}

interface LedgerRow {
  id: string;
  amountRials: number;
  entryType: string;
  description: string | null;
  createdAt: string;
  ownerType: string;
  ownerKey: string | null;
  userName: string | null;
}

const OWNER_LABELS: Record<string, string> = {
  USER: 'کاربر',
  TREASURY: 'خزانه (درآمد فروش)',
  GATEWAY_CLEARING: 'تسویهٔ درگاه',
};

const ENTRY_LABELS: Record<string, string> = {
  DEPOSIT: 'واریز', PURCHASE: 'خرید', REFUND: 'بازگشت',
  WITHDRAWAL: 'برداشت', ADJUSTMENT: 'اصلاح', SALE: 'فروش',
};

export function WalletsOverviewClient({
  system, totalUserBalances, ledger,
}: {
  system: SystemWallet[];
  totalUserBalances: number;
  ledger: LedgerRow[];
}) {
  const treasury = system.find((s) => s.ownerType === 'TREASURY');
  const clearing = system.find((s) => s.ownerType === 'GATEWAY_CLEARING');

  const totalIn = ledger.filter((e) => e.amountRials > 0).reduce((a, e) => a + e.amountRials, 0);
  const totalOut = ledger.filter((e) => e.amountRials < 0).reduce((a, e) => a + Math.abs(e.amountRials), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="خزانه (درآمد فروش)"
          value={formatToman(treasury?.balanceRials ?? 0)}
          hint="درآمد تجمعی از رزروها"
          icon={<Landmark size={20} />}
          tone="brand"
        />
        <StatCard
          title="تسویهٔ درگاه"
          value={formatToman(clearing?.balanceRials ?? 0)}
          hint="مبالغ تسویه‌شده از درگاه"
          icon={<CreditCard size={20} />}
          tone="accent"
        />
        <StatCard
          title="مجموع کیف پول کاربران"
          value={formatToman(totalUserBalances)}
          hint="موجودی قابل استفادهٔ کاربران"
          icon={<Wallet size={20} />}
          tone="success"
        />
        <StatCard
          title="گردش ۵۰ تراکنش اخیر"
          value={`${formatToman(totalIn)} / ${formatToman(totalOut)}`}
          hint="ورودی / خروجی"
          icon={<History size={20} />}
          tone="warning"
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <History size={15} className="text-[var(--color-brand-700)]" />
            دفتر کل — ۵۰ تراکنش اخیر
          </h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">
            ورودی و خروجی هر تراکنش در دفتر کل ثبت می‌شود.
          </p>
        </div>
        {ledger.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-[var(--color-foreground-muted)]">تراکنشی ثبت نشده است</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[var(--color-muted)]/40">
                <tr className="text-[11px] text-[var(--color-foreground-muted)]">
                  <th className="px-5 py-3 font-semibold">زمان</th>
                  <th className="px-5 py-3 font-semibold">نوع</th>
                  <th className="px-5 py-3 font-semibold">کیف</th>
                  <th className="px-5 py-3 font-semibold">کاربر</th>
                  <th className="px-5 py-3 font-semibold">مبلغ</th>
                  <th className="px-5 py-3 font-semibold">توضیح</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => {
                  const isIn = e.amountRials > 0;
                  return (
                    <tr key={e.id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                      <td className="px-5 py-2.5 text-[var(--color-foreground-muted)]">{e.createdAt}</td>
                      <td className="px-5 py-2.5">
                        <Badge variant="muted">{ENTRY_LABELS[e.entryType] ?? e.entryType}</Badge>
                      </td>
                      <td className="px-5 py-2.5">
                        <Badge variant={e.ownerType === 'USER' ? 'info' : 'accent'}>
                          {OWNER_LABELS[e.ownerType] ?? e.ownerType}
                        </Badge>
                      </td>
                      <td className="px-5 py-2.5 font-medium">{e.userName ?? '—'}</td>
                      <td className={`px-5 py-2.5 font-bold tabular-nums ${isIn ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {isIn ? '+' : '−'}{formatToman(Math.abs(e.amountRials))}
                      </td>
                      <td className="max-w-[200px] truncate px-5 py-2.5 text-[var(--color-foreground-muted)]">
                        {e.description ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export { TrendingUp, TrendingDown };
