import React from 'react';
import Link from 'next/link';
import { UtensilsCrossed, Wallet, CalendarCheck, Sparkles, ArrowLeft, Plus } from 'lucide-react';
import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard, Badge } from '@/components/ui/data';
import { EmptyState } from '@/components/ui/feedback';
import { nowJalali } from '@/lib/jalali';
import { getWalletBalance } from '@/server/services/wallet';
import { getMyReservations } from '@/server/services/reservation';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function StaffDashboardPage() {
  const ctx = await requireRole(ROLES.STAFF);
  const firstName = ctx.user.displayName.split(' ')[0];

  const [balance, myReservations] = await Promise.all([
    getWalletBalance(ctx.user.id),
    getMyReservations(ctx.user.id),
  ]);
  const activeCount = myReservations.filter((r) => r.status === 'CONFIRMED').length;

  return (
    <div>
      <PageHeader
        title={`سلام، ${firstName} عزیز`}
        description={nowJalali()}
        actions={<Badge variant="accent"><Sparkles size={12} /> پنل کارکنان دانشگاه</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="منوی امروز"
          value={<Link href="/staff/menu" className="underline decoration-dotted">مشاهده</Link>}
          hint="رزرو آنلاین فعال است"
          icon={<UtensilsCrossed size={20} />}
          tone="brand"
        />
        <StatCard
          title="موجودی کیف پول"
          value={formatToman(balance)}
          hint={<Link href="/staff/wallet" className="underline decoration-dotted">شارژ کیف پول</Link>}
          icon={<Wallet size={20} />}
          tone="accent"
        />
        <StatCard
          title="رزروهای فعال"
          value={toPersianDigits(activeCount)}
          hint={<Link href="/staff/reservations" className="underline decoration-dotted">مشاهدهٔ QR</Link>}
          icon={<CalendarCheck size={20} />}
          tone="success"
        />
      </div>

      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">رزروهای من</h2>
          <Link href="/staff/reservations" className="flex items-center gap-1 text-xs text-[var(--color-brand-700)] hover:underline">
            همه <ArrowLeft size={12} />
          </Link>
        </div>
        {activeCount === 0 ? (
          <div className="mt-3">
            <EmptyState
              image={false}
              title="هنوز رزروی ندارید"
              description="وعدهٔ مورد علاقهٔ خود را از منوی هفته رزرو کنید."
              action={
                <Link
                  href="/staff/menu"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-950)] px-5 text-xs font-medium text-white"
                >
                  <Plus size={14} /> مشاهدهٔ منو
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {myReservations.filter((r) => r.status === 'CONFIRMED').slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 px-3.5 py-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                  <UtensilsCrossed size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{r.foodName}</p>
                  <p className="text-[10px] text-[var(--color-foreground-muted)]">{r.mealSlotName} — {r.menuDate}</p>
                </div>
                <span className="text-[11px] font-bold">{formatToman(r.priceRials)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
