'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Field, TextInput, Switch } from '@/components/ui/data';
import { Dialog, useToast, EmptyState, ConfirmDialog } from '@/components/ui/feedback';
import { upsertMealSlotAction } from '@/server/actions/menu-actions';
import { toPersianDigits } from '@/lib/validation';

export interface SlotItem {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

function hhmm(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SlotsClient({ slots }: { slots: SlotItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SlotItem | null>(null);
  const [values, setValues] = useState({ name: '', startTime: '12:00', endTime: '14:00' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openForm(slot: SlotItem | null) {
    setEditing(slot);
    setValues({
      name: slot?.name ?? '',
      startTime: slot ? hhmm(slot.startTime) : '12:00',
      endTime: slot ? hhmm(slot.endTime) : '14:00',
    });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (!values.name.trim()) {
      setError('نام وعده الزامی است');
      return;
    }
    setBusy(true);
    const res = await upsertMealSlotAction({
      id: editing?.id,
      name: values.name,
      startTime: new Date(`1970-01-01T${values.startTime}:00`).toISOString(),
      endTime: new Date(`1970-01-01T${values.endTime}:00`).toISOString(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    toast.push({ kind: 'success', title: 'وعده ذخیره شد' });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5">
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => openForm(null)}>
          افزودن وعده
        </Button>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <EmptyState
            title="هنوز وعده‌ای تعریف نشده"
            description="حداقل دو وعده «ناهار» و «شام» بسازید تا برنامه هفتگی قابل چیدمان باشد."
            action={
              <Button onClick={() => openForm(null)} icon={<Plus size={16} />}>
                افزودن وعده
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((s) => (
            <article
              key={s.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]"
            >
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
                  <Clock size={19} />
                </div>
                <Badge variant={s.isActive ? 'success' : 'muted'}>{s.isActive ? 'فعال' : 'غیرفعال'}</Badge>
              </div>

              <h3 className="mt-3 text-sm font-bold">{s.name}</h3>
              <p className="mt-1.5 font-mono text-xs text-[var(--color-foreground-muted)]" dir="ltr">
                {hhmm(s.startTime)} — {hhmm(s.endTime)}
              </p>

              <Button
                size="sm"
                variant="secondary"
                className="mt-4"
                icon={<Pencil size={13} />}
                onClick={() => openForm(s)}
              >
                ویرایش
              </Button>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'ویرایش وعده' : 'افزودن وعده'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button loading={busy} onClick={submit}>
              ذخیره
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="نام وعده" required error={error}>
            <TextInput
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              placeholder="مثلاً ناهار"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ساعت شروع" required>
              <TextInput
                type="time"
                dir="ltr"
                value={values.startTime}
                className="text-right"
                onChange={(e) => setValues((p) => ({ ...p, startTime: e.target.value }))}
              />
            </Field>
            <Field label="ساعت پایان" required>
              <TextInput
                type="time"
                dir="ltr"
                value={values.endTime}
                className="text-right"
                onChange={(e) => setValues((p) => ({ ...p, endTime: e.target.value }))}
              />
            </Field>
          </div>
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-[11px] leading-loose text-[var(--color-foreground-muted)]">
            بازه رزرو هر منو باید قبل از ساعت شروع همان وعده بسته شود.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

export { ConfirmDialog, toPersianDigits, Switch };
