'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useNow } from '@/components/shared/use-now';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  QrCode,
  Download,
  Wallet,
  CalendarCheck,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { EmptyState, ConfirmDialog, useToast, Dialog } from '@/components/ui/feedback';
import { cancelReservationAction } from '@/server/actions/customer-actions';
import { uploadUrl } from '@/lib/upload-url';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';

export interface MyReservation {
  id: string;
  status: string;
  priceRials: number;
  qrToken: string;
  reservedAt: string;
  usedAt: string | null;
  cancelledAt: string | null;
  foodName: string;
  foodThumb: string | null;
  mealSlotName: string;
  menuDate: string;
  menuStatus: string | null;
  reservationClosesAt: string | null;
  menuDateIso: string | null;
  qrDataUrl: string | null;
}

const STATUS_META: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted'; icon: React.ReactNode }
> = {
  CONFIRMED: { label: 'تأییدشده', variant: 'success', icon: <CheckCircle2 size={12} /> },
  USED: { label: 'تحویل‌شده', variant: 'info', icon: <CheckCircle2 size={12} /> },
  CANCELLED: { label: 'لغو شده', variant: 'danger', icon: <XCircle size={12} /> },
  NO_SHOW: { label: 'عدم حضور', variant: 'muted', icon: <Clock size={12} /> },
  PENDING: { label: 'در انتظار', variant: 'warning', icon: <Clock size={12} /> },
};

export function MyReservationsClient({
  items,
  walletBalanceRials,
  walletHref,
}: {
  items: MyReservation[];
  walletBalanceRials: number;
  walletHref: string;
}) {
  const router = useRouter();
  const now = useNow();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState<MyReservation | null>(null);
  const [qrItem, setQrItem] = useState<MyReservation | null>(null);
  const [busy, setBusy] = useState(false);

  const active = items.filter((i) => i.status === 'CONFIRMED');
  const past = items.filter((i) => i.status !== 'CONFIRMED');

  function canCancel(item: MyReservation): boolean {
    if (item.status !== 'CONFIRMED') return false;
    if (!item.reservationClosesAt) return true;
    return now > 0 && now < new Date(item.reservationClosesAt).getTime();
  }

  async function doCancel() {
    if (!confirmCancel) return;
    setBusy(true);
    const res = await cancelReservationAction(confirmCancel.id);
    setBusy(false);
    setConfirmCancel(null);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'لغو ناموفق بود', description: res.error });
      return;
    }
    toast.push({
      kind: 'success',
      title: 'رزرو لغو شد',
      description: 'مبلغ به کیف پول شما بازگردانده شد',
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* موجودی */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-gradient-to-l from-[var(--color-brand-50)] to-[var(--color-surface)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-brand-100)] text-[var(--color-brand-800)]">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-foreground-muted)]">موجودی کیف پول</p>
            <p className="text-lg font-bold">{formatToman(walletBalanceRials)}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push(walletHref)}>
          مدیریت کیف پول
        </Button>
      </div>

      {/* فعال‌ها */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <CalendarCheck size={15} className="text-[var(--color-brand-700)]" />
          رزروهای فعال
          <Badge variant="muted">{toPersianDigits(active.length)}</Badge>
        </h2>

        {active.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <EmptyState
              title="رزرو فعالی ندارید"
              description="از صفحهٔ «منوی هفته» غذای مورد علاقهٔ خود را رزرو کنید."
              action={
                <Button onClick={() => router.push(walletHref.replace('/wallet', '/menu'))}>
                  مشاهدهٔ منوی هفته
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {active.map((item) => {
              const meta = STATUS_META[item.status] ?? STATUS_META.PENDING;
              const cancellable = canCancel(item);
              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-emerald-200 bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]"
                >
                  <div className="flex gap-3.5 p-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]">
                      {item.foodThumb ? (
                        <Image
                          src={uploadUrl(item.foodThumb) ?? ''}
                          alt={item.foodName}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-xl opacity-35">🍽</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold">{item.foodName}</h3>
                          <p className="mt-0.5 text-[11px] text-[var(--color-foreground-muted)]">
                            {item.mealSlotName} — {item.menuDate}
                          </p>
                        </div>
                        <Badge variant={meta.variant}>
                          {meta.icon} {meta.label}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs">
                        مبلغ: <span className="font-bold">{formatToman(item.priceRials)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-muted)]/30 px-4 py-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<QrCode size={14} />}
                      onClick={() => setQrItem(item)}
                    >
                      نمایش QR
                    </Button>
                    {cancellable ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Ban size={14} />}
                        onClick={() => setConfirmCancel(item)}
                      >
                        لغو رزرو
                      </Button>
                    ) : (
                      <span className="text-[10px] text-[var(--color-foreground-muted)]">
                        زمان لغو گذشته است
                      </span>
                    )}
                    <span className="mr-auto text-[10px] text-[var(--color-foreground-muted)]">
                      رزروشده: {item.reservedAt}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* گذشته */}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-[var(--color-foreground-muted)]">تاریخچه</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full text-right text-xs">
              <thead className="bg-[var(--color-muted)]/40">
                <tr className="text-[11px] text-[var(--color-foreground-muted)]">
                  <th className="px-4 py-2.5 font-semibold">غذا</th>
                  <th className="px-4 py-2.5 font-semibold">وعده</th>
                  <th className="px-4 py-2.5 font-semibold">تاریخ</th>
                  <th className="px-4 py-2.5 font-semibold">مبلغ</th>
                  <th className="px-4 py-2.5 font-semibold">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {past.map((item) => {
                  const meta = STATUS_META[item.status] ?? STATUS_META.PENDING;
                  return (
                    <tr key={item.id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                      <td className="px-4 py-2.5 font-medium">{item.foodName}</td>
                      <td className="px-4 py-2.5 text-[var(--color-foreground-muted)]">
                        {item.mealSlotName}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-foreground-muted)]">{item.menuDate}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatToman(item.priceRials)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* دیالوگ QR */}
      <Dialog
        open={Boolean(qrItem)}
        onClose={() => setQrItem(null)}
        title={`QR رزرو — ${qrItem?.foodName ?? ''}`}
        size="sm"
        footer={
          qrItem?.qrDataUrl ? (
            <a href={qrItem.qrDataUrl} download={`reservation-${qrItem.id}.png`}>
              <Button variant="secondary" icon={<Download size={15} />}>
                دانلود QR
              </Button>
            </a>
          ) : null
        }
      >
        {qrItem?.qrDataUrl ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-2xl border-4 border-[var(--color-brand-100)] bg-white p-4 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrItem.qrDataUrl} alt="QR رزرو" width={220} height={220} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold">{qrItem.foodName}</p>
              <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">
                {qrItem.mealSlotName} — {qrItem.menuDate}
              </p>
              <p className="mt-1 text-xs">
                مبلغ: <span className="font-bold">{formatToman(qrItem.priceRials)}</span>
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-[var(--color-accent-200)] bg-[var(--color-accent-50)]/60 p-3">
              <QrCode size={15} className="mt-0.5 shrink-0 text-[var(--color-accent-700)]" />
              <p className="text-[11px] leading-loose text-[var(--color-accent-900)]">
                این QR را هنگام دریافت غذا به اپراتور سلف نشان دهید. هر QR فقط یک بار قابل استفاده است.
              </p>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-[var(--color-foreground-muted)]">
            QR برای این رزرو موجود نیست.
          </p>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmCancel)}
        onClose={() => setConfirmCancel(null)}
        title="لغو رزرو"
        description={
          confirmCancel
            ? `آیا می‌خواهید رزرو «${confirmCancel.foodName}» را لغو کنید؟ مبلغ ${formatToman(confirmCancel.priceRials)} به کیف پول شما بازگردانده می‌شود.`
            : ''
        }
        confirmLabel="لغو رزرو"
        danger
        onConfirm={doCancel}
      />
    </div>
  );
}

export { ArrowRight };
