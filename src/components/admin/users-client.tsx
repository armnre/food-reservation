'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, UserX, Search } from 'lucide-react';
import { DataTable, Badge, Field, TextInput, Select, type Column } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, useToast } from '@/components/ui/feedback';
import { toggleUserActiveAction } from '@/server/actions/student-actions';
import { toPersianDigits } from '@/lib/validation';

export interface AdminUserItem {
  id: string;
  username: string;
  displayName: string;
  role: string;
  roleLabel: string;
  isActive: boolean;
  mustChangePassword: boolean;
  mobile: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_OPTIONS = [
  ['ALL', 'همه نقش‌ها'], ['STUDENT', 'دانشجو'], ['STAFF', 'کارمند'],
  ['VICE_STUDENT', 'معاونت دانشجویی'], ['NUTRITION_MANAGER', 'مدیر تغذیه'],
  ['CAFETERIA_OPERATOR', 'کارمند سلف'], ['SUPER_ADMIN', 'مدیر ارشد'],
];

export function UsersClient({
  items, total, page, pageSize, initialQuery,
}: {
  items: AdminUserItem[];
  total: number;
  page: number;
  pageSize: number;
  initialQuery: { q: string; role: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery.q);
  const [role, setRole] = useState(initialQuery.role);
  const [confirmToggle, setConfirmToggle] = useState<AdminUserItem | null>(null);

  function navigate(next: Record<string, string | number>) {
    const params = new URLSearchParams();
    const merged = { ...initialQuery, page: String(page), ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'ALL') params.set(k, String(v));
    }
    router.push(`/admin/users?${params.toString()}`);
    router.refresh();
  }

  const columns: Column<AdminUserItem>[] = [
    {
      key: 'displayName',
      header: 'نام',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-950)] text-[11px] font-bold text-white">
            {r.displayName.trim().charAt(0) || 'ک'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{r.displayName}</p>
            <p className="font-mono text-[10px] text-[var(--color-foreground-muted)]" dir="ltr">{r.username}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'نقش', render: (r) => <Badge variant="info">{r.roleLabel}</Badge> },
    {
      key: 'status',
      header: 'وضعیت',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'فعال' : 'غیرفعال'}</Badge>
          {r.mustChangePassword && <Badge variant="warning">تعویض رمز اجباری</Badge>}
        </div>
      ),
    },
    { key: 'lastLoginAt', header: 'آخرین ورود', hideOnMobile: true, render: (r) => <span className="text-[11px] text-[var(--color-foreground-muted)]">{r.lastLoginAt ?? 'هرگز'}</span> },
    {
      key: 'actions',
      header: 'عملیات',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmToggle(r); }}
          className={`rounded-lg border p-1.5 transition-colors ${
            r.isActive
              ? 'border-[var(--color-border)] text-[var(--color-foreground-muted)] hover:bg-rose-50 hover:text-rose-600'
              : 'border-[var(--color-border)] text-[var(--color-foreground-muted)] hover:bg-emerald-50 hover:text-emerald-600'
          }`}
          aria-label={r.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
        >
          {r.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Field label="جستجو" htmlFor="uq">
              <TextInput id="uq" value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && navigate({ q: query, page: 1 })}
                placeholder="نام یا نام کاربری" />
            </Field>
          </div>
          <div className="w-52">
            <Field label="نقش" htmlFor="urole">
              <Select id="urole" value={role} onChange={(e) => navigate({ role: e.target.value, page: 1 })}>
                {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
          <Button variant="primary" icon={<Search size={16} />} onClick={() => navigate({ page: 1 })}>
            اعمال فیلتر
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => navigate({ page: p })}
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="جستجو…"
        emptyTitle="کاربری یافت نشد"
        emptyDescription="فیلترها را تغییر دهید."
      />

      <ConfirmDialog
        open={Boolean(confirmToggle)}
        onClose={() => setConfirmToggle(null)}
        title={confirmToggle?.isActive ? 'غیرفعال‌سازی حساب' : 'فعال‌سازی حساب'}
        description={
          confirmToggle?.isActive
            ? `حساب «${confirmToggle?.displayName}» غیرفعال می‌شود و همه نشست‌های او باطل خواهد شد.`
            : `حساب «${confirmToggle?.displayName}» دوباره فعال می‌شود.`
        }
        confirmLabel={confirmToggle?.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
        danger={confirmToggle?.isActive}
        onConfirm={async () => {
          if (!confirmToggle) return;
          const res = await toggleUserActiveAction(confirmToggle.id, !confirmToggle.isActive);
          setConfirmToggle(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'تغییر وضعیت انجام شد' });
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />
    </div>
  );
}

export { toPersianDigits };
