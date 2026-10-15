import React from 'react';
import Link from 'next/link';
import { GraduationCap, Users, FileSpreadsheet, History, ArrowLeft, TriangleAlert } from 'lucide-react';
import { getViceStats } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard, Badge } from '@/components/ui/data';
import { DistributionPie, DistributionBar } from '@/components/charts/distribution';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function ViceDashboardPage() {
  const stats = await getViceStats();

  return (
    <div>
      <PageHeader
        title="داشبورد معاونت پژوهشی و دانشجویی"
        description="نمای کلی وضعیت دانشجویان، کارکنان و آخرین عملیات ورود داده"
        actions={
          <>
            <Link
              href="/vice/import"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--color-brand-950)] px-5 text-sm font-medium text-white shadow-[0_4px_14px_rgba(58,45,125,0.35)] transition-colors hover:bg-[var(--color-brand-900)]"
            >
              <FileSpreadsheet size={16} />
              ایمپورت اکسل
            </Link>
            <Link
              href="/vice/students"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--color-border)] px-5 text-sm font-medium transition-colors hover:bg-[var(--color-muted)]"
            >
              <GraduationCap size={16} />
              دانشجویان
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="دانشجویان فعال"
          value={toPersianDigits(stats.byStatus.find((s) => s.name === 'فعال')?.value ?? 0)}
          hint={`مجموع ${toPersianDigits(stats.totalStudents)} دانشجو`}
          icon={<GraduationCap size={20} />}
          tone="brand"
        />
        <StatCard
          title="کارکنان دانشگاه"
          value={toPersianDigits(stats.totalStaff)}
          hint="کارمند، هیئت‌علمی و پیمانکار"
          icon={<Users size={20} />}
          tone="accent"
        />
        <StatCard
          title="آخرین ایمپورت"
          value={stats.lastBatch ? toPersianDigits(stats.lastBatch.createdCount) : '—'}
          hint={stats.lastBatch ? stats.lastBatch.fileName : 'هنوز ایمپورتی انجام نشده'}
          icon={<FileSpreadsheet size={20} />}
          tone="success"
        />
        <StatCard
          title="ردیف‌های ردشده"
          value={stats.lastBatch ? toPersianDigits(stats.lastBatch.rejectedCount) : '—'}
          hint="در آخرین ایمپورت"
          icon={<History size={20} />}
          tone="warning"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold">توزیع دانشجویان بر اساس وضعیت</h2>
            <Badge variant="muted">زنده</Badge>
          </div>
          <p className="mb-3 text-xs text-[var(--color-foreground-muted)]">بر اساس آخرین وضعیت ثبت‌شده در پرونده</p>
          <DistributionPie data={stats.byStatus} />
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold">توزیع بر اساس دانشکده</h2>
            <Badge variant="muted">زنده</Badge>
          </div>
          <p className="mb-3 text-xs text-[var(--color-foreground-muted)]">تعداد دانشجویان هر دانشکده</p>
          <DistributionBar data={stats.byFaculty} color="#66469A" />
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)] lg:col-span-2">
          <h2 className="text-sm font-bold">آخرین ورودهای سامانه</h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">۸ فعالیت اخیر کاربران</p>
          <div className="mt-4 space-y-1">
            {stats.lastLogins.length === 0 ? (
              <p className="rounded-lg bg-[var(--color-muted)]/50 px-4 py-8 text-center text-xs text-[var(--color-foreground-muted)]">
                هنوز ورودی ثبت نشده است
              </p>
            ) : (
              stats.lastLogins.map((l, i) => (
                <div
                  key={l.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-muted)]/60"
                  style={{ opacity: 1 - i * 0.06 }}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-950)] text-xs font-bold text-white">
                    {l.displayName.trim().charAt(0) || 'ک'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{l.displayName}</p>
                    <p className="text-[11px] text-[var(--color-foreground-muted)]">{l.at}</p>
                  </div>
                  <Badge variant="muted">{l.role}</Badge>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-brand-50)] to-[var(--color-surface)] p-5 shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
              <TriangleAlert size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold">اقدام مورد نیاز</h2>
              <p className="mt-1.5 text-xs leading-loose text-[var(--color-foreground-muted)]">
                اطلاعات دانشجویان ورودی جدید را پیش از شروع ترم بارگذاری کنید تا امکان ورود برایشان فراهم شود.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {[
              { href: '/vice/import', label: 'بارگذاری فایل اکسل دانشجویان' },
              { href: '/vice/imports', label: 'مشاهده تاریخچه ایمپورت‌ها' },
              { href: '/vice/staff', label: 'مدیریت کارکنان دانشگاه' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-xs font-medium transition-colors hover:border-[var(--color-brand-300)] hover:bg-[var(--color-brand-50)]"
              >
                {l.label}
                <ArrowLeft size={14} className="text-[var(--color-brand-600)]" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {stats.byStatus.map((s) => (
          <span key={s.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px]">
            {s.name}: <strong>{toPersianDigits(s.value)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
