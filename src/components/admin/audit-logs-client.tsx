'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Database, Clock, User } from 'lucide-react';
import { DataTable, Badge, Field, Select, type Column } from '@/components/ui/data';
import { Dialog } from '@/components/ui/feedback';

export interface AuditItem {
  id: string;
  action: string;
  actorRole: string | null;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

const ACTIONS = [
  'auth:login_success', 'auth:login_failed', 'auth:suspicious_activity',
  'auth:password_changed', 'auth:password_reset', 'student:created', 'student:updated',
  'student:status_changed', 'student:reset_password', 'student:national_code_revealed',
  'staff:created', 'staff:updated', 'staff:credentials_exported',
  'import:previewed', 'import:committed', 'import:undone',
  'user:created', 'user:updated', 'user:deactivated', 'user:activated',
];

const ACTION_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'muted'> = {
  'auth:login_success': 'success',
  'auth:login_failed': 'danger',
  'auth:suspicious_activity': 'warning',
  'import:committed': 'info',
  'import:undone': 'warning',
  'user:deactivated': 'danger',
  'user:activated': 'success',
};

export function AuditLogsClient({
  items, total, page, pageSize, initialQuery,
}: {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
  initialQuery: { action: string; entityType: string };
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AuditItem | null>(null);

  function navigate(next: Record<string, string | number>) {
    const params = new URLSearchParams();
    const merged = { ...initialQuery, page: String(page), ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'ALL') params.set(k, String(v));
    }
    router.push(`/admin/audit-logs?${params.toString()}`);
    router.refresh();
  }

  const columns: Column<AuditItem>[] = [
    { key: 'createdAt', header: 'زمان', width: '150px', render: (r) => <span className="text-[11px]">{r.createdAt}</span> },
    {
      key: 'action',
      header: 'عملیات',
      render: (r) => <Badge variant={ACTION_TONE[r.action] ?? 'muted'}>{r.action}</Badge>,
    },
    {
      key: 'actor',
      header: 'عامل',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <User size={12} className="text-[var(--color-foreground-muted)]" />
          <span className="text-[11px]">{r.actorRole ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'موجودیت',
      hideOnMobile: true,
      render: (r) => (
        <div>
          <p className="text-[11px]">{r.entityType}</p>
          {r.entityId && <p className="font-mono text-[9px] text-[var(--color-foreground-muted)]" dir="ltr">{r.entityId.slice(0, 8)}…</p>}
        </div>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      hideOnMobile: true,
      render: (r) => <span className="font-mono text-[10px]" dir="ltr">{r.ip ?? '—'}</span>,
    },
    {
      key: 'detail',
      header: 'جزئیات',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDetail(r); }}
          className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]"
        >
          مشاهده
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Field label="نوع عملیات" htmlFor="action">
              <Select id="action" value={initialQuery.action} onChange={(e) => navigate({ action: e.target.value, page: 1 })}>
                <option value="ALL">همه عملیات</option>
                {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-52">
            <Field label="نوع موجودیت" htmlFor="entityType">
              <Select id="entityType" value={initialQuery.entityType} onChange={(e) => navigate({ entityType: e.target.value, page: 1 })}>
                <option value="ALL">همه موجودیت‌ها</option>
                <option value="user">user</option>
                <option value="student_profile">student_profile</option>
                <option value="staff_profile">staff_profile</option>
                <option value="import_batch">import_batch</option>
                <option value="login">login</option>
                <option value="session">session</option>
              </Select>
            </Field>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        onRowClick={(r) => setDetail(r)}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => navigate({ page: p })}
        emptyTitle="رویدادی یافت نشد"
        emptyDescription="با فیلترهای دیگری جستجو کنید."
      />

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title="جزئیات رویداد" size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Clock size={13} />, label: 'زمان', value: detail.createdAt },
                { icon: <ShieldCheck size={13} />, label: 'عملیات', value: detail.action },
                { icon: <User size={13} />, label: 'عامل', value: detail.actorRole ?? '—' },
                { icon: <Database size={13} />, label: 'موجودیت', value: `${detail.entityType}${detail.entityId ? ` · ${detail.entityId}` : ''}` },
              ].map((f) => (
                <div key={f.label} className="rounded-lg border border-[var(--color-border-subtle)] px-3.5 py-2.5">
                  <p className="flex items-center gap-1.5 text-[10px] text-[var(--color-foreground-muted)]">{f.icon} {f.label}</p>
                  <p className="mt-1 truncate text-xs font-semibold">{f.value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-[var(--color-foreground-muted)]">پیش از تغییر</p>
              <pre className="max-h-52 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-[10px] leading-relaxed" dir="ltr">
                {detail.before ? JSON.stringify(detail.before, null, 2) : '—'}
              </pre>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-[var(--color-foreground-muted)]">پس از تغییر</p>
              <pre className="max-h-52 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-[10px] leading-relaxed" dir="ltr">
                {detail.after ? JSON.stringify(detail.after, null, 2) : '—'}
              </pre>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
