'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Undo2,
  FileSpreadsheet,
  Eye,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { DataTable, Badge, type Column } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog, useToast, EmptyState, TableSkeleton } from '@/components/ui/feedback';
import { undoImportAction, undoLastImportAction } from '@/server/actions/student-actions';
import { toPersianDigits } from '@/lib/validation';

export interface ImportBatchDto {
  id: string;
  kind: string;
  fileName: string;
  status: string;
  recordCount: number;
  createdCount: number;
  updatedCount: number;
  rejectedCount: number;
  deactivatedCount: number;
  createdAt: string;
  undoneAt: string | null;
}

const STATUS_META: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted'; icon: React.ReactNode }
> = {
  COMPLETED: { label: 'تکمیل‌شده', variant: 'success', icon: <CheckCircle2 size={12} /> },
  PROCESSING: { label: 'در حال پردازش', variant: 'info', icon: <RefreshCw size={12} /> },
  PENDING: { label: 'در انتظار', variant: 'muted', icon: <Clock size={12} /> },
  FAILED: { label: 'ناموفق', variant: 'danger', icon: <XCircle size={12} /> },
  UNDONE: { label: 'بازگردانی‌شده', variant: 'warning', icon: <Undo2 size={12} /> },
};

export function ImportsClient({ items }: { items: ImportBatchDto[] }) {
  const router = useRouter();
  const toast = useToast();
  const [detail, setDetail] = useState<ImportBatchDto | null>(null);
  const [confirmUndo, setConfirmUndo] = useState<ImportBatchDto | null>(null);
  const [confirmLast, setConfirmLast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading] = useState(false);

  const columns: Column<ImportBatchDto>[] = [
    {
      key: 'fileName',
      header: 'نام فایل',
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            <FileSpreadsheet size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{r.fileName}</p>
            <p className="text-[10px] text-[var(--color-foreground-muted)]">
              {r.kind === 'STAFF' ? 'کارکنان' : 'دانشجویان'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'تاریخ ثبت',
      render: (r) => <span className="text-[11px]">{r.createdAt}</span>,
    },
    {
      key: 'counts',
      header: 'نتیجه',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="success">جدید {toPersianDigits(r.createdCount)}</Badge>
          <Badge variant="info">به‌روز {toPersianDigits(r.updatedCount)}</Badge>
          {r.rejectedCount > 0 && <Badge variant="danger">ردشده {toPersianDigits(r.rejectedCount)}</Badge>}
          {r.deactivatedCount > 0 && (
            <Badge variant="warning">غیرفعال {toPersianDigits(r.deactivatedCount)}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (r) => {
        const m = STATUS_META[r.status] ?? STATUS_META.PENDING;
        return (
          <Badge variant={m.variant}>
            {m.icon} {m.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'عملیات',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetail(r);
            }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]"
            aria-label="جزئیات"
          >
            <Eye size={14} />
          </button>
          {r.status === 'COMPLETED' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmUndo(r);
              }}
              className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-amber-50 hover:text-amber-700"
              aria-label="بازگردانی"
            >
              <Undo2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <Button
          variant="secondary"
          icon={<Undo2 size={16} />}
          onClick={() => setConfirmLast(true)}
          disabled={items.length === 0}
        >
          بازگردانی آخرین ایمپورت
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <TableSkeleton rows={5} cols={5} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <EmptyState
            title="هنوز ایمپورتی انجام نشده است"
            description="نخستین فایل اکسل دانشجویان را بارگذاری کنید تا تاریخچه اینجا نمایش داده شود."
            action={<Button onClick={() => router.push('/vice/import')}>شروع ایمپورت</Button>}
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          onRowClick={(r) => setDetail(r)}
          emptyTitle="موردی یافت نشد"
          emptyDescription="هنوز عملیات ایمپورتی ثبت نشده است."
        />
      )}

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title="جزئیات ایمپورت">
        {detail && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
              <p className="text-xs text-[var(--color-foreground-muted)]">نام فایل</p>
              <p className="mt-1 text-sm font-semibold">{detail.fileName}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ['کل ردیف‌ها', detail.recordCount],
                ['جدید', detail.createdCount],
                ['به‌روزرسانی', detail.updatedCount],
                ['ردشده', detail.rejectedCount],
                ['غیرفعال‌شده', detail.deactivatedCount],
                ['تاریخ ثبت', detail.createdAt],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="rounded-lg border border-[var(--color-border-subtle)] px-3.5 py-2.5"
                >
                  <dt className="text-[11px] text-[var(--color-foreground-muted)]">{k}</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {typeof v === 'number' ? toPersianDigits(v) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
            {detail.undoneAt && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-[11px] leading-loose text-amber-800">
                  این ایمپورت در تاریخ {detail.undoneAt} بازگردانی شده است.
                </p>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmUndo)}
        onClose={() => setConfirmUndo(null)}
        title="بازگردانی ایمپورت"
        description="فقط رکوردهای جدید این ایمپورت که هنوز هیچ ورود یا فعالیتی ندارند حذف نرم می‌شوند. رکوردهای به‌روزشده باقی می‌مانند."
        confirmLabel="بازگردانی"
        danger
        onConfirm={async () => {
          if (!confirmUndo) return;
          setBusy(true);
          const res = await undoImportAction(confirmUndo.id);
          setBusy(false);
          setConfirmUndo(null);
          if (res.ok) {
            toast.push({
              kind: 'success',
              title: 'بازگردانی انجام شد',
              description: `${toPersianDigits(res.result.undone)} رکورد بازگردانی شد`,
            });
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />

      <ConfirmDialog
        open={confirmLast}
        onClose={() => setConfirmLast(false)}
        title="بازگردانی آخرین ایمپورت"
        description="آخرین ایمپورت تکمیل‌شده بازگردانی می‌شود. فقط رکوردهای جدید بدون فعالیت حذف نرم می‌شوند."
        confirmLabel="بازگردانی"
        danger
        onConfirm={async () => {
          setBusy(true);
          const res = await undoLastImportAction();
          setBusy(false);
          setConfirmLast(false);
          if (res.ok) {
            toast.push({
              kind: 'success',
              title: 'بازگردانی انجام شد',
              description: `${toPersianDigits(res.result.undone)} رکورد بازگردانی شد`,
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
