import React from 'react';
import Link from 'next/link';
import {
  Users, UtensilsCrossed, CalendarRange, TriangleAlert, ArrowLeft, Plus,
  CheckCircle2, FileEdit, ChefHat,
} from 'lucide-react';
import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { getNutritionDashboard } from '@/server/dal/menu';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard, Badge } from '@/components/ui/data';
import { EmptyState } from '@/components/ui/feedback';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function NutritionDashboardPage() {
  await requireRole(ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
  const stats = await getNutritionDashboard();

  return (
    <div>
      <PageHeader
        title="پنل مدیر تغذیه"
        description="مدیریت برنامه غذایی، کتابخانه غذا و کارکنان سلف"
        actions={
          <>
            <Link
              href="/nutrition/menu"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--color-brand-950)] px-5 text-sm font-medium text-white shadow-[0_4px_14px_rgba(58,45,125,0.35)] transition-colors hover:bg-[var(--color-brand-900)]"
            >
              <CalendarRange size={16} /> برنامه‌ریز منو
            </Link>
            <Link
              href="/nutrition/foods"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--color-border)] px-5 text-sm font-medium transition-colors hover:bg-[var(--color-muted)]"
            >
              <UtensilsCrossed size={16} /> کتابخانه غذا
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="منوهای منتشرشده این هفته"
          value={toPersianDigits(stats.publishedThisWeek)}
          hint="هفته جاری"
          icon={<CheckCircle2 size={20} />}
          tone="success"
        />
        <StatCard
          title="پیش‌نویس‌های این هفته"
          value={toPersianDigits(stats.draftsThisWeek)}
          hint="در انتظار تکمیل و انتشار"
          icon={<FileEdit size={20} />}
          tone="warning"
        />
        <StatCard
          title="غذاهای فعال"
          value={toPersianDigits(stats.activeFoods)}
          hint="کتابخانه غذا"
          icon={<ChefHat size={20} />}
          tone="brand"
        />
        <StatCard
          title="کارکنان سلف"
          value="مدیریت"
          hint="تعریف و ویرایش اپراتورها"
          icon={<Users size={20} />}
          tone="accent"
        />
      </div>

      {!stats.nextWeekReady && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <TriangleAlert size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-amber-900">منوی هفته آینده هنوز آماده نیست</h2>
            <p className="mt-1.5 text-xs leading-loose text-amber-800">
              برای جلوگیری از تأخیر در رزرو دانشجویان، بهتر است برنامه غذایی هفته آینده تا پایان این هفته
              تکمیل و منتشر شود. می‌توانید با یک کلیک، برنامه هفته قبل را کپی کنید.
            </p>
            <Link
              href="/nutrition/menu?w=1"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-amber-600 px-4 text-xs font-medium text-white shadow-[0_4px_14px_rgba(217,119,6,0.3)] transition-colors hover:bg-amber-700"
            >
              <Plus size={14} /> ساخت منوی هفته آینده
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-bold">میان‌برها</h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">پرکاربردترین عملیات این پنل</p>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[
              { href: '/nutrition/menu', label: 'برنامه‌ریز منوی هفتگی', desc: 'چیدمان، قیمت‌گذاری و انتشار' },
              { href: '/nutrition/foods', label: 'کتابخانه غذا', desc: 'افزودن غذا، تصویر، برچسب و کالری' },
              { href: '/nutrition/slots', label: 'وعده‌های غذا', desc: 'ناهار، شام و ساعت‌های آن‌ها' },
              { href: '/nutrition/operators', label: 'کارکنان سلف', desc: 'تعریف و مدیریت اپراتورها' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group rounded-xl border border-[var(--color-border)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-brand-300)] hover:shadow-[0_8px_20px_rgba(58,45,125,0.10)]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold">{l.label}</p>
                  <ArrowLeft size={14} className="text-[var(--color-brand-600)] transition-transform group-hover:-translate-x-1" />
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-foreground-muted)]">{l.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <aside className="rounded-xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-brand-50)] to-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold">قوانین انتشار</h2>
          <p className="mt-1.5 text-xs leading-loose text-[var(--color-foreground-muted)]">
            پیش از انتشار هر وعده، این شرایط باید برقرار باشد:
          </p>
          <ul className="mt-4 space-y-2">
            {[
              'حداقل یک غذا در وعده ثبت شده باشد',
              'ظرفیت همه غذاها بزرگ‌تر از صفر باشد',
              'برای هر غذا حداقل یک قیمت ثبت شده باشد',
              'بازه رزرو معتبر باشد: باز شدن < بسته شدن < شروع وعده',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[11px] leading-relaxed">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-5">
            <Badge variant="muted">سرویس رزرو و پرداخت در فازهای بعدی فعال می‌شود</Badge>
          </div>
        </aside>
      </div>

      {stats.activeFoods === 0 && (
        <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold">شروع کار</h2>
          <div className="mt-3">
            <EmptyState
              title="کتابخانه غذا خالی است"
              description="پیش از چیدن برنامه هفتگی، نخستین غذا را به همراه تصویر، دسته، کالری و برچسب ثبت کنید."
              action={
                <Link
                  href="/nutrition/foods"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--color-brand-950)] px-5 text-sm font-medium text-white shadow-[0_4px_14px_rgba(58,45,125,0.35)]"
                >
                  <Plus size={16} /> افزودن غذا
                </Link>
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}
