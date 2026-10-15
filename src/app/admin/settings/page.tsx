import React from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/data';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  const rows: { key: string; label: string; value: string; hint: string }[] = [
    {
      key: 'TRUSTED_PROXY_HOPS',
      label: 'تعداد hop مورد اعتماد پراکسی',
      value: String(env.trustedProxyHops),
      hint: '۰ یعنی فقط IP سوکت مبنا قرار می‌گیرد',
    },
    {
      key: 'SESSION_TTL_HOURS',
      label: 'طول عمر نشست (ساعت)',
      value: String(env.sessionTtlHours),
      hint: 'نشست به‌صورت لغزان تمدید می‌شود',
    },
    {
      key: 'SESSION_COOKIE_NAME',
      label: 'نام کوکی نشست',
      value: env.sessionCookieName,
      hint: 'httpOnly / secure / sameSite=lax',
    },
    {
      key: 'UPLOAD_DIR',
      label: 'پوشه بارگذاری فایل‌ها',
      value: env.uploadDir,
      hint: 'خارج از پوشه public',
    },
    {
      key: 'REDIS_URL',
      label: 'اتصال Redis',
      value: env.isProduction ? 'تنظیم‌شده (از متغیر محیطی)' : 'در حالت توسعه، fallback حافظه‌ای فعال است',
      hint: 'در production اجباری است',
    },
    {
      key: 'DATA_ENCRYPTION_KEY',
      label: 'کلید رمزنگاری داده',
      value: '•••••••• (AES-256-GCM)',
      hint: 'هرگز نمایش داده نمی‌شود',
    },
    {
      key: 'DATA_HASH_KEY',
      label: 'کلید ایندکس کور',
      value: '•••••••• (HMAC-SHA256)',
      hint: 'برای جستجوی امن کد ملی',
    },
  ];

  return (
    <div>
      <PageHeader
        title="تنظیمات سیستم"
        description="پیکربندی امنیتی و زیرساختی سامانه — همه مقادیر از متغیرهای محیطی خوانده می‌شوند"
      />

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/40">
              <th className="px-5 py-3 text-xs font-semibold text-[var(--color-foreground-muted)]">متغیر</th>
              <th className="px-5 py-3 text-xs font-semibold text-[var(--color-foreground-muted)]">مقدار</th>
              <th className="px-5 py-3 text-xs font-semibold text-[var(--color-foreground-muted)]">توضیح</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[var(--color-border-subtle)] last:border-0">
                <td className="px-5 py-3.5">
                  <p className="font-mono text-xs" dir="ltr">{r.key}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-foreground-muted)]">{r.label}</p>
                </td>
                <td className="px-5 py-3.5">
                  <Badge variant="muted">{r.value}</Badge>
                </td>
                <td className="px-5 py-3.5 text-[11px] leading-relaxed text-[var(--color-foreground-muted)]">{r.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--color-accent-200)] bg-[var(--color-accent-50)]/70 p-5">
        <h2 className="text-sm font-bold text-[var(--color-accent-900)]">سیاست‌های امنیتی فعال</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            'قفل موقت ورود بر مبنای (شناسه + IP)',
            'کپچا از تلاش سوم',
            'کد ملی با AES-256-GCM رمزنگاری می‌شود',
            'ایندکس کور HMAC برای جستجوی امن',
            'جدول audit_logs فقط افزودنی (append-only)',
            'حذف فیزیکی ممنوع؛ فقط غیرفعال‌سازی',
            'کوکی نشست httpOnly و sameSite=lax',
            'Redis اجباری در محیط production',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2 rounded-lg border border-[var(--color-accent-200)]/60 bg-[var(--color-surface)]/70 px-3 py-2 text-[11px] leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent-500)]" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
