'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye, EyeOff, KeyRound, UserCheck, UserX, Plus, Download, Filter,
  GraduationCap, Clock, ShieldCheck, X,
} from 'lucide-react';
import { DataTable, Badge, Field, TextInput, Select, type Column } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Drawer, Dialog, ConfirmDialog, useToast, EmptyState } from '@/components/ui/feedback';
import {
  revealNationalCodeAction, resetStudentPasswordAction,
  setStudentStatusAction, saveStudentAction, downloadStudentTemplateAction,
} from '@/server/actions/student-actions';
import type { StudentListItem } from '@/server/dal/data';
import { toPersianDigits, toLatinDigits } from '@/lib/validation';
import { saveAsBase64 } from '@/lib/download';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'همه وضعیت‌ها' },
  { value: 'ACTIVE', label: 'فعال' },
  { value: 'ON_LEAVE', label: 'مرخصی' },
  { value: 'WITHDRAWN', label: 'انصراف' },
  { value: 'GRADUATED', label: 'فارغ‌التحصیل' },
];

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'muted' }> = {
  ACTIVE: { label: 'فعال', variant: 'success' },
  ON_LEAVE: { label: 'مرخصی', variant: 'warning' },
  WITHDRAWN: { label: 'انصراف', variant: 'danger' },
  GRADUATED: { label: 'فارغ‌التحصیل', variant: 'muted' },
};

export function StudentsClient({
  initial, total, page, pageSize, faculties, initialQuery,
}: {
  initial: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
  faculties: string[];
  initialQuery: { q: string; status: string; faculty: string; entryYear: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState(initialQuery.q);
  const [status, setStatus] = useState(initialQuery.status);
  const [faculty, setFaculty] = useState(initialQuery.faculty);
  const [entryYear, setEntryYear] = useState(initialQuery.entryYear);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<StudentListItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentListItem | null>(null);
  const [confirmReset, setConfirmReset] = useState<StudentListItem | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{ items: StudentListItem[]; status: string } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  // الگوی رسمی React: همگام‌سازی state با props در render (بدون useEffect)
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setRows(initial);
  }

  function navigate(next: Record<string, string | number>) {
    const params = new URLSearchParams();
    const merged = { q: query, status, faculty, entryYear, page: String(page), ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'ALL') params.set(k, String(v));
    }
    router.push(`/vice/students?${params.toString()}`);
    startTransition(() => router.refresh());
  }

  const columns: Column<StudentListItem>[] = useMemo(() => [
    {
      key: 'studentNumber',
      header: 'شماره دانشجویی',
      sortable: true,
      render: (r) => <span className="font-mono text-xs tracking-wide" dir="ltr">{r.studentNumber}</span>,
    },
    {
      key: 'name',
      header: 'نام و نام خانوادگی',
      sortable: true,
      render: (r) => (
        <div>
          <p className="text-xs font-semibold">{r.firstName} {r.lastName}</p>
          <p className="text-[10px] text-[var(--color-foreground-muted)]">{r.major ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'nationalCode',
      header: 'کد ملی',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs" dir="ltr">{revealed[r.userId] ?? r.nationalCodeMasked}</span>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (revealed[r.userId]) { setRevealed((p) => { const n = { ...p }; delete n[r.userId]; return n; }); return; }
              const res = await revealNationalCodeAction(r.userId);
              if (res.ok) {
                setRevealed((p) => ({ ...p, [r.userId]: res.nationalCode }));
                toast.push({ kind: 'info', title: 'کد ملی نمایش داده شد', description: 'این نمایش در لاگ رویدادها ثبت شد' });
              } else {
                toast.push({ kind: 'error', title: 'خطا', description: res.error });
              }
            }}
            className="rounded-md p-1 text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-brand-700)]"
            aria-label={revealed[r.userId] ? 'پنهان کردن' : 'نمایش کد ملی'}
          >
            {revealed[r.userId] ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      ),
    },
    {
      key: 'faculty',
      header: 'دانشکده',
      hideOnMobile: true,
      render: (r) => <span className="text-xs text-[var(--color-foreground-muted)]">{r.faculty ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (r) => {
        const s = STATUS_BADGE[r.status] ?? { label: r.status, variant: 'muted' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
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
            onClick={(e) => { e.stopPropagation(); setDetail(r); }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]"
            aria-label="جزئیات"
          >
            <GraduationCap size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmReset(r); }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-amber-50 hover:text-amber-700"
            aria-label="ریست رمز"
          >
            <KeyRound size={14} />
          </button>
        </div>
      ),
    },
  ], [revealed, toast]);

  async function handleRevealFromDrawer(userId: string) {
    const res = await revealNationalCodeAction(userId);
    if (res.ok) {
      setRevealed((p) => ({ ...p, [userId]: res.nationalCode }));
      toast.push({ kind: 'info', title: 'کد ملی نمایش داده شد', description: 'این نمایش در لاگ رویدادها ثبت شد' });
    } else {
      toast.push({ kind: 'error', title: 'خطا', description: res.error });
    }
  }

  return (
    <div>
      {/* فیلترها */}
      <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Field label="جستجو" htmlFor="q">
              <TextInput
                id="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && navigate({ q: query, page: 1 })}
                placeholder="نام، شماره دانشجویی یا کد ملی"
              />
            </Field>
          </div>
          <div className="w-44">
            <Field label="وضعیت" htmlFor="status">
              <Select id="status" value={status} onChange={(e) => navigate({ status: e.target.value, page: 1 })}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-44">
            <Field label="دانشکده" htmlFor="faculty">
              <Select id="faculty" value={faculty} onChange={(e) => navigate({ faculty: e.target.value, page: 1 })}>
                <option value="ALL">همه دانشکده‌ها</option>
                {faculties.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-36">
            <Field label="سال ورود" htmlFor="entryYear">
              <TextInput
                id="entryYear"
                dir="ltr"
                value={entryYear === 'ALL' ? '' : entryYear}
                onChange={(e) => setEntryYear(toLatinDigits(e.target.value))}
                onBlur={() => navigate({ entryYear: entryYear || 'ALL', page: 1 })}
                placeholder="مثلاً 1401"
                className="text-right"
              />
            </Field>
          </div>
          <Button variant="primary" icon={<Filter size={16} />} onClick={() => navigate({ page: 1 })}>
            اعمال فیلتر
          </Button>
        </div>
      </div>

      {/* عملیات گروهی */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-3.5">
          <span className="text-xs font-semibold">
            {toPersianDigits(selected.size)} دانشجو انتخاب شده
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<UserCheck size={14} />}
              onClick={() => setConfirmStatus({ items: rows.filter((r) => selected.has(r.userId)), status: 'ACTIVE' })}>
              فعال‌سازی
            </Button>
            <Button size="sm" variant="secondary" icon={<UserX size={14} />}
              onClick={() => setConfirmStatus({ items: rows.filter((r) => selected.has(r.userId)), status: 'ON_LEAVE' })}>
              مرخصی
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X size={14} /> لغو انتخاب
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2.5">
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setEditing(null); setFormOpen(true); }}>
          افزودن دانشجو
        </Button>
        <Button variant="secondary" icon={<Download size={16} />} onClick={async () => {
          const res = await downloadStudentTemplateAction();
          if (res.ok) saveAsBase64(res.base64, 'قالب-دانشجویان.xlsx');
        }}>
          دانلود قالب نمونه
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.userId}
        onRowClick={(r) => setDetail(r)}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => navigate({ page: p })}
        search={query}
        onSearchChange={(v) => { setQuery(v); }}
        searchPlaceholder="جستجوی سریع…"
        selectedKeys={selected}
        onToggleSelect={(key) => setSelected((prev) => {
          const n = new Set(prev);
          if (n.has(key)) n.delete(key); else n.add(key);
          return n;
        })}
        onToggleSelectAll={() => setSelected((prev) => {
          if (prev.size === rows.length) return new Set();
          return new Set(rows.map((r) => r.userId));
        })}
        emptyTitle="دانشجویی یافت نشد"
        emptyDescription="با فیلترهای دیگری جستجو کنید یا نخستین دانشجو را اضافه کنید."
      />

      {/* دراور جزئیات */}
      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="جزئیات دانشجو"
        footer={detail && (
          <>
            <Button variant="secondary" icon={<KeyRound size={15} />}
              onClick={() => setConfirmReset(detail)}>
              ریست رمز
            </Button>
            <Button variant="ghost" onClick={() => setDetail(null)}>بستن</Button>
          </>
        )}
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-950)] text-lg font-bold text-white">
                {detail.firstName.trim().charAt(0) || 'د'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{detail.firstName} {detail.lastName}</p>
                <p className="mt-0.5 font-mono text-xs text-[var(--color-foreground-muted)]" dir="ltr">{detail.studentNumber}</p>
                <div className="mt-1.5">
                  <Badge variant={STATUS_BADGE[detail.status]?.variant ?? 'muted'}>
                    {STATUS_BADGE[detail.status]?.label ?? detail.status}
                  </Badge>
                </div>
              </div>
            </div>

            <section>
              <h3 className="mb-2.5 text-xs font-bold text-[var(--color-foreground-muted)]">اطلاعات هویتی</h3>
              <dl className="space-y-2">
                {[
                  ['کد ملی', revealed[detail.userId] ?? detail.nationalCodeMasked],
                  ['دانشکده', detail.faculty ?? '—'],
                  ['رشته', detail.major ?? '—'],
                  ['سال ورود', detail.entryYear ? toPersianDigits(detail.entryYear) : '—'],
                  ['موبایل', detail.mobile ?? '—'],
                  ['آخرین ورود', detail.lastLoginAt ?? 'هرگز'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] px-3.5 py-2.5">
                    <dt className="text-xs text-[var(--color-foreground-muted)]">{k}</dt>
                    <dd className="text-xs font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <Button size="sm" variant="outline" className="mt-3" icon={<Eye size={14} />}
                onClick={() => handleRevealFromDrawer(detail.userId)}>
                نمایش کد ملی کامل
              </Button>
            </section>

            <section>
              <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[var(--color-foreground-muted)]">
                <Clock size={13} /> تاریخچه تغییرات
              </h3>
              <div className="space-y-2">
                <div className="rounded-lg border border-[var(--color-border-subtle)] p-3">
                  <p className="text-[11px] text-[var(--color-foreground-muted)]">
                    تاریخچه کامل در صفحه «لاگ رویدادها» برای مدیر ارشد قابل مشاهده است.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </Drawer>

      {/* فرم افزودن/ویرایش */}
      <StudentFormDialog key={`${formOpen}-${editing?.userId ?? "new"}`}
        open={formOpen}
        editing={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          toast.push({ kind: 'success', title: 'اطلاعات با موفقیت ذخیره شد' });
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmReset)}
        onClose={() => setConfirmReset(null)}
        title="ریست رمز دانشجو"
        description={`رمز عبور «${confirmReset?.firstName ?? ''} ${confirmReset?.lastName ?? ''}» به کد ملی بازگردانده می‌شود و همه نشست‌های فعال او باطل خواهد شد. آیا مطمئن هستید؟`}
        confirmLabel="ریست رمز"
        danger
        onConfirm={async () => {
          if (!confirmReset) return;
          const res = await resetStudentPasswordAction(confirmReset.userId);
          setConfirmReset(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'رمز با موفقیت بازنشانی شد', description: 'کاربر در ورود بعدی باید رمز جدید تعیین کند' });
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmStatus)}
        onClose={() => setConfirmStatus(null)}
        title="تغییر وضعیت"
        description={`وضعیت ${toPersianDigits(confirmStatus?.items.length ?? 0)} دانشجو تغییر می‌کند. در صورت غیرفعال شدن، همه نشست‌های آن‌ها باطل می‌شود.`}
        confirmLabel="تأیید تغییر"
        onConfirm={async () => {
          if (!confirmStatus) return;
          const res = await setStudentStatusAction(confirmStatus.items.map((i) => i.userId), confirmStatus.status);
          setConfirmStatus(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'وضعیت با موفقیت تغییر کرد' });
            setSelected(new Set());
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />
    </div>
  );
}

function StudentFormDialog({
  open, editing, onClose, onSaved,
}: {
  open: boolean;
  editing: StudentListItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState({
    studentNumber: editing?.studentNumber ?? '', nationalCode: '', firstName: editing?.firstName ?? '', lastName: editing?.lastName ?? '',
    faculty: editing?.faculty ?? '', major: editing?.major ?? '', entryYear: editing?.entryYear ? String(editing.entryYear) : '', status: editing?.status ?? 'ACTIVE', mobile: editing?.mobile ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);


  function validate() {
    const e: Record<string, string> = {};
    if (!values.studentNumber.trim()) e.studentNumber = 'شماره دانشجویی الزامی است';
    if (!editing && !values.nationalCode.trim()) e.nationalCode = 'کد ملی الزامی است';
    if (!values.firstName.trim()) e.firstName = 'نام الزامی است';
    if (!values.lastName.trim()) e.lastName = 'نام خانوادگی الزامی است';
    if (values.mobile && !/^09\d{9}$/.test(values.mobile.replace(/[^\d]/g, ''))) e.mobile = 'شماره موبایل نامعتبر است';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    const res = await saveStudentAction({
      studentNumber: values.studentNumber,
      nationalCode: values.nationalCode || (editing ? '' : ''),
      firstName: values.firstName,
      lastName: values.lastName,
      faculty: values.faculty || null,
      major: values.major || null,
      entryYear: values.entryYear ? Number.parseInt(values.entryYear, 10) : null,
      status: values.status,
      mobile: values.mobile || null,
    }, editing?.userId);
    setBusy(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'ذخیره ناموفق بود', description: res.error });
      return;
    }
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'ویرایش دانشجو' : 'افزودن دانشجوی جدید'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button loading={busy} onClick={submit}>ذخیره</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="شماره دانشجویی" required error={errors.studentNumber}>
          <TextInput dir="ltr" value={values.studentNumber}
            onChange={(e) => setValues((p) => ({ ...p, studentNumber: e.target.value }))}
            className="text-right" />
        </Field>
        <Field
          label={editing ? 'کد ملی جدید (اختیاری)' : 'کد ملی'}
          required={!editing}
          error={errors.nationalCode}
          hint={editing ? 'در صورت تغییر، رمز کاربر بازنشانی می‌شود' : undefined}
        >
          <TextInput dir="ltr" value={values.nationalCode}
            onChange={(e) => setValues((p) => ({ ...p, nationalCode: e.target.value }))}
            className="text-right" />
        </Field>
        <Field label="نام" required error={errors.firstName}>
          <TextInput value={values.firstName} onChange={(e) => setValues((p) => ({ ...p, firstName: e.target.value }))} />
        </Field>
        <Field label="نام خانوادگی" required error={errors.lastName}>
          <TextInput value={values.lastName} onChange={(e) => setValues((p) => ({ ...p, lastName: e.target.value }))} />
        </Field>
        <Field label="دانشکده">
          <TextInput value={values.faculty} onChange={(e) => setValues((p) => ({ ...p, faculty: e.target.value }))} />
        </Field>
        <Field label="رشته">
          <TextInput value={values.major} onChange={(e) => setValues((p) => ({ ...p, major: e.target.value }))} />
        </Field>
        <Field label="سال ورود">
          <TextInput dir="ltr" value={values.entryYear} className="text-right"
            onChange={(e) => setValues((p) => ({ ...p, entryYear: e.target.value }))} />
        </Field>
        <Field label="وضعیت">
          <Select value={values.status} onChange={(e) => setValues((p) => ({ ...p, status: e.target.value }))}>
            <option value="ACTIVE">فعال</option>
            <option value="ON_LEAVE">مرخصی</option>
            <option value="WITHDRAWN">انصراف</option>
            <option value="GRADUATED">فارغ‌التحصیل</option>
          </Select>
        </Field>
        <Field label="موبایل" error={errors.mobile}>
          <TextInput dir="ltr" value={values.mobile} className="text-right"
            onChange={(e) => setValues((p) => ({ ...p, mobile: e.target.value }))} />
        </Field>
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3.5">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--color-brand-700)]" />
        <p className="text-[11px] leading-loose text-[var(--color-foreground-muted)]">
          کد ملی به‌صورت رمزنگاری‌شده (AES-256-GCM) ذخیره می‌شود و در هیچ نمایی به‌صورت کامل نمایش داده نمی‌شود
          مگر با درخواست صریح شما که در لاگ رویدادها ثبت خواهد شد.
        </p>
      </div>
    </Dialog>
  );
}
