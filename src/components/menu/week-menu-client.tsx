'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useNow } from '@/components/shared/use-now';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Flame,
  Tag,
  Users,
  Clock,
  Sparkles,
  ShoppingCart,
  CheckCircle2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { EmptyState, ConfirmDialog, useToast } from '@/components/ui/feedback';
import { uploadUrl } from '@/lib/upload-url';
import { formatToman } from '@/lib/money';
import { toPersianDigits, toLatinDigits } from '@/lib/validation';
import { PERSIAN_WEEKDAYS } from '@/lib/jalali';
import { reserveFoodAction } from '@/server/actions/customer-actions';

interface WeekItem {
  id: string;
  foodName: string;
  category: string;
  calories: number | null;
  tags: string[];
  thumbPath: string | null;
  imagePath: string | null;
  capacity: number;
  reservedCount: number;
  prices: { customerGroup: string; priceRials: number }[];
}

interface WeekCell {
  menuId: string | null;
  date: string;
  mealSlotId: string;
  mealSlotName: string;
  reservationOpensAt: string | null;
  reservationClosesAt: string | null;
  items: WeekItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  MAIN: 'غذای اصلی',
  SIDE: 'میان‌وعده',
  SALAD: 'سالاد',
  DESSERT: 'دسر',
  DRINK: 'نوشیدنی',
  OTHER: 'سایر',
};

function useReserveState() {
  const [busy, setBusy] = useState<string | null>(null);
  return { busy, setBusy };
}

export function WeekMenuClient({
  days,
  slots,
  cells,
  groupLabel,
  walletBalanceRials,
  myReservedItemIds,
  walletHref,
}: {
  days: string[];
  slots: { id: string; name: string }[];
  cells: WeekCell[];
  groupLabel: string;
  walletBalanceRials: number;
  myReservedItemIds: string[];
  walletHref: string;
}) {
  const router = useRouter();
  const now = useNow();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [confirmItem, setConfirmItem] = useState<WeekItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reservedSet = new Set(myReservedItemIds);
  const todayKey = new Date().toDateString();

  async function doReserve(item: WeekItem) {
    setConfirmItem(null);
    setBusyId(item.id);
    const res = await reserveFoodAction(item.id);
    setBusyId(null);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'رزرو ناموفق بود', description: res.error });
      return;
    }
    toast.push({
      kind: 'success',
      title: res.idempotent ? 'شما قبلاً این غذا را رزرو کرده‌اید' : 'رزرو با موفقیت انجام شد',
      description: 'جزئیات در صفحهٔ «رزروهای من» قابل مشاهده است',
    });
    router.refresh();
  }

  function reserveState(
    item: WeekItem,
    cell: WeekCell,
  ): {
    label: string;
    disabled: boolean;
    variant: 'primary' | 'secondary' | 'ghost' | 'danger';
    reason?: string;
  } {
    if (reservedSet.has(item.id)) {
      return { label: 'رزرو شده', disabled: true, variant: 'secondary' };
    }
    const remaining = item.capacity - item.reservedCount;
    if (remaining <= 0) {
      return {
        label: 'ظرفیت تکمیل',
        disabled: true,
        variant: 'ghost',
        reason: 'ظرفیت این غذا تکمیل شده است',
      };
    }

    if (cell.reservationOpensAt && now < new Date(cell.reservationOpensAt).getTime()) {
      return {
        label: 'هنوز آغاز نشده',
        disabled: true,
        variant: 'ghost',
        reason: 'زمان رزرو هنوز شروع نشده است',
      };
    }
    if (cell.reservationClosesAt && now > new Date(cell.reservationClosesAt).getTime()) {
      return {
        label: 'زمان تمام شده',
        disabled: true,
        variant: 'ghost',
        reason: 'زمان رزرو این وعده به پایان رسیده است',
      };
    }
    const price = item.prices[0]?.priceRials ?? 0;
    if (walletBalanceRials < price) {
      return {
        label: 'موجودی ناکافی',
        disabled: true,
        variant: 'danger',
        reason: 'موجودی کیف پول کافی نیست',
      };
    }
    return { label: `رزرو — ${formatToman(price)}`, disabled: false, variant: 'primary' };
  }

  return (
    <div className="space-y-8">
      {/* موجودی کیف پول */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-gradient-to-l from-[var(--color-brand-50)] to-[var(--color-surface)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-brand-100)] text-[var(--color-brand-800)]">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-foreground-muted)]">موجودی کیف پول شما</p>
            <p className="text-lg font-bold">{formatToman(walletBalanceRials)}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push(walletHref)}>
          مدیریت کیف پول
        </Button>
      </div>

      {days.map((dayIso, dayIndex) => {
        const d = new Date(dayIso);
        const isToday = d.toDateString() === todayKey;
        const isPast = d.getTime() < new Date().setHours(0, 0, 0, 0);
        const dayCells = cells.filter((c) => new Date(c.date).toDateString() === d.toDateString());

        return (
          <section key={dayIso} className="scroll-mt-24">
            <header className="mb-4 flex items-center gap-3">
              <div
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                  isToday
                    ? 'bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-950)] text-white shadow-[0_8px_20px_rgba(58,45,125,0.28)]'
                    : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]'
                }`}
              >
                <div className="text-center leading-none">
                  <p className="text-[9px] opacity-70">{toPersianDigits(d.getMonth() + 1)}</p>
                  <p className="text-base font-bold">{toPersianDigits(d.getDate())}</p>
                </div>
              </div>
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold">
                  {PERSIAN_WEEKDAYS[dayIndex % 7]}
                  {isToday && (
                    <Badge variant="accent">
                      <Sparkles size={10} /> امروز
                    </Badge>
                  )}
                  {isPast && <Badge variant="muted">گذشته</Badge>}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-foreground-muted)]">
                  {dayCells.length > 0
                    ? `${toPersianDigits(dayCells.length)} وعده غذایی`
                    : 'برنامه‌ای منتشر نشده است'}
                </p>
              </div>
            </header>

            {dayCells.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60">
                <EmptyState
                  image={false}
                  title="برنامه‌ای برای این روز منتشر نشده"
                  description="به‌محض انتشار برنامه غذایی توسط مدیر تغذیه، اینجا نمایش داده می‌شود."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {dayCells.map((cell, ci) => (
                  <motion.div
                    key={cell.menuId ?? `${cell.date}-${cell.mealSlotId}`}
                    initial={reduce ? false : { opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.35, delay: ci * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-gradient-to-l from-[var(--color-brand-50)] to-transparent px-5 py-3.5">
                      <h3 className="text-sm font-bold">{cell.mealSlotName}</h3>
                      <Badge variant="success">قابل رزرو</Badge>
                    </div>

                    <div className="divide-y divide-[var(--color-border-subtle)]">
                      {cell.items.map((item) => {
                        const price = item.prices[0]?.priceRials ?? 0;
                        const remaining = Math.max(0, item.capacity - item.reservedCount);
                        const state = reserveState(item, cell);
                        const alreadyReserved = reservedSet.has(item.id);

                        return (
                          <div key={item.id} className="flex gap-3.5 p-4">
                            <div className="relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]">
                              {item.imagePath || item.thumbPath ? (
                                <Image
                                  src={uploadUrl(item.imagePath ?? item.thumbPath) ?? ''}
                                  alt={item.foodName}
                                  fill
                                  className="object-cover"
                                  sizes="74px"
                                />
                              ) : (
                                <div className="grid h-full w-full place-items-center text-2xl opacity-35">
                                  🍽
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className="truncate text-[13px] font-bold">{item.foodName}</h4>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="muted">
                                      {CATEGORY_LABELS[item.category] ?? item.category}
                                    </Badge>
                                    {item.calories ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-foreground-muted)]">
                                        <Flame size={10} /> {toPersianDigits(item.calories)} کالری
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="shrink-0 text-left">
                                  <p className="text-[13px] font-bold text-[var(--color-brand-800)]">
                                    {formatToman(price)}
                                  </p>
                                  <p className="mt-0.5 text-[9px] text-[var(--color-foreground-muted)]">
                                    قیمت {groupLabel}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                {item.tags.slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[9px] text-[var(--color-foreground-muted)]"
                                  >
                                    <Tag size={8} /> {t}
                                  </span>
                                ))}
                                <span className="mr-auto inline-flex items-center gap-1 text-[9px] text-[var(--color-foreground-muted)]">
                                  <Users size={9} /> {toPersianDigits(remaining)} ظرفیت باقی‌مانده
                                </span>
                              </div>

                              <div className="mt-3">
                                {alreadyReserved ? (
                                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                                    <CheckCircle2 size={14} />
                                    شما این غذا را رزرو کرده‌اید
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant={state.variant}
                                    disabled={state.disabled}
                                    loading={busyId === item.id}
                                    icon={
                                      state.disabled && state.reason?.includes('موجودی') ? (
                                        <Wallet size={14} />
                                      ) : (
                                        <ShoppingCart size={14} />
                                      )
                                    }
                                    onClick={() => setConfirmItem(item)}
                                    block
                                  >
                                    {state.label}
                                  </Button>
                                )}
                                {state.disabled && state.reason && !alreadyReserved && (
                                  <p className="mt-1.5 text-[10px] text-[var(--color-foreground-muted)]">
                                    {state.reason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="flex items-start gap-3 rounded-xl border border-[var(--color-accent-200)] bg-[var(--color-accent-50)]/60 p-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
          <Clock size={18} />
        </div>
        <div>
          <p className="text-xs font-bold text-[var(--color-accent-900)]">رزرو آسان، بدون صف</p>
          <p className="mt-1.5 text-[11px] leading-loose text-[var(--color-accent-800)]">
            با کلیک روی «رزرو»، مبلغ از کیف پول شما کسر و رزرو ثبت می‌شود. برای دریافت غذا، QR صفحهٔ «رزروهای
            من» را به اپراتور سلف نشان دهید.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmItem)}
        onClose={() => setConfirmItem(null)}
        title="تأیید رزرو"
        description={
          confirmItem
            ? `آیا می‌خواهید «${confirmItem.foodName}» را به مبلغ ${formatToman(confirmItem.prices[0]?.priceRials ?? 0)} رزرو کنید؟ مبلغ از کیف پول شما کسر خواهد شد.`
            : ''
        }
        confirmLabel="رزرو کن"
        onConfirm={async () => {
          if (confirmItem) await doReserve(confirmItem);
        }}
      />
    </div>
  );
}

export { XCircle };
