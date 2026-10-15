'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useNow } from '@/components/shared/use-now';
import {
  CheckCircle2, XCircle, Clock, Ban, QrCode, Download, Wallet,
  CalendarCheck, ArrowRight, Hourglass,
} from 'lucide-react';
import { Badge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { EmptyState, ConfirmDialog, useToast, Dialog } from '@/components/ui/feedback';
import { cancelReservationAction } from '@/server/actions/customer-actions';
import { uploadUrl } from '@/lib/upload-url';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

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

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted'; icon: React.ReactNode; tone: string }> = {
  CONFIRMED: { label: 'رزرو فعال', variant: 'success', icon: <CheckCircle2 size={12} />, tone: 'emerald' },
  USED: { label: 'تحویل‌شده', variant: 'info', icon: <CheckCircle2 size={12} />, tone: 'sky' },
  CANCELLED: { label: 'لغو شده', variant: 'danger', icon: <XCircle size={12} />, tone: 'rose' },
  NO_SHOW: { label: 'عدم حضور', variant: 'muted', icon: <Clock size={12} />, tone: 'slate' },
  PENDING: { label: 'در انتظار', variant: 'warning', icon: <Clock size={12} />, tone: 'amber' },
};

export function MyReservationsStudent({
  items, walletBalanceRials, walletHref,
}: {
  items: MyReservation[];
  walletBalanceRials: number;
  walletHref: string;
}) {
  const router = useRouter();
  const now = useNow();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [confirmCancel, setConfirmCancel] = useState<MyReservation | null>(null);
  const [qrItem, setQrItem] = useState<MyReservation | null>(null);
  const [busy, setBusy] = useState(false);

  const active = items.filter((i) => i.status === 'CONFIRMED');
  const used = items.filter((i) => i.status === 'USED');
  const past = items.filter((i) => i.status === 'CANCELLED' || i.status === 'NO_SHOW');

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
      {/* کیف پول سریع */}
      <button
        onClick={() => router.push(walletHref)}
        className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-gradient-to-l from-[var(--color-brand-50)] to-[var(--color-surface)] px-5 py-4 text-right hover:border-[var(--color-brand-300)] hover:shadow-[0_8px_20px_rgba(58,45,125,0.10)]"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-brand-100)] text-[var(--color-brand-800)]">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-foreground-muted)]">موجودی کیف پول</p>
            <p className="text-lg font-bold tabular-nums">{formatToman(walletBalanceRials)}</p>
          </div>
        </div>
        <ArrowRight size={14} className="text-[var(--color-foreground-muted)] transition-transform group-hover:-translate-x-1" />
      </button>

      {/* فعال */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <CalendarCheck size={15} className="text-emerald-600" />
          رزروهای فعال
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            {toPersianDigits(active.length)}
          </span>
        </h2>

        {active.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
            <EmptyState
              title="هنوز رزرو فعالی ندارید"
              description="از صفحهٔ «منوی هفته» غذای مورد علاقه‌تان را رزرو کنید."
              action={
                <Button onClick={() => router.push(walletHref.includes('/staff') ? '/staff/menu' : '/student/menu')}>
                  مشاهدهٔ منوی هفته
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((item, i) => {
              const meta = STATUS_META[item.status];
              const cancellable = canCancel(item);
              return (
                <motion.article
                  key={item.id}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="overflow-hidden rounded-2xl border border-emerald-200 bg-[var(--color-surface)] shadow-[0_4px_14px_rgba(16,185,129,0.10)]"
                >
                  <div className="flex gap-3.5 p-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-emerald-100 bg-[var(--color-muted)]">
                      {item.foodThumb ? (
                        <Image src={uploadUrl(item.foodThumb) ?? ''} alt={item.foodName} fill className="object-cover" sizes="64px" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-2xl">🍽</div>
                      )}
                      <div className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white shadow">
                        <CheckCircle2 size={12} strokeWidth={2.5} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-bold">{item.foodName}</h3>
                          <p className="mt-0.5 text-[11px] text-[var(--color-foreground-muted)]">
                            {item.mealSlotName} — {item.menuDate}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-base font-bold text-[var(--color-brand-800)] tabular-nums">
                            {formatToman(item.priceRials)}
                          </p>
                          <p className="mt-0.5 text-[9px] text-[var(--color-foreground-muted)]">{item.reservedAt}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-emerald-100 bg-emerald-50/40 px-4 py-3">
                    <Button size="sm" variant="primary" icon={<QrCode size={14} />} onClick={() => setQrItem(item)}>
                      نمایش QR بلیط
                    </Button>
                    {cancellable ? (
                      <Button size="sm" variant="ghost" icon={<Ban size={14} />} onClick={() => setConfirmCancel(item)}>
                        لغو رزرو
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--color-foreground-muted)]">
                        <Hourglass size={11} /> زمان لغو گذشته است
                      </span>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      {/* تحویل‌شده */}
      {used.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-[var(--color-foreground-muted)]">تحویل‌شده‌ها</h2>
          <div className="space-y-2">
            {used.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-600">
                  <CheckCircle2 size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{item.foodName}</p>
                  <p className="text-[10px] text-[var(--color-foreground-muted)]">{item.mealSlotName} — {item.menuDate}</p>
                </div>
                <Badge variant="info">تحویل‌شده</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* لغو شده‌ها */}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-[var(--color-foreground-muted)]">تاریخچه</h2>
          <div className="space-y-2">
            {past.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 opacity-70">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-muted)] text-[var(--color-foreground-muted)]">
                  <XCircle size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{item.foodName}</p>
                  <p className="text-[10px] text-[var(--color-foreground-muted)]">{item.mealSlotName} — {item.menuDate}</p>
                </div>
                <Badge variant="muted">{STATUS_META[item.status]?.label ?? item.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* QR Dialog */}
      <Dialog
        open={Boolean(qrItem)}
        onClose={() => setQrItem(null)}
        title={`QR بلیط — ${qrItem?.foodName ?? ''}`}
        size="sm"
        footer={
          qrItem?.qrDataUrl ? (
            <a href={qrItem.qrDataUrl} download={`qr-${qrItem.id.slice(0, 8)}.png`}>
              <Button variant="secondary" icon={<Download size={15} />}>دانلود تصویر QR</Button>
            </a>
          ) : null
        }
      >
        {qrItem?.qrDataUrl ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <motion.div
              initial={reduce ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="rounded-2xl border-4 border-[var(--color-brand-100)] bg-white p-4 shadow-[0_20px_50px_rgba(58,45,125,0.20)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrItem.qrDataUrl} alt="QR رزرو" width={220} height={220} />
            </motion.div>
            <div className="text-center">
              <p className="text-base font-bold">{qrItem.foodName}</p>
              <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">
                {qrItem.mealSlotName} — {qrItem.menuDate}
              </p>
              <p className="mt-2 text-sm font-bold text-[var(--color-brand-800)]">
                {formatToman(qrItem.priceRials)}
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-[var(--color-accent-200)] bg-[var(--color-accent-50)]/60 p-3.5 text-right">
              <QrCode size={15} className="mt-0.5 shrink-0 text-[var(--color-accent-700)]" />
              <p className="text-[11px] leading-loose text-[var(--color-accent-900)]">
                این کد QR را هنگام دریافت غذا به اپراتور سلف نشان دهید. هر QR فقط یک‌بار قابل استفاده است.
              </p>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-[var(--color-foreground-muted)]">QR برای این رزرو موجود نیست.</p>
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