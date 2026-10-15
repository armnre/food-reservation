'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Clock, ArrowDownToLine } from 'lucide-react';
import { DataTable, Badge, Field, Select, type Column } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, useToast } from '@/components/ui/feedback';
import { approveWithdrawalAction, rejectWithdrawalAction } from '@/server/actions/admin-actions';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';

export interface WithdrawalItem {
  id: string;
  amountRials: number;
  status: string;
  createdAt: string;
  userName: string;
  userUsername: string;
}

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'muted' | 'info' }> = {
  PENDING: { label: 'در انتظار', variant: 'warning' },
  APPROVED: { label: 'تأییدشده', variant: 'success' },
  REJECTED: { label: 'رد شده', variant: 'danger' },
  COMPLETED: { label: 'پرداخت‌شده', variant: 'info' },
};

export function WithdrawalsClient({
  items, initialStatus,
}: {
  items: WithdrawalItem[];
  initialStatus: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [confirmApprove, setConfirmApprove] = useState<WithdrawalItem | null>(null);
  const [confirmReject, setConfirmReject] = useState<WithdrawalItem | null>(null);
  const [busy, setBusy] = useState(false);

  function navigate(next: string) {
    const params = new URLSearchParams();
    if (next !== 'ALL') params.set('status', next);
    router.push(`/admin/withdrawals?${params.toString()}`);
    router.refresh();
  }

  const columns: Column<WithdrawalItem>[] = [
    {
      key: 'user',
      header: 'کاربر',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-950)] text-[11px] font-bold text-white">
            {r.userName.trim().charAt(0) || 'ک'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{r.userName}</p>
            <p className="font-mono text-[10px] text-[var(--color-foreground-muted)]" dir="ltr">{r.userUsername}</p>
          </div>
        </div>
      ),
    },
    { key: 'amount', header: 'مبلغ', render: (r) => <span className="font-bold tabular-nums">{formatToman(r.amountRials)}</span> },
    { key: 'createdAt', header: 'تاریخ درخواست', render: (r) => <span className="text-[11px] text-[var(--color-foreground-muted)]">{r.createdAt}</span> },
    {
      key: 'status',
      header: 'وضعیت',
      render: (r) => {
        const m = STATUS_META[r.status] ?? STATUS_META.PENDING;
        return <Badge variant={m.variant}>{m.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'عملیات',
      render: (r) => (
        r.status === 'PENDING' ? (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmApprove(r); }}
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-600 transition-colors hover:bg-emerald-100"
              aria-label="تأیید"
            >
              <CheckCircle2 size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmReject(r); }}
              className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-500 transition-colors hover:bg-rose-100"
              aria-label="رد"
            >
              <XCircle size={14} />
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-[var(--color-foreground-muted)]">—</span>
        )
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="w-52">
          <Field label="وضعیت" htmlFor="wstatus">
            <Select id="wstatus" value={status} onChange={(e) => { setStatus(e.target.value); navigate(e.target.value); }}>
              <option value="ALL">همه</option>
              <option value="PENDING">در انتظار</option>
              <option value="APPROVED">تأییدشده</option>
              <option value="REJECTED">رد شده</option>
            </Select>
          </Field>
        </div>
        <div className="mr-auto flex gap-4 text-xs">
          <span className="flex items-center gap-1.5"><Clock size={13} className="text-amber-500" /> {toPersianDigits(items.filter((i) => i.status === 'PENDING').length)} در انتظار</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-500" /> {toPersianDigits(items.filter((i) => i.status === 'APPROVED').length)} تأییدشده</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        emptyTitle="درخواستی یافت نشد"
        emptyDescription="در حال حاضر درخواست برداشتی ثبت نشده است."
      />

      <ConfirmDialog
        open={Boolean(confirmApprove)}
        onClose={() => setConfirmApprove(null)}
        title="تأیید درخواست برداشت"
        description={`مبلغ ${confirmApprove ? formatToman(confirmApprove.amountRials) : ''} برای «${confirmApprove?.userName ?? ''}» پرداخت خواهد شد. آیا مطمئن هستید؟`}
        confirmLabel="تأیید پرداخت"
        onConfirm={async () => {
          if (!confirmApprove) return;
          setBusy(true);
          const res = await approveWithdrawalAction(confirmApprove.id);
          setBusy(false);
          setConfirmApprove(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'درخواست تأیید شد' });
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmReject)}
        onClose={() => setConfirmReject(null)}
        title="رد درخواست برداشت"
        description={`مبلغ ${confirmReject ? formatToman(confirmReject.amountRials) : ''} به کیف پول «${confirmReject?.userName ?? ''}» بازگردانده می‌شود.`}
        confirmLabel="رد درخواست"
        danger
        onConfirm={async () => {
          if (!confirmReject) return;
          setBusy(true);
          const res = await rejectWithdrawalAction(confirmReject.id);
          setBusy(false);
          setConfirmReject(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'درخواست رد شد', description: 'مبلغ به کیف پول کاربر بازگردانده شد' });
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />
    </div>
  );
}

export { ArrowDownToLine };
