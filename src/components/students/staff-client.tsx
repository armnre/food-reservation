'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, KeyRound, UserCheck, UserX, Download, Copy, ClipboardCheck, Users } from 'lucide-react';
import { DataTable, Badge, Field, TextInput, Select, type Column } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog, useToast, EmptyState } from '@/components/ui/feedback';
import {
  createStaffAction, updateStaffAction, toggleUserActiveAction,
  resetStaffPasswordAction, exportCredentialsAction,
} from '@/server/actions/student-actions';
import { saveAsBase64 } from '@/lib/download';
import { toPersianDigits } from '@/lib/validation';

export interface StaffItem {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  mobile: string | null;
  lastLoginAt: string | null;
  kind: string;
  department: string | null;
  employerNote: string | null;
}

const KIND_LABEL: Record<string, string> = {
  EMPLOYEE: 'کارمند',
  FACULTY: 'هیئت‌علمی',
  CONTRACTOR: 'پیمانکار',
  CAFETERIA: 'کارمند سلف',
};

export function StaffClient({
  items, total, page, pageSize, initialQuery, canCreate,
}: {
  items: StaffItem[];
  total: number;
  page: number;
  pageSize: number;
  initialQuery: { q: string; kind: string };
  canCreate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery.q);
  const [kind, setKind] = useState(initialQuery.kind);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffItem | null>(null);
  const [credential, setCredential] = useState<{ username: string; password: string } | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<StaffItem | null>(null);
  const [confirmReset, setConfirmReset] = useState<StaffItem | null>(null);

  function navigate(next: Record<string, string | number>) {
    const params = new URLSearchParams();
    const merged = { q: query, kind, page: String(page), ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'ALL') params.set(k, String(v));
    }
    router.push(`/vice/staff?${params.toString()}`);
    router.refresh();
  }

  const columns: Column<StaffItem>[] = [
    {
      key: 'displayName',
      header: 'نام و نام خانوادگی',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-950)] text-[11px] font-bold text-white">
            {r.displayName.trim().charAt(0) || 'ک'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{r.displayName}</p>
            <p className="text-[10px] text-[var(--color-foreground-muted)]">{r.department ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'username', header: 'نام کاربری', render: (r) => <span className="font-mono text-xs" dir="ltr">{r.username}</span> },
    {
      key: 'kind',
      header: 'نوع',
      render: (r) => <Badge variant="muted">{KIND_LABEL[r.kind] ?? r.kind}</Badge>,
    },
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
    {
      key: 'lastLogin',
      header: 'آخرین ورود',
      hideOnMobile: true,
      render: (r) => <span className="text-[11px] text-[var(--color-foreground-muted)]">{r.lastLoginAt ?? 'هرگز'}</span>,
    },
    {
      key: 'actions',
      header: 'عملیات',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(r); setFormOpen(true); }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]"
            aria-label="ویرایش"
          >
            <Users size={14} />
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const res = await resetStaffPasswordAction(r.userId);
              if (res.ok) {
                setCredential({ username: r.username, password: res.temporary });
                toast.push({ kind: 'info', title: 'رمز موقت تولید شد', description: 'این رمز فقط یک بار نمایش داده می‌شود' });
              } else {
                toast.push({ kind: 'error', title: 'خطا', description: res.error });
              }
            }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-amber-50 hover:text-amber-700"
            aria-label="ریست رمز"
          >
            <KeyRound size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmToggle(r); }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-rose-50 hover:text-rose-600"
            aria-label={r.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
          >
            {r.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Field label="جستجو" htmlFor="sq">
              <TextInput
                id="sq"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && navigate({ q: query, page: 1 })}
                placeholder="نام یا نام کاربری"
              />
            </Field>
          </div>
          <div className="w-48">
            <Field label="نوع" htmlFor="kind">
              <Select id="kind" value={kind} onChange={(e) => navigate({ kind: e.target.value, page: 1 })}>
                <option value="ALL">همه انواع</option>
                <option value="EMPLOYEE">کارمند</option>
                <option value="FACULTY">هیئت‌علمی</option>
                <option value="CONTRACTOR">پیمانکار</option>
                <option value="CAFETERIA">کارمند سلف</option>
              </Select>
            </Field>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        {canCreate && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            افزودن کارمند
          </Button>
        )}
        <Button
          variant="secondary"
          icon={<Download size={16} />}
          disabled={selected.size === 0}
          onClick={async () => {
            const res = await exportCredentialsAction([...selected]);
            if (res.ok) {
              saveAsBase64(res.base64, 'اعتبارنامه‌ها.xlsx');
              toast.push({ kind: 'success', title: 'فایل اعتبارنامه‌ها دانلود شد', description: 'این رمزها دیگر در هیچ جایی ذخیره نمی‌شوند' });
              setSelected(new Set());
              router.refresh();
            } else {
              toast.push({ kind: 'error', title: 'خطا', description: res.error });
            }
          }}
        >
          خروجی اعتبارنامه انتخاب‌شده‌ها
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.userId}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => navigate({ page: p })}
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="جستجو…"
        selectedKeys={selected}
        onToggleSelect={(key) => setSelected((prev) => {
          const n = new Set(prev);
          if (n.has(key)) n.delete(key); else n.add(key);
          return n;
        })}
        onToggleSelectAll={() => setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.userId))))}
        emptyTitle="کارمندی یافت نشد"
        emptyDescription="نخستین کارمند را اضافه کنید یا فیلترها را تغییر دهید."
      />

      <StaffFormDialog
        open={formOpen}
        editing={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onCreated={(cred) => {
          setFormOpen(false);
          setEditing(null);
          if (cred) setCredential(cred);
          router.refresh();
        }}
      />

      <Dialog
        open={Boolean(credential)}
        onClose={() => setCredential(null)}
        title="اعتبارنامه موقت"
        size="sm"
        footer={
          <>
            <Button variant="secondary" icon={<Copy size={15} />} onClick={() => {
              navigator.clipboard?.writeText(`${credential?.username}\n${credential?.password}`);
              toast.push({ kind: 'success', title: 'در کلیپ‌بورد کپی شد' });
            }}>
              کپی
            </Button>
            <Button onClick={() => setCredential(null)}>متوجه شدم</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <ClipboardCheck size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[11px] leading-loose text-amber-800">
              این رمز فقط همین یک بار نمایش داده می‌شود و در هیچ‌جای سامانه ذخیره نمی‌شود. آن را در جای امنی نگه دارید.
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-foreground-muted)]">نام کاربری</p>
            <p className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 px-3.5 py-2.5 font-mono text-sm" dir="ltr">
              {credential?.username}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-foreground-muted)]">رمز موقت</p>
            <p className="mt-1 rounded-lg border border-[var(--color-accent-200)] bg-[var(--color-accent-50)] px-3.5 py-2.5 font-mono text-sm font-bold tracking-widest text-[var(--color-accent-900)]" dir="ltr">
              {credential?.password}
            </p>
          </div>
        </div>
      </Dialog>

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
          const res = await toggleUserActiveAction(confirmToggle.userId, !confirmToggle.isActive);
          setConfirmToggle(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'تغییر وضعیت انجام شد' });
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmReset)}
        onClose={() => setConfirmReset(null)}
        title="ریست رمز"
        description="رمز موقت جدیدی تولید می‌شود."
        confirmLabel="تأیید"
        onConfirm={async () => {
          if (!confirmReset) return;
          const res = await resetStaffPasswordAction(confirmReset.userId);
          setConfirmReset(null);
          if (res.ok) setCredential({ username: confirmReset.username, password: res.temporary });
        }}
      />
    </div>
  );
}

function StaffFormDialog({
  open, editing, onClose, onCreated,
}: {
  open: boolean;
  editing: StaffItem | null;
  onClose: () => void;
  onCreated: (cred: { username: string; password: string } | null) => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState({
    username: '', firstName: '', lastName: '', kind: 'EMPLOYEE',
    department: '', nationalCode: '', mobile: '', employerNote: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (open) {
      const parts = (editing?.displayName ?? '').split(' ');
      setValues({
        username: editing?.username ?? '',
        firstName: parts[0] ?? '',
        lastName: parts.slice(1).join(' '),
        kind: editing?.kind ?? 'EMPLOYEE',
        department: editing?.department ?? '',
        nationalCode: '',
        mobile: editing?.mobile ?? '',
        employerNote: editing?.employerNote ?? '',
      });
      setErrors({});
    }
  }, [open, editing]);

  async function submit() {
    const e: Record<string, string> = {};
    if (!editing && !values.username.trim()) e.username = 'نام کاربری الزامی است';
    if (!values.firstName.trim()) e.firstName = 'نام الزامی است';
    if (!values.lastName.trim()) e.lastName = 'نام خانوادگی الزامی است';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setBusy(true);
    if (editing) {
      const res = await updateStaffAction(editing.userId, {
        firstName: values.firstName, lastName: values.lastName,
        kind: values.kind, department: values.department,
        mobile: values.mobile || null, employerNote: values.employerNote || null,
      });
      setBusy(false);
      if (!res.ok) {
        toast.push({ kind: 'error', title: 'ذخیره ناموفق بود', description: res.error });
        return;
      }
      toast.push({ kind: 'success', title: 'اطلاعات به‌روزرسانی شد' });
      onCreated(null);
      return;
    }

    const res = await createStaffAction({
      username: values.username, firstName: values.firstName, lastName: values.lastName,
      kind: values.kind, department: values.department || null,
      nationalCode: values.nationalCode || null, mobile: values.mobile || null,
      employerNote: values.employerNote || null,
    });
    setBusy(false);

    if (!res.ok) {
      toast.push({ kind: 'error', title: 'ذخیره ناموفق بود', description: res.error });
      return;
    }
    toast.push({ kind: 'success', title: 'کارمند ایجاد شد' });
    onCreated({ username: res.username, password: res.temporary });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'ویرایش کارمند' : 'افزودن کارمند جدید'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button loading={busy} onClick={submit}>{editing ? 'ذخیره تغییرات' : 'ایجاد حساب'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!editing && (
          <Field label="نام کاربری" required error={errors.username}>
            <TextInput dir="ltr" value={values.username} className="text-right"
              onChange={(e) => setValues((p) => ({ ...p, username: e.target.value }))} />
          </Field>
        )}
        <Field label="نام" required error={errors.firstName}>
          <TextInput value={values.firstName} onChange={(e) => setValues((p) => ({ ...p, firstName: e.target.value }))} />
        </Field>
        <Field label="نام خانوادگی" required error={errors.lastName}>
          <TextInput value={values.lastName} onChange={(e) => setValues((p) => ({ ...p, lastName: e.target.value }))} />
        </Field>
        <Field label="نوع">
          <Select value={values.kind} onChange={(e) => setValues((p) => ({ ...p, kind: e.target.value }))}>
            <option value="EMPLOYEE">کارمند</option>
            <option value="FACULTY">هیئت‌علمی</option>
            <option value="CONTRACTOR">پیمانکار</option>
            <option value="CAFETERIA">کارمند سلف</option>
          </Select>
        </Field>
        <Field label="واحد / گروه">
          <TextInput value={values.department} onChange={(e) => setValues((p) => ({ ...p, department: e.target.value }))} />
        </Field>
        <Field label="کد ملی (اختیاری)">
          <TextInput dir="ltr" value={values.nationalCode} className="text-right"
            onChange={(e) => setValues((p) => ({ ...p, nationalCode: e.target.value }))} />
        </Field>
        <Field label="موبایل (اختیاری)">
          <TextInput dir="ltr" value={values.mobile} className="text-right"
            onChange={(e) => setValues((p) => ({ ...p, mobile: e.target.value }))} />
        </Field>
      </div>
      {!editing && (
        <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3.5">
          <p className="text-[11px] leading-loose text-[var(--color-foreground-muted)]">
            رمز اولیه به‌صورت خودکار تولید و با argon2 هش می‌شود. پس از ایجاد، فقط یک بار نمایش داده خواهد شد.
          </p>
        </div>
      )}
    </Dialog>
  );
}

export { EmptyState, toPersianDigits };
