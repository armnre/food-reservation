import React from 'react';
import Link from 'next/link';
import {
  Users,
  ShieldCheck,
  Activity,
  Settings,
  Wallet,
  ClipboardList,
  ArrowLeft,
  TrendingUp,
  Database,
} from 'lucide-react';
import { getAdminStats } from '@/server/dal/data';
import { getSystemWalletBalances, getRecentLedgerEntries } from '@/server/services/payment';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard, Badge } from '@/components/ui/data';
import { DistributionBar } from '@/components/charts/distribution';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';
import { toJalaliDateTime } from '@/lib/jalali';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [stats, balances, ledger] = await Promise.all([
    getAdminStats(),
    getSystemWalletBalances(),
    getRecentLedgerEntries(15),
  ]);

  const roleChart = stats.byRole.map((r) => ({ name: r.label, value: r.value }));
  const treasury = balances.system.find((s) => s.ownerType === 'TREASURY');
  const clearing = balances.system.find((s) => s.ownerType === 'GATEWAY_CLEARING');

  return (
    <div className="space-y-5">
      <PageHeader
        title="پنل مدیر ارشد"
        description="نمای کلی سامانه — کاربران، کیف‌پول‌ها، رویدادها"
        actions={
          <Badge variant="accent">
            <ShieldCheck size={11} /> SUPER_ADMIN
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="کل کاربران"
          value={toPersianDigits(stats.totalUsers)}
          icon={<Users size={20} />}
          tone="brand"
        />
        <StatCard
          title="خزانه (درآمد فروش)"
          value={formatToman(treasury?.balanceRials ?? 0)}
          icon={<Wallet size={20} />}
          tone="success"
        />
        <StatCard
          title="تسویه درگاه"
          value={formatToman(clearing?.balanceRials ?? 0)}
          icon={<Database size={20} />}
          tone="accent"
        />
        <StatCard
          title="رویدادهای لاگ"
          value={toPersianDigits(stats.totalLogs)}
          icon={<Activity size={20} />}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold">توزیع کاربران بر اساس نقش</h2>
          <DistributionBar data={roleChart} color="#3A2D7D" />
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">آخرین رویدادهای دفتر کل</h2>
            <Link
              href="/admin/wallets"
              className="flex items-center gap-1 text-xs text-[var(--color-brand-700)] hover:underline"
            >
              نمای کیف پول‌ها <ArrowLeft size={12} />
            </Link>
          </div>
          <div className="mt-3 max-h-[300px] space-y-1.5 overflow-y-auto">
            {ledger.slice(0, 8).map((e) => {
              const isIn = e.amountRials > 0;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2"
                >
                  <div
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                      isIn ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                    }`}
                  >
                    <TrendingUp size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold">
                      {e.userName ?? (e.ownerType === 'TREASURY' ? 'خزانه' : 'سیستم')}
                    </p>
                    <p className="text-[10px] text-[var(--color-foreground-muted)]">{e.createdAt}</p>
                  </div>
                  <p
                    className={`text-xs font-bold tabular-nums ${isIn ? 'text-emerald-600' : 'text-rose-500'}`}
                  >
                    {isIn ? '+' : '−'}
                    {formatToman(Math.abs(e.amountRials))}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            href: '/admin/users',
            icon: Users,
            label: 'همه کاربران',
            desc: 'مدیریت و تغییر وضعیت',
            tone: 'from-[var(--color-brand-50)] to-[var(--color-brand-100)]/40 text-[var(--color-brand-800)]',
          },
          {
            href: '/admin/withdrawals',
            icon: Wallet,
            label: 'درخواست‌های برداشت',
            desc: 'تأیید/رد برداشت کاربران',
            tone: 'from-[var(--color-accent-50)] to-[var(--color-accent-100)]/40 text-[var(--color-accent-800)]',
          },
          {
            href: '/admin/audit-logs',
            icon: ShieldCheck,
            label: 'لاگ رویدادها',
            desc: 'مشاهدهٔ کامل audit log',
            tone: 'from-emerald-50 to-emerald-100/40 text-emerald-800',
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`group rounded-2xl border border-[var(--color-border)] bg-gradient-to-br ${card.tone} p-5 transition-all hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(58,45,125,0.10)]`}
          >
            <div className="flex items-center justify-between">
              <card.icon size={20} />
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
            </div>
            <p className="mt-3 text-sm font-bold">{card.label}</p>
            <p className="mt-1 text-[11px] leading-loose">{card.desc}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ClipboardList size={14} className="text-[var(--color-brand-700)]" />
          آخرین رویدادهای سیستم
        </h2>
        <div className="mt-3 space-y-1.5">
          {stats.recent.slice(0, 5).map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2"
            >
              <Badge variant="muted">{r.entityType}</Badge>
              <span className="flex-1 truncate text-[11px]">{r.action}</span>
              <span className="text-[10px] text-[var(--color-foreground-muted)]">{r.createdAt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
