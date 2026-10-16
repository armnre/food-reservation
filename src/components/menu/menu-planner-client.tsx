'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Lock,
  Send,
  Undo2,
  XCircle,
  Copy,
  Clock,
  AlertTriangle,
  Users,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Field, TextInput, Select, Switch } from '@/components/ui/data';
import { Drawer, Dialog, ConfirmDialog, useToast, EmptyState, Progress } from '@/components/ui/feedback';
import {
  openMenuCellAction,
  getMenuItemDetailAction,
  upsertMenuItemAction,
  removeMenuItemAction,
  setReservationWindowAction,
  publishMenuAction,
  closeMenuAction,
  revertMenuAction,
  copyMenuAction,
  copyPreviousWeekAction,
} from '@/server/actions/menu-actions';
import { uploadUrl } from '@/lib/upload-url';
import { formatToman, tomanToRial, rialToToman } from '@/lib/money';
import { toPersianDigits, toLatinDigits } from '@/lib/validation';
import { PERSIAN_WEEKDAYS } from '@/lib/jalali';

export interface SlotDto {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}
export interface FoodOption {
  id: string;
  name: string;
  category: string;
}

export interface CellItem {
  id: string;
  foodId: string;
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

export interface CellDto {
  menuId: string | null;
  date: string;
  mealSlotId: string;
  mealSlotName: string;
  status: string | null;
  reservationOpensAt: string | null;
  reservationClosesAt: string | null;
  items: CellItem[];
  checklist: { key: string; label: string; ok: boolean }[];
}

const STATUS_META: Record<
  string,
  { label: string; variant: 'muted' | 'success' | 'warning' | 'danger'; icon: React.ReactNode }
> = {
  DRAFT: { label: 'پیش‌نویس', variant: 'warning', icon: <Clock size={11} /> },
  PUBLISHED: { label: 'منتشرشده', variant: 'success', icon: <CheckCircle2 size={11} /> },
  CLOSED: { label: 'بسته‌شده', variant: 'muted', icon: <Lock size={11} /> },
};

const GROUPS = [
  { key: 'STUDENT', label: 'دانشجو' },
  { key: 'EMPLOYEE', label: 'کارمند' },
  { key: 'FACULTY', label: 'هیئت‌علمی' },
  { key: 'CONTRACTOR', label: 'پیمانکار' },
];

function fmtDay(iso: string, index: number) {
  const d = new Date(iso);
  return {
    weekday: PERSIAN_WEEKDAYS[index % 7],
    day: toPersianDigits(d.getDate()),
    month: toPersianDigits(d.getMonth() + 1),
  };
}

function priceFor(items: CellItem[], item: CellItem, group: string): number | null {
  void items;
  const p = item.prices.find((x) => x.customerGroup === group);
  return p ? p.priceRials : null;
}

export function MenuPlannerClient({
  days,
  slots,
  cells,
  foods,
  canManage,
  weekOffset,
}: {
  days: string[];
  slots: SlotDto[];
  cells: CellDto[];
  foods: FoodOption[];
  canManage: boolean;
  weekOffset: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [active, setActive] = useState<CellDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmCopyWeek, setConfirmCopyWeek] = useState(false);

  function cellOf(dateIso: string, slotId: string) {
    return (
      cells.find(
        (c) =>
          new Date(c.date).toDateString() === new Date(dateIso).toDateString() && c.mealSlotId === slotId,
      ) ?? null
    );
  }

  async function openCell(dateIso: string, slotId: string) {
    const found = cellOf(dateIso, slotId);
    setBusyKey(`${dateIso}|${slotId}`);
    let cell = found;
    if (!cell?.menuId) {
      const res = await openMenuCellAction(dateIso, slotId);
      if (!res.ok) {
        toast.push({ kind: 'error', title: 'خطا', description: res.error });
        setBusyKey(null);
        return;
      }
      cell = {
        menuId: res.menuId,
        date: dateIso,
        mealSlotId: slotId,
        mealSlotName: slots.find((s) => s.id === slotId)?.name ?? '',
        status: res.status,
        reservationOpensAt: null,
        reservationClosesAt: null,
        items: [],
        checklist: [],
      };
    }
    setBusyKey(null);
    setActive(cell);
    router.refresh();
  }

  return (
    <div>
      {/* نوار ابزار هفته */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push(`/nutrition/menu?w=${weekOffset - 1}`)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-muted)]"
            aria-label="هفته قبل"
          >
            <ChevronRight size={17} />
          </button>
          <div className="px-3 text-center">
            <p className="text-sm font-bold">
              {weekOffset === 0
                ? 'هفته جاری'
                : weekOffset === 1
                  ? 'هفته آینده'
                  : weekOffset === -1
                    ? 'هفته گذشته'
                    : `هفته ${toPersianDigits(weekOffset)}`}
            </p>
            <p className="text-[10px] text-[var(--color-foreground-muted)]">
              {fmtDay(days[0], 0).day}/{fmtDay(days[0], 0).month} تا {fmtDay(days[6], 6).day}/
              {fmtDay(days[6], 6).month}
            </p>
          </div>
          <button
            onClick={() => router.push(`/nutrition/menu?w=${weekOffset + 1}`)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-muted)]"
            aria-label="هفته بعد"
          >
            <ChevronLeft size={17} />
          </button>
        </div>

        {canManage && (
          <div className="mr-auto flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Copy size={15} />} onClick={() => setConfirmCopyWeek(true)}>
              کپی منوی هفته قبل
            </Button>
          </div>
        )}
      </div>

      {/* جدول هفتگی */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]">
        <table className="w-full min-w-[900px] text-right">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50">
              <th className="w-32 px-4 py-3 text-xs font-semibold text-[var(--color-foreground-muted)]">
                وعده
              </th>
              {days.map((d, i) => {
                const f = fmtDay(d, i);
                const isToday = new Date(d).toDateString() === new Date().toDateString();
                return (
                  <th
                    key={d}
                    className={`px-3 py-3 text-center ${isToday ? 'bg-[var(--color-brand-50)]/70' : ''}`}
                  >
                    <p className="text-[11px] font-semibold text-[var(--color-foreground-muted)]">
                      {f.weekday}
                    </p>
                    <p className={`text-sm font-bold ${isToday ? 'text-[var(--color-brand-800)]' : ''}`}>
                      {f.day}/{f.month}
                    </p>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                <th className="px-4 py-3 text-right align-top">
                  <p className="text-xs font-bold">{slot.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--color-foreground-muted)]" dir="ltr">
                    {new Date(slot.startTime).getHours()}:
                    {String(new Date(slot.startTime).getMinutes()).padStart(2, '0')}
                  </p>
                </th>
                {days.map((d) => {
                  const cell = cellOf(d, slot.id);
                  const isPast = new Date(d).getTime() < new Date().setHours(0, 0, 0, 0);
                  const key = `${d}|${slot.id}`;
                  const meta = cell?.status ? STATUS_META[cell.status] : null;

                  return (
                    <td key={key} className="p-2 align-top">
                      <button
                        disabled={isPast || busyKey === key}
                        onClick={() => openCell(d, slot.id)}
                        className={`group min-h-[112px] w-full rounded-lg border p-2.5 text-right transition-all duration-200 ${
                          isPast
                            ? 'cursor-not-allowed border-[var(--color-border-subtle)] bg-[var(--color-muted)]/30 opacity-60'
                            : 'border-[var(--color-border)] hover:-translate-y-0.5 hover:border-[var(--color-brand-300)] hover:shadow-[0_8px_20px_rgba(58,45,125,0.10)]'
                        } ${cell?.status === 'PUBLISHED' ? 'border-emerald-200 bg-emerald-50/40' : ''}`}
                      >
                        {busyKey === key ? (
                          <div className="flex h-full items-center justify-center">
                            <Progress value={60} />
                          </div>
                        ) : cell && cell.items.length > 0 ? (
                          <>
                            <div className="mb-1.5 flex items-center justify-between gap-1">
                              {meta && (
                                <Badge variant={meta.variant}>
                                  {meta.icon} {meta.label}
                                </Badge>
                              )}
                              <span className="text-[10px] text-[var(--color-foreground-muted)]">
                                {toPersianDigits(cell.items.length)} غذا
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {cell.items.slice(0, 3).map((it) => (
                                <li key={it.id} className="flex items-center justify-between gap-1.5">
                                  <span className="truncate text-[10px]">{it.foodName}</span>
                                  <span className="shrink-0 text-[9px] text-[var(--color-foreground-muted)]">
                                    {toPersianDigits(rialToToman(priceFor(cell.items, it, 'STUDENT') ?? 0))}
                                  </span>
                                </li>
                              ))}
                              {cell.items.length > 3 && (
                                <li className="text-[9px] text-[var(--color-foreground-muted)]">
                                  و {toPersianDigits(cell.items.length - 3)} مورد دیگر…
                                </li>
                              )}
                            </ul>
                          </>
                        ) : isPast ? (
                          <p className="pt-6 text-center text-[10px] text-[var(--color-foreground-muted)]">
                            گذشته
                          </p>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[var(--color-foreground-muted)]">
                            <Plus
                              size={18}
                              className="opacity-40 transition-opacity group-hover:opacity-90"
                            />
                            <span className="text-[10px] opacity-60">افزودن منو</span>
                          </div>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* راهنما */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {Object.entries(STATUS_META).map(([k, v]) => (
          <Badge key={k} variant={v.variant}>
            {v.icon} {v.label}
          </Badge>
        ))}
        <span className="mr-auto text-[11px] text-[var(--color-foreground-muted)]">
          روزهای گذشته فقط‌خواندنی هستند
        </span>
      </div>

      {active && (
        <MenuCellDrawer
          cell={active}
          foods={foods}
          canManage={canManage && active.status !== 'CLOSED'}
          onClose={() => setActive(null)}
          onChanged={() => {
            setActive(null);
            router.refresh();
          }}
          reduce={reduce}
        />
      )}

      <ConfirmDialog
        open={confirmCopyWeek}
        onClose={() => setConfirmCopyWeek(false)}
        title="کپی منوی هفته قبل"
        description="همه وعده‌های هفته گذشته با ظرفیت و قیمت یکسان به هفته جاری کپی می‌شوند. آیتم‌های تکراری نادیده گرفته می‌شوند."
        confirmLabel="کپی کن"
        onConfirm={async () => {
          const res = await copyPreviousWeekAction();
          setConfirmCopyWeek(false);
          if (res.ok) {
            toast.push({
              kind: 'success',
              title: 'کپی انجام شد',
              description: `${toPersianDigits(res.totalCopied)} آیتم در ${toPersianDigits(res.menus)} وعده کپی شد`,
            });
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />
    </div>
  );
}

/* ───────────── دراور ویرایش وعده ───────────── */

interface DetailItem {
  id: string;
  foodId: string;
  foodName: string;
  category: string;
  capacity: number;
  reservedCount: number;
  prices: { customerGroup: string; priceRials: number }[];
}

function MenuCellDrawer({
  cell,
  foods,
  canManage,
  onClose,
  onChanged,
  reduce,
}: {
  cell: CellDto;
  foods: FoodOption[];
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  reduce: boolean | null;
}) {
  const toast = useToast();
  const [items, setItems] = useState<DetailItem[]>(
    cell.items.map((i) => ({
      id: i.id,
      foodId: i.foodId,
      foodName: i.foodName,
      category: i.category,
      capacity: i.capacity,
      reservedCount: i.reservedCount,
      prices: i.prices,
    })),
  );
  const [foodId, setFoodId] = useState('');
  const [capacity, setCapacity] = useState('10');
  const [prices, setPrices] = useState<Record<string, string>>({
    STUDENT: '',
    EMPLOYEE: '',
    FACULTY: '',
    CONTRACTOR: '',
  });
  const [opensAt, setOpensAt] = useState(
    cell.reservationOpensAt ? toLocalInput(cell.reservationOpensAt) : '',
  );
  const [closesAt, setClosesAt] = useState(
    cell.reservationClosesAt ? toLocalInput(cell.reservationClosesAt) : '',
  );
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<DetailItem | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const checklist = buildClientChecklist(items, opensAt, closesAt, cell.date, items.length);

  async function saveWindow(): Promise<boolean> {
    if (!cell.menuId) return true;
    if (!opensAt || !closesAt) {
      toast.push({ kind: 'warning', title: 'بازه رزرو را کامل کنید' });
      return false;
    }
    const res = await setReservationWindowAction({
      menuId: cell.menuId,
      opensAt: new Date(opensAt).toISOString(),
      closesAt: new Date(closesAt).toISOString(),
    });
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'بازه رزرو نامعتبر است', description: res.error });
      return false;
    }
    return true;
  }

  async function addItem() {
    if (!cell.menuId) return;
    if (!foodId) {
      toast.push({ kind: 'warning', title: 'یک غذا انتخاب کنید' });
      return;
    }
    const cap = Number.parseInt(toLatinDigits(capacity), 10);
    if (!Number.isFinite(cap) || cap <= 0) {
      toast.push({ kind: 'warning', title: 'ظرفیت باید بزرگ‌تر از صفر باشد' });
      return;
    }

    const priceList = GROUPS.map((g) => ({
      customerGroup: g.key as 'STUDENT' | 'EMPLOYEE' | 'FACULTY' | 'CONTRACTOR',
      priceRials: prices[g.key] ? tomanToRial(Number.parseInt(toLatinDigits(prices[g.key]), 10) || 0) : 0,
    })).filter((p) => p.priceRials > 0);

    if (priceList.length === 0) {
      toast.push({
        kind: 'warning',
        title: 'حداقل برای یک گروه قیمت تعیین کنید',
        description: 'گروه‌های بدون قیمت، این غذا را نمی‌بینند',
      });
      return;
    }

    setBusy(true);
    const res = await upsertMenuItemAction({ menuId: cell.menuId, foodId, capacity: cap, prices: priceList });
    setBusy(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'افزودن ناموفق بود', description: res.error });
      return;
    }
    toast.push({ kind: 'success', title: 'غذا به وعده اضافه شد' });
    onChanged();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`منوی ${cell.mealSlotName}`}
      footer={
        canManage ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              بستن
            </Button>
            {cell.status === 'DRAFT' && (
              <Button variant="accent" icon={<Send size={15} />} onClick={() => setConfirmPublish(true)}>
                انتشار منو
              </Button>
            )}
            {cell.status === 'PUBLISHED' && (
              <>
                <Button variant="secondary" icon={<Undo2 size={15} />} onClick={() => setConfirmRevert(true)}>
                  بازگشت به پیش‌نویس
                </Button>
                <Button
                  variant="danger"
                  icon={<Lock size={15} />}
                  onClick={async () => {
                    const res = await closeMenuAction(cell.menuId as string);
                    if (res.ok) {
                      toast.push({ kind: 'success', title: 'منو بسته شد' });
                      onChanged();
                    } else toast.push({ kind: 'error', title: 'خطا', description: res.error });
                  }}
                >
                  بستن زودهنگام
                </Button>
              </>
            )}
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {cell.status && (
            <Badge variant={STATUS_META[cell.status]?.variant ?? 'muted'}>
              {STATUS_META[cell.status]?.label}
            </Badge>
          )}
          <span className="text-[11px] text-[var(--color-foreground-muted)]">
            {toPersianDigits(items.length)} آیتم ثبت‌شده
          </span>
        </div>

        {/* بازه رزرو */}
        <section>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[var(--color-foreground-muted)]">
            <Clock size={13} /> بازه رزرو
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="شروع رزرو">
              <TextInput
                type="datetime-local"
                dir="ltr"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
                className="text-right"
                disabled={!canManage}
              />
            </Field>
            <Field label="پایان رزرو" hint="باید قبل از شروع وعده باشد">
              <TextInput
                type="datetime-local"
                dir="ltr"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="text-right"
                disabled={!canManage}
              />
            </Field>
          </div>
          {canManage && (
            <Button size="sm" variant="secondary" className="mt-2.5" onClick={saveWindow}>
              ذخیره بازه
            </Button>
          )}
        </section>

        {/* آیتم‌ها */}
        <section>
          <h3 className="mb-2.5 text-xs font-bold text-[var(--color-foreground-muted)]">غذاهای این وعده</h3>
          {items.length === 0 ? (
            <EmptyState
              title="این وعده خالی است"
              description="از فرم پایین، غذا به این وعده اضافه کنید."
              image={false}
            />
          ) : (
            <div className="space-y-2.5">
              {items.map((it) => (
                <motion.div
                  key={it.id}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-[var(--color-border)] p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{it.foodName}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="muted">
                          <Users size={10} /> ظرفیت {toPersianDigits(it.capacity)}
                        </Badge>
                        <Badge variant={it.reservedCount > 0 ? 'info' : 'muted'}>
                          رزرو {toPersianDigits(it.reservedCount)}
                        </Badge>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => setConfirmRemove(it)}
                        className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                        aria-label="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {GROUPS.map((g) => {
                      const p = it.prices.find((x) => x.customerGroup === g.key);
                      return (
                        <div
                          key={g.key}
                          className={`rounded-lg border px-2.5 py-1.5 ${p ? 'border-[var(--color-border)]' : 'border-dashed border-[var(--color-border-subtle)] opacity-55'}`}
                        >
                          <p className="text-[9px] text-[var(--color-foreground-muted)]">{g.label}</p>
                          <p className="text-[11px] font-semibold">
                            {p ? formatToman(p.priceRials) : 'قیمت ندارد'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* افزودن غذا */}
        {canManage && (
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/35 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold">
              <Plus size={13} /> افزودن غذا به این وعده
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="غذا" required>
                <Select value={foodId} onChange={(e) => setFoodId(e.target.value)}>
                  <option value="">انتخاب کنید…</option>
                  {foods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ظرفیت" required hint="عدد صحیح بزرگ‌تر از صفر">
                <TextInput
                  dir="ltr"
                  value={capacity}
                  className="text-right"
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </Field>
            </div>

            <p className="mb-2 mt-4 text-[11px] text-[var(--color-foreground-muted)]">
              قیمت به <strong>تومان</strong> وارد کنید. گروهی که قیمت نداشته باشد، این غذا را نمی‌بیند.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {GROUPS.map((g) => (
                <Field key={g.key} label={g.label}>
                  <TextInput
                    dir="ltr"
                    inputMode="numeric"
                    value={prices[g.key]}
                    placeholder="تومان"
                    className="text-right"
                    onChange={(e) => setPrices((p) => ({ ...p, [g.key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>

            <Button className="mt-4" block loading={busy} onClick={addItem} icon={<Plus size={15} />}>
              افزودن به منو
            </Button>
          </section>
        )}

        {/* چک‌لیست انتشار */}
        {canManage && (
          <section>
            <h3 className="mb-2.5 text-xs font-bold text-[var(--color-foreground-muted)]">چک‌لیست انتشار</h3>
            <div className="space-y-1.5">
              {checklist.map((c) => (
                <div
                  key={c.key}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${c.ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/60'}`}
                >
                  {c.ok ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  )}
                  <p className="text-[11px] leading-relaxed">{c.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        title="حذف آیتم از منو"
        description={`«${confirmRemove?.foodName}» از این وعده حذف می‌شود. آیتم‌های رزروشده قابل حذف نیستند.`}
        confirmLabel="حذف"
        danger
        onConfirm={async () => {
          if (!confirmRemove) return;
          const res = await removeMenuItemAction(confirmRemove.id);
          setConfirmRemove(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'آیتم حذف شد' });
            onChanged();
          } else toast.push({ kind: 'error', title: 'خطا', description: res.error });
        }}
      />

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title="انتشار منو"
        description="پس از انتشار، این منو برای دانشجویان و کارکنان نمایش داده می‌شود. ظرفیت دیگر نمی‌تواند کمتر از تعداد رزروشده باشد."
        confirmLabel="انتشار"
        onConfirm={async () => {
          if (!(await saveWindow())) {
            setConfirmPublish(false);
            return;
          }
          const res = await publishMenuAction(cell.menuId as string);
          setConfirmPublish(false);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'منو منتشر شد' });
            onChanged();
          } else toast.push({ kind: 'error', title: 'انتشار ناموفق بود', description: res.error });
        }}
      />

      <ConfirmDialog
        open={confirmRevert}
        onClose={() => setConfirmRevert(false)}
        title="بازگشت به پیش‌نویس"
        description="فقط وقتی هیچ رزروی ثبت نشده باشد امکان‌پذیر است."
        confirmLabel="بازگشت"
        onConfirm={async () => {
          const res = await revertMenuAction(cell.menuId as string);
          setConfirmRevert(false);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'منو به پیش‌نویس بازگشت' });
            onChanged();
          } else toast.push({ kind: 'error', title: 'خطا', description: res.error });
        }}
      />
    </Drawer>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildClientChecklist(
  items: DetailItem[],
  opensAt: string,
  closesAt: string,
  dateIso: string,
  count: number,
) {
  void dateIso;
  const opens = opensAt ? new Date(opensAt).getTime() : NaN;
  const closes = closesAt ? new Date(closesAt).getTime() : NaN;
  return [
    { key: 'food', label: 'حداقل یک غذا در وعده ثبت شده باشد', ok: count > 0 },
    {
      key: 'capacity',
      label: 'ظرفیت همه غذاها بزرگ‌تر از صفر باشد',
      ok: items.length > 0 && items.every((i) => i.capacity > 0),
    },
    {
      key: 'price',
      label: 'برای هر غذا حداقل یک قیمت ثبت شده باشد',
      ok: items.length > 0 && items.every((i) => i.prices.length > 0),
    },
    {
      key: 'window',
      label: 'بازه رزرو معتبر باشد (باز شدن < بسته شدن < شروع وعده)',
      ok: Number.isFinite(opens) && Number.isFinite(closes) && opens < closes,
    },
  ];
}

export { Flame, Circle, XCircle };
