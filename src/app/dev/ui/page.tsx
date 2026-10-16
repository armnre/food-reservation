'use client';

import React from 'react';
import { Button, Spinner } from '@/components/ui/button';
import {
  Badge,
  StatCard,
  Field,
  TextInput,
  Select,
  Textarea,
  Switch,
  Tabs,
  DataTable,
  type Column,
} from '@/components/ui/data';
import {
  Dialog,
  Drawer,
  ConfirmDialog,
  Skeleton,
  TableSkeleton,
  EmptyState,
  ErrorState,
  Progress,
} from '@/components/ui/feedback';
import { Users, Wallet, CalendarCheck, Activity } from 'lucide-react';
import { DevControls } from '@/components/dev/dev-controls';

interface Demo {
  id: string;
  name: string;
  role: string;
  status: string;
}

const DEMO_ROWS: Demo[] = [
  { id: '1', name: 'علی رضایی', role: 'دانشجو', status: 'فعال' },
  { id: '2', name: 'مریم احمدی', role: 'کارمند', status: 'فعال' },
  { id: '3', name: 'حسین کریمی', role: 'دانشجو', status: 'مرخصی' },
];

const DEMO_COLUMNS: Column<Demo>[] = [
  { key: 'name', header: 'نام', sortable: true },
  { key: 'role', header: 'نقش', render: (r) => <Badge variant="info">{r.role}</Badge> },
  {
    key: 'status',
    header: 'وضعیت',
    render: (r) => <Badge variant={r.status === 'فعال' ? 'success' : 'warning'}>{r.status}</Badge>,
  },
];

export default function DevUIPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-9">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[11px] text-[var(--color-foreground-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-500)]" />
          کتابخانه کامپوننت — هم‌سفره
        </p>
        <h1 className="text-3xl font-bold tracking-tight">سیستم طراحی</h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-loose text-[var(--color-foreground-muted)]">
          همه کامپوننت‌های رابط کاربری در حالت روشن و تیره، با راست‌چین، فونت وزیرمتن و توکن‌های رنگی
          استخراج‌شده از لوگوی دانشگاه.
        </p>
        <DevControls />
      </div>

      {/* دکمه‌ها */}
      <Section title="دکمه‌ها" hint="پنج واریانت + حالت loading">
        <div className="flex flex-wrap items-center gap-3">
          <Button>اصلی</Button>
          <Button variant="accent">تأکیدی</Button>
          <Button variant="secondary">ثانویه</Button>
          <Button variant="outline">خط‌دار</Button>
          <Button variant="ghost">شبح</Button>
          <Button variant="danger">خطر</Button>
          <Button loading>در حال پردازش</Button>
          <Button disabled>غیرفعال</Button>
          <Button size="sm">کوچک</Button>
          <Button size="lg">بزرگ</Button>
          <Spinner />
        </div>
      </Section>

      {/* رنگ‌ها */}
      <Section title="توکن‌های رنگی" hint="مقیاس ۵۰ تا ۹۵۰ از لوگو">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => (
              <div key={s} className="flex-1 min-w-[64px]">
                <div className="h-12 rounded-lg" style={{ background: `var(--color-brand-${s})` }} />
                <p className="mt-1 text-center text-[10px] text-[var(--color-foreground-muted)]">brand-{s}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => (
              <div key={s} className="flex-1 min-w-[64px]">
                <div className="h-12 rounded-lg" style={{ background: `var(--color-accent-${s})` }} />
                <p className="mt-1 text-center text-[10px] text-[var(--color-foreground-muted)]">
                  accent-{s}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* نشان‌ها */}
      <Section title="نشان‌ها" hint="هفت واریانت معنایی">
        <div className="flex flex-wrap gap-2.5">
          <Badge>پیش‌فرض</Badge>
          <Badge variant="success">موفق</Badge>
          <Badge variant="warning">هشدار</Badge>
          <Badge variant="danger">خطا</Badge>
          <Badge variant="info">اطلاعات</Badge>
          <Badge variant="accent">تأکید</Badge>
          <Badge variant="muted">خنثی</Badge>
        </div>
      </Section>

      {/* کارت‌های آمار */}
      <Section title="کارت آماری" hint="چهار تن رنگی">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="دانشجویان فعال"
            value="۱٬۲۴۰"
            hint="+۱۲٪ نسبت به ماه قبل"
            icon={<Users size={20} />}
            tone="brand"
          />
          <StatCard
            title="موجودی کل"
            value="۲۴٬۵۰۰٬۰۰۰"
            hint="ریال"
            icon={<Wallet size={20} />}
            tone="accent"
          />
          <StatCard
            title="رزروهای امروز"
            value="۳۸۲"
            hint="تا این لحظه"
            icon={<CalendarCheck size={20} />}
            tone="success"
          />
          <StatCard
            title="خطاهای سیستم"
            value="۰"
            hint="۲۴ ساعت گذشته"
            icon={<Activity size={20} />}
            tone="warning"
          />
        </div>
      </Section>

      {/* فرم‌ها */}
      <Section title="ورودی‌های فرم" hint="اعتبارسنجی لحظه‌ای با پیام فارسی">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:grid-cols-2">
          <Field label="نام و نام خانوادگی" required>
            <TextInput placeholder="نام کامل خود را وارد کنید" />
          </Field>
          <Field label="شماره دانشجویی" required error="شماره دانشجویی باید ۸ رقم باشد">
            <TextInput dir="ltr" placeholder="40123456" className="text-right" />
          </Field>
          <Field label="دانشکده" hint="اختیاری">
            <Select defaultValue="">
              <option value="">انتخاب کنید</option>
              <option>مهندسی</option>
              <option>علوم پایه</option>
              <option>علوم انسانی</option>
            </Select>
          </Field>
          <Field label="شماره موبایل">
            <TextInput dir="ltr" placeholder="09121234567" className="text-right" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="توضیحات">
              <Textarea placeholder="توضیحات تکمیلی…" />
            </Field>
          </div>
          <div className="flex items-center gap-5 sm:col-span-2">
            <Switch checked onChange={() => {}} label="اعلان ایمیلی" />
            <Switch checked={false} onChange={() => {}} label="حالت تیره" />
          </div>
        </div>
      </Section>

      {/* تب‌ها */}
      <Section title="تب‌ها" hint="با انیمیشن جابه‌جایی">
        <Tabs
          tabs={[
            { id: 'a', label: 'همه', count: 24 },
            { id: 'b', label: 'فعال', count: 18 },
            { id: 'c', label: 'غیرفعال', count: 6 },
          ]}
          active="a"
          onChange={() => {}}
        />
      </Section>

      {/* جدول */}
      <Section title="جدول داده" hint="مرتب‌سازی، جستجو، صفحه‌بندی و انتخاب چندتایی">
        <DataTable
          columns={DEMO_COLUMNS}
          rows={DEMO_ROWS}
          rowKey={(r) => r.id}
          page={1}
          pageSize={10}
          total={24}
          onPageChange={() => {}}
          search=""
          onSearchChange={() => {}}
          searchPlaceholder="جستجو در کاربران…"
          selectedKeys={new Set(['1'])}
          onToggleSelect={() => {}}
          onToggleSelectAll={() => {}}
        />
      </Section>

      {/* وضعیت‌ها */}
      <Section title="وضعیت‌های رابط" hint="Skeleton، EmptyState، ErrorState، Progress">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <p className="mb-3 text-xs font-bold text-[var(--color-foreground-muted)]">Skeleton</p>
            <TableSkeleton rows={3} cols={4} />
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <p className="mb-3 text-xs font-bold text-[var(--color-foreground-muted)]">Skeleton ساده</p>
            <div className="space-y-2.5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <div className="mt-6">
              <p className="mb-3 text-xs font-bold text-[var(--color-foreground-muted)]">Progress</p>
              <Progress value={68} label="بارگذاری فایل" />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <EmptyState
              title="داده‌ای یافت نشد"
              description="با فیلترهای دیگری جستجو کنید یا رکورد جدیدی بسازید."
            />
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <ErrorState onRetry={() => {}} />
          </div>
        </div>
      </Section>

      {/* کامپوننت‌های بازشو */}
      <Section title="کامپوننت‌های بازشو" hint="Dialog، Drawer، ConfirmDialog، Toast">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <DemoModals />
          <div className="mt-5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-muted)]/40 p-4">
            <p className="text-[11px] leading-loose text-[var(--color-foreground-muted)]">
              همه مودال‌ها با انیمیشن ۲۰۰ میلی‌ثانیه‌ای باز می‌شوند و به{' '}
              <code className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px]">
                prefers-reduced-motion
              </code>{' '}
              احترام می‌گذارند.
            </p>
          </div>
        </div>
      </Section>

      {/* اسکلت تم کارت */}
      <Section title="لایه‌بندی سطوح" hint="background → surface → elevated">
        <div className="rounded-xl bg-[var(--color-background)] p-5">
          <div className="rounded-xl bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-5 shadow-[0_8px_24px_rgba(58,45,125,0.10)]">
              <p className="text-sm font-semibold">سطح elevated</p>
              <p className="mt-1.5 text-xs leading-loose text-[var(--color-foreground-muted)]">
                سایه‌های نرم چندلایه برای عمق بخشیدن به رابط کاربری
              </p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-[var(--color-foreground-muted)]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function DemoModals() {
  return <DevControls modals />;
}
