import React from 'react';
import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { listMySessions, roleLabel } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/data';
import { SessionsClient } from '@/components/profile/sessions-client';


export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const ctx = await requireRole(
    ROLES.STUDENT, ROLES.STAFF, ROLES.VICE_STUDENT,
    ROLES.NUTRITION_MANAGER, ROLES.CAFETERIA_OPERATOR, ROLES.SUPER_ADMIN,
  );
  const sessions = await listMySessions();

  return (
    <div>
      <PageHeader title="پروفایل من" description="اطلاعات حساب، رمز عبور و نشست‌های فعال" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-950)] text-2xl font-bold text-white">
              {ctx.user.displayName.trim().charAt(0) || 'ک'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{ctx.user.displayName}</p>
              <p className="mt-1 font-mono text-xs text-[var(--color-foreground-muted)]" dir="ltr">{ctx.user.username}</p>
              <div className="mt-2">
                <Badge variant="info">{roleLabel(ctx.user.role)}</Badge>
              </div>
            </div>
          </div>

          <dl className="mt-6 space-y-2">
            {[
              ['نام کاربری', ctx.user.username],
              ['نقش', roleLabel(ctx.user.role)],
              ['وضعیت حساب', ctx.user.isActive ? 'فعال' : 'غیرفعال'],
              ['وضعیت رمز', ctx.user.mustChangePassword ? 'نیاز به تعویض' : 'تنظیم‌شده'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] px-3.5 py-2.5">
                <dt className="text-xs text-[var(--color-foreground-muted)]">{k}</dt>
                <dd className="text-xs font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lg:col-span-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-bold">نشست‌های فعال</h2>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">
            دستگاه‌هایی که هم‌اکنون با حساب شما وارد شده‌اند
          </p>
          <div className="mt-4">
            <SessionsClient items={sessions.items} />
          </div>
        </section>
      </div>
    </div>
  );
}
