'use client';

import React from 'react';
import {
  CalendarCheck, CheckCircle2, UtensilsCrossed, DollarSign, XCircle,
  TrendingUp, Award,
} from 'lucide-react';
import { StatCard } from '@/components/ui/data';
import { DistributionBar, DistributionPie } from '@/components/charts/distribution';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';

interface ReportData {
  summary: { total: number; confirmed: number; used: number; cancelled: number; revenueRials: number };
  byDay: { date: string; count: number; revenue: number }[];
  byStatus: { status: string; value: number }[];
  topFoods: { name: string; count: number; revenue: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'تأییدشده',
  USED: 'تحویل‌شده',
  CANCELLED: 'لغو شده',
  NO_SHOW: 'عدم حضور',
  PENDING: 'در انتظار',
};

export function ReportsClient({ data }: { data: ReportData }) {
  const { summary, byDay, byStatus, topFoods } = data;

  const dayChart = byDay.map((d) => ({ name: d.date, value: d.count }));
  const revenueChart = byDay.map((d) => ({ name: d.date, value: Math.floor(d.revenue / 10) })); // تومان
  const statusChart = byStatus.map((s) => ({ name: STATUS_LABELS[s.status] ?? s.status, value: s.value }));
  const foodChart = topFoods.map((f) => ({ name: f.name, value: f.count }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="کل رزروها" value={toPersianDigits(summary.total)} icon={<CalendarCheck size={20} />} tone="brand" />
        <StatCard title="تحویل‌شده" value={toPersianDigits(summary.used)} icon={<CheckCircle2 size={20} />} tone="success" />
        <StatCard title="لغو شده" value={toPersianDigits(summary.cancelled)} icon={<XCircle size={20} />} tone="warning" />
        <StatCard title="درآمد کل" value={formatToman(summary.revenueRials)} hint="از رزروهای تحویل‌شده و فعال" icon={<DollarSign size={20} />} tone="accent" />
        <StatCard title="نرخ تحویل" value={summary.confirmed > 0 ? `%${toPersianDigits(Math.round((summary.used / summary.confirmed) * 100))}` : '—'} hint="تحویل‌شده / کل" icon={<TrendingUp size={20} />} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold">تعداد رزرو روزانه</h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">۴ هفتهٔ گذشته</p>
          {dayChart.length === 0 ? (
            <EmptyMini />
          ) : (
            <DistributionBar data={dayChart} color="#3A2D7D" />
          )}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold">درآمد روزانه (تومان)</h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">۴ هفتهٔ گذشته</p>
          {revenueChart.length === 0 ? (
            <EmptyMini />
          ) : (
            <DistributionBar data={revenueChart} color="#F08020" />
          )}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold">توزیع وضعیت رزروها</h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">کل رزروها</p>
          {statusChart.length === 0 ? (
            <EmptyMini />
          ) : (
            <DistributionPie data={statusChart} />
          )}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Award size={15} className="text-[var(--color-accent-600)]" />
            پرطرفدارترین غذاها
          </h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">۸ غذای برتر بر اساس تعداد رزرو</p>
          {foodChart.length === 0 ? (
            <EmptyMini />
          ) : (
            <DistributionBar data={foodChart} color="#66469A" />
          )}
        </section>
      </div>

      {/* جدول غذاها */}
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <UtensilsCrossed size={15} className="text-[var(--color-brand-700)]" />
            جزئیات رزرو غذاها
          </h2>
        </div>
        {topFoods.length === 0 ? (
          <div className="p-6">
            <EmptyMini />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[var(--color-muted)]/40">
                <tr className="text-[11px] text-[var(--color-foreground-muted)]">
                  <th className="px-5 py-3 font-semibold">رده</th>
                  <th className="px-5 py-3 font-semibold">نام غذا</th>
                  <th className="px-5 py-3 font-semibold">تعداد رزرو</th>
                  <th className="px-5 py-3 font-semibold">درآمد</th>
                </tr>
              </thead>
              <tbody>
                {topFoods.map((f, i) => (
                  <tr key={f.name} className="border-b border-[var(--color-border-subtle)] last:border-0">
                    <td className="px-5 py-3">
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                        i === 0 ? 'bg-amber-100 text-amber-700'
                          : i === 1 ? 'bg-slate-100 text-slate-600'
                          : i === 2 ? 'bg-orange-100 text-orange-700'
                          : 'bg-[var(--color-muted)] text-[var(--color-foreground-muted)]'
                      }`}>
                        {toPersianDigits(i + 1)}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold">{f.name}</td>
                    <td className="px-5 py-3 tabular-nums">{toPersianDigits(f.count)}</td>
                    <td className="px-5 py-3 tabular-nums">{formatToman(f.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyMini() {
  return (
    <div className="flex h-64 items-center justify-center text-xs text-[var(--color-foreground-muted)]">
      داده‌ای برای نمایش وجود ندارد
    </div>
  );
}
