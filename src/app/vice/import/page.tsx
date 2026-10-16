'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Download,
  Trash2,
  ShieldCheck,
  Table2,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Field, Select, Switch, TextInput } from '@/components/ui/data';
import { Progress, ConfirmDialog, useToast, EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/layout/app-shell';
import {
  previewStudentImportAction,
  commitStudentImportAction,
  downloadStudentTemplateAction,
  downloadErrorReportAction,
  type PreviewDto,
  type PreviewRowDto,
} from '@/server/actions/student-actions';
import { saveAsBase64, fileToBase64 } from '@/lib/download';
import { toPersianDigits } from '@/lib/validation';

type Step = 0 | 1 | 2 | 3;

const STEPS = [
  { title: 'آپلود فایل', subtitle: 'انتخاب فایل اکسل دانشجویان', icon: <UploadCloud size={17} /> },
  { title: 'نگاشت ستون‌ها', subtitle: 'تطبیق ستون‌های فایل با فیلدها', icon: <Table2 size={17} /> },
  { title: 'پیش‌نمایش و اعتبارسنجی', subtitle: 'بررسی ردیف‌ها و رفع خطاها', icon: <ShieldCheck size={17} /> },
  { title: 'ثبت نهایی', subtitle: 'اعمال تغییرات در پایگاه داده', icon: <CheckCircle2 size={17} /> },
];

const FIELD_OPTIONS = [
  { value: '', label: '— نادیده گرفته شود —' },
  { value: 'studentNumber', label: 'شماره دانشجویی' },
  { value: 'nationalCode', label: 'کد ملی' },
  { value: 'firstName', label: 'نام' },
  { value: 'lastName', label: 'نام خانوادگی' },
  { value: 'faculty', label: 'دانشکده' },
  { value: 'major', label: 'رشته' },
  { value: 'entryYear', label: 'سال ورود' },
  { value: 'status', label: 'وضعیت' },
  { value: 'mobile', label: 'موبایل' },
];

const KIND_BADGE: Record<
  string,
  { label: string; variant: 'success' | 'info' | 'warning' | 'danger'; icon: React.ReactNode }
> = {
  NEW: { label: 'جدید', variant: 'success', icon: <CheckCircle2 size={12} /> },
  UPDATE: { label: 'به‌روزرسانی', variant: 'info', icon: <RefreshCw size={12} /> },
  CONFLICT: { label: 'تعارض', variant: 'warning', icon: <AlertTriangle size={12} /> },
  ERROR: { label: 'خطا', variant: 'danger', icon: <XCircle size={12} /> },
};

export default function ImportPage() {
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(0);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [columnMap, setColumnMap] = useState<Record<number, string | null>>({});
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    deactivated: number;
  } | null>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setError('فقط فایل اکسل با پسوند .xlsx پذیرفته می‌شود');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('حجم فایل نباید بیشتر از ۵ مگابایت باشد');
      return;
    }
    setFile(f);
    setError(null);
    setLoading(true);
    try {
      const base64 = await fileToBase64(f);
      const res = await previewStudentImportAction({ fileName: f.name, base64 });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
      setColumnMap(res.preview.suggestedMap);
      setStep(1);
    } catch {
      setLoading(false);
      setError('خواندن فایل ممکن نشد');
    }
  }, []);

  async function revalidate() {
    if (!file) return;
    setLoading(true);
    const base64 = await fileToBase64(file);
    const res = await previewStudentImportAction({ fileName: file.name, base64, columnMap });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPreview(res.preview);
    setStep(2);
  }

  async function doCommit() {
    if (!preview) return;
    setConfirmCommit(false);
    setStep(3);
    setProgress(8);
    const timer = window.setInterval(() => setProgress((p) => Math.min(p + 6, 92)), 160);

    const res = await commitStudentImportAction({
      batchKey: preview.batchKey,
      fileName: preview.fileName,
      overrides,
      deactivateMissing,
    });

    window.clearInterval(timer);
    if (!res.ok) {
      setProgress(0);
      setError(res.error);
      toast.push({ kind: 'error', title: 'ثبت ناموفق بود', description: res.error });
      setStep(2);
      return;
    }
    setProgress(100);
    setResult(res.result);
    toast.push({
      kind: 'success',
      title: 'اطلاعات با موفقیت ثبت شد',
      description: `${toPersianDigits(res.result.created)} جدید، ${toPersianDigits(res.result.updated)} به‌روزرسانی`,
    });
    router.refresh();
  }

  const visibleRows = preview
    ? onlyErrors
      ? preview.rows.filter((r) => r.kind === 'ERROR' || r.kind === 'CONFLICT')
      : preview.rows
    : [];

  return (
    <div>
      <PageHeader
        title="ایمپورت دانشجویان از اکسل"
        description="بارگذاری، نگاشت ستون‌ها، اعتبارسنجی و ثبت گروهی اطلاعات دانشجویان"
      />

      {/* Stepper */}
      <div className="mb-6 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]">
        <div className="flex flex-col gap-0 md:flex-row">
          {STEPS.map((s, i) => {
            const done = step > i;
            const active = step === i;
            return (
              <div
                key={s.title}
                className={`relative flex flex-1 items-center gap-3 px-5 py-4 transition-colors ${
                  active ? 'bg-[var(--color-brand-50)]/70' : done ? 'bg-transparent' : 'opacity-55'
                }`}
              >
                {i > 0 && (
                  <div className="absolute right-0 top-0 hidden h-full w-px bg-[var(--color-border)] md:block" />
                )}
                <div
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${
                    done
                      ? 'bg-emerald-500 text-white'
                      : active
                        ? 'bg-[var(--color-brand-950)] text-white shadow-[0_4px_12px_rgba(58,45,125,0.35)]'
                        : 'bg-[var(--color-muted)] text-[var(--color-foreground-muted)]'
                  }`}
                >
                  {done ? <CheckCircle2 size={16} /> : s.icon}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    <span className="ml-1 text-[var(--color-foreground-muted)]">
                      {toPersianDigits(i + 1)}.
                    </span>
                    {s.title}
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-foreground-muted)]">{s.subtitle}</p>
                </div>
                {active && (
                  <motion.div
                    layoutId="step-bar"
                    className="absolute inset-x-0 bottom-0 h-[2.5px] bg-gradient-to-l from-[var(--color-brand-700)] to-[var(--color-accent-500)]"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {/* ── گام ۱ ── */}
          {step === 0 && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className={`flex min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
                    dragging
                      ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-50)] scale-[1.005]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-brand-300)]'
                  }`}
                >
                  <div className="relative mb-5 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-100)] to-[var(--color-brand-200)] text-[var(--color-brand-800)]">
                    <UploadCloud size={32} />
                    <motion.span
                      animate={reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.35, 0.7, 0.35] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 rounded-2xl border border-[var(--color-brand-300)]"
                    />
                  </div>
                  <h2 className="text-lg font-bold">فایل اکسل را اینجا رها کنید</h2>
                  <p className="mt-2 max-w-sm text-sm leading-loose text-[var(--color-foreground-muted)]">
                    یا از دکمه زیر استفاده کنید. فرمت مجاز <span className="font-semibold">.xlsx</span> با
                    حداکثر {toPersianDigits(10000)} ردیف و {toPersianDigits(5)} مگابایت.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    <Button icon={<FileSpreadsheet size={16} />} onClick={() => fileInput.current?.click()}>
                      انتخاب فایل
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<Download size={16} />}
                      onClick={async () => {
                        const res = await downloadStudentTemplateAction();
                        if (res.ok) {
                          saveAsBase64(res.base64, 'قالب-دانشجویان.xlsx');
                          toast.push({ kind: 'info', title: 'قالب نمونه دانلود شد' });
                        }
                      }}
                    >
                      دانلود قالب نمونه
                    </Button>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                  {file && (
                    <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/50 px-4 py-2.5">
                      <FileSpreadsheet size={16} className="text-[var(--color-brand-700)]" />
                      <span className="text-xs font-medium">{file.name}</span>
                      <button
                        onClick={() => {
                          setFile(null);
                          setPreview(null);
                        }}
                        className="text-[var(--color-foreground-muted)] hover:text-rose-500"
                        aria-label="حذف فایل"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <XCircle size={17} className="mt-0.5 shrink-0 text-rose-500" />
                    <p className="text-xs font-medium leading-relaxed text-rose-700">{error}</p>
                  </div>
                )}
              </div>

              <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <h3 className="text-sm font-bold">ساختار فایل</h3>
                <p className="mt-1.5 text-xs leading-loose text-[var(--color-foreground-muted)]">
                  ردیف نخست باید عنوان ستون‌ها باشد. ستون‌های اجباری:
                </p>
                <ul className="mt-4 space-y-2">
                  {['شماره دانشجویی', 'کد ملی', 'نام', 'نام خانوادگی', 'وضعیت'].map((h) => (
                    <li
                      key={h}
                      className="flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs"
                    >
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      {h}
                    </li>
                  ))}
                  {['دانشکده', 'رشته', 'سال ورود', 'موبایل'].map((h) => (
                    <li
                      key={h}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--color-foreground-muted)]"
                    >
                      <span className="h-3.5 w-3.5 rounded-full border border-[var(--color-border)]" />
                      {h} <span className="text-[10px]">(اختیاری)</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 rounded-xl border border-[var(--color-accent-200)] bg-[var(--color-accent-50)]/70 p-3.5">
                  <p className="text-[11px] leading-loose text-[var(--color-accent-900)]">
                    رمز اولیه هر دانشجوی جدید، کد ملی اوست و در نخستین ورود باید رمز شخصی تعیین کند.
                  </p>
                </div>
              </aside>
            </div>
          )}

          {/* ── گام ۲ ── */}
          {step === 1 && preview && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="text-base font-bold">نگاشت ستون‌ها</h2>
              <p className="mt-1.5 text-sm text-[var(--color-foreground-muted)]">
                عنوان ستون‌ها به‌صورت خودکار تشخیص داده شد. در صورت نیاز اصلاح کنید.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {preview.headers.map((h, i) => (
                  <div key={i} className="rounded-xl border border-[var(--color-border)] p-3.5">
                    <p className="mb-2 truncate text-xs font-semibold text-[var(--color-foreground-muted)]">
                      ستون {toPersianDigits(i + 1)}: {h || '(بدون عنوان)'}
                    </p>
                    <Select
                      value={columnMap[i] ?? ''}
                      onChange={(e) => setColumnMap((p) => ({ ...p, [i]: e.target.value || null }))}
                    >
                      {FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Button icon={<ArrowRight size={16} />} onClick={revalidate} loading={loading}>
                  بررسی و اعتبارسنجی
                </Button>
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft size={16} /> بازگشت
                </Button>
              </div>
            </div>
          )}

          {/* ── گام ۳ ── */}
          {step === 2 && preview && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
                {[
                  {
                    label: 'کل ردیف‌ها',
                    value: preview.counts.total,
                    tone: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
                  },
                  { label: 'جدید', value: preview.counts.create, tone: 'bg-emerald-50 text-emerald-700' },
                  { label: 'به‌روزرسانی', value: preview.counts.update, tone: 'bg-sky-50 text-sky-700' },
                  { label: 'تعارض', value: preview.counts.conflict, tone: 'bg-amber-50 text-amber-800' },
                  { label: 'خطا', value: preview.counts.error, tone: 'bg-rose-50 text-rose-700' },
                ].map((c) => (
                  <div
                    key={c.label}
                    className={`rounded-xl border border-[var(--color-border)] p-4 ${c.tone}`}
                  >
                    <p className="text-[11px] opacity-75">{c.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{toPersianDigits(c.value)}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
                  <Button
                    size="sm"
                    variant={onlyErrors ? 'primary' : 'secondary'}
                    icon={<Filter size={14} />}
                    onClick={() => setOnlyErrors((v) => !v)}
                  >
                    فقط خطاها و تعارض‌ها
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download size={14} />}
                    onClick={async () => {
                      const res = await downloadErrorReportAction(
                        preview.rows.map((r) => ({
                          rowNumber: r.rowNumber,
                          kind: r.kind,
                          studentNumber: r.studentNumber,
                          nationalCodeMasked: r.nationalCodeMasked,
                          errors: r.errors,
                          warnings: r.warnings,
                        })),
                      );
                      saveAsBase64(res.base64, 'گزارش-خطاهای-ایمپورت.xlsx');
                      toast.push({ kind: 'info', title: 'گزارش خطاها دانلود شد' });
                    }}
                  >
                    دانلود گزارش خطا
                  </Button>
                  <span className="mr-auto text-xs text-[var(--color-foreground-muted)]">
                    {toPersianDigits(visibleRows.length)} ردیف نمایش داده شده
                    {preview.elapsedMs > 0 && (
                      <> — پردازش در {toPersianDigits(Math.round(preview.elapsedMs / 100) / 10)} ثانیه</>
                    )}
                  </span>
                </div>

                <div className="max-h-[520px] overflow-auto">
                  {visibleRows.length === 0 ? (
                    <EmptyState
                      title="ردیفی برای نمایش نیست"
                      description="همه ردیف‌ها معتبرند یا فیلتر فعال است."
                    />
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="sticky top-0 z-10 bg-[var(--color-muted)]/95 backdrop-blur">
                        <tr className="text-[11px] text-[var(--color-foreground-muted)]">
                          <th className="px-3 py-2.5 font-semibold">ردیف</th>
                          <th className="px-3 py-2.5 font-semibold">وضعیت</th>
                          <th className="px-3 py-2.5 font-semibold">شماره دانشجویی</th>
                          <th className="px-3 py-2.5 font-semibold">نام</th>
                          <th className="px-3 py-2.5 font-semibold">کد ملی</th>
                          <th className="px-3 py-2.5 font-semibold">دانشکده</th>
                          <th className="px-3 py-2.5 font-semibold">خطا / هشدار</th>
                          {preview.rows.some((r) => r.kind === 'CONFLICT') && (
                            <th className="px-3 py-2.5 font-semibold">تأیید</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((r) => (
                          <PreviewRow
                            key={r.rowNumber}
                            row={r}
                            showConfirm={preview.rows.some((x) => x.kind === 'CONFLICT')}
                            confirmed={overrides[r.rowNumber] === true}
                            onToggleConfirm={() =>
                              setOverrides((p) => ({ ...p, [r.rowNumber]: !p[r.rowNumber] }))
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold">گزینه‌های ثبت</h3>
                    <p className="mt-1 text-xs leading-loose text-[var(--color-foreground-muted)]">
                      دانشجویانی که در این فایل نیستند، به‌صورت پیش‌فرض هیچ تغییری نمی‌کنند.
                    </p>
                  </div>
                  <Switch
                    checked={deactivateMissing}
                    onChange={(v) => {
                      if (v) setConfirmDeactivate(true);
                      else setDeactivateMissing(false);
                    }}
                    label="غیرفعال‌سازی دانشجویانی که در این فایل نیستند"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button icon={<CheckCircle2 size={16} />} onClick={() => setConfirmCommit(true)}>
                  ثبت نهایی {toPersianDigits(preview.counts.create + preview.counts.update)} ردیف معتبر
                </Button>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> بازگشت به نگاشت ستون‌ها
                </Button>
              </div>
            </div>
          )}

          {/* ── گام ۴ ── */}
          {step === 3 && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
              {!result ? (
                <div className="mx-auto max-w-md py-8 text-center">
                  <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-brand-100)] text-[var(--color-brand-800)]">
                    <RefreshCw size={26} className="animate-spin" />
                  </div>
                  <h2 className="text-lg font-bold">در حال ثبت اطلاعات…</h2>
                  <p className="mt-2 text-sm text-[var(--color-foreground-muted)]">
                    لطفاً تا پایان عملیات از بستن صفحه خودداری کنید
                  </p>
                  <div className="mt-6">
                    <Progress value={progress} label="پیشرفت ثبت" />
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-lg py-6 text-center">
                  <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-emerald-50 text-emerald-500">
                    <CheckCircle2 size={38} />
                  </div>
                  <h2 className="text-2xl font-bold">ثبت با موفقیت انجام شد</h2>
                  <p className="mt-2.5 text-sm text-[var(--color-foreground-muted)]">
                    اطلاعات در یک تراکنش یکپارچه ذخیره شد
                  </p>

                  <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'جدید', value: result.created, cls: 'text-emerald-600' },
                      { label: 'به‌روزشده', value: result.updated, cls: 'text-sky-600' },
                      { label: 'ردشده', value: result.skipped, cls: 'text-rose-600' },
                      { label: 'غیرفعال‌شده', value: result.deactivated, cls: 'text-amber-600' },
                    ].map((c) => (
                      <div key={c.label} className="rounded-xl border border-[var(--color-border)] p-3.5">
                        <p className={`text-2xl font-bold tabular-nums ${c.cls}`}>
                          {toPersianDigits(c.value)}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--color-foreground-muted)]">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                    <Button onClick={() => router.push('/vice/students')}>مشاهده دانشجویان</Button>
                    <Button variant="secondary" onClick={() => router.push('/vice/imports')}>
                      تاریخچه ایمپورت‌ها
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStep(0);
                        setFile(null);
                        setPreview(null);
                        setResult(null);
                        setProgress(0);
                        setOverrides({});
                      }}
                    >
                      ایمپورت فایل جدید
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog
        open={confirmCommit}
        onClose={() => setConfirmCommit(false)}
        title="ثبت نهایی اطلاعات"
        description={`${toPersianDigits(preview?.counts.create ?? 0)} دانشجوی جدید ایجاد و ${toPersianDigits(preview?.counts.update ?? 0)} رکورد به‌روزرسانی می‌شود. این عملیات در یک تراکنش انجام می‌شود و قابل بازگردانی است.`}
        confirmLabel="ثبت نهایی"
        onConfirm={doCommit}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        title="غیرفعال‌سازی دانشجویان غایب"
        description="با فعال کردن این گزینه، همه دانشجویانی که در این فایل نیستند غیرفعال می‌شوند و نشست‌هایشان باطل خواهد شد. این عملیات تأثیر گسترده‌ای دارد."
        confirmLabel="می‌پذیرم و فعال می‌کنم"
        danger
        requireTypedWord="غیرفعال‌سازی"
        onConfirm={() => {
          setDeactivateMissing(true);
          setConfirmDeactivate(false);
        }}
      />
    </div>
  );
}

function PreviewRow({
  row,
  showConfirm,
  confirmed,
  onToggleConfirm,
}: {
  row: PreviewRowDto;
  showConfirm: boolean;
  confirmed: boolean;
  onToggleConfirm: () => void;
}) {
  const badge = KIND_BADGE[row.kind] ?? KIND_BADGE.ERROR;
  return (
    <tr className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-muted)]/40">
      <td className="px-3 py-2.5 tabular-nums text-[var(--color-foreground-muted)]">
        {toPersianDigits(row.rowNumber)}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={badge.variant}>
          {badge.icon} {badge.label}
        </Badge>
      </td>
      <td className="px-3 py-2.5 font-mono" dir="ltr">
        {row.studentNumber || '—'}
      </td>
      <td className="px-3 py-2.5">
        {row.firstName} {row.lastName}
      </td>
      <td className="px-3 py-2.5 font-mono" dir="ltr">
        {row.nationalCodeMasked}
        {row.existingNationalCodeMasked && (
          <span className="mr-1.5 text-[10px] text-amber-600">(قبلی: {row.existingNationalCodeMasked})</span>
        )}
      </td>
      <td className="px-3 py-2.5">{row.faculty ?? '—'}</td>
      <td className="max-w-[260px] px-3 py-2.5">
        {row.errors.length > 0 && (
          <ul className="space-y-0.5">
            {row.errors.map((e, i) => (
              <li key={i} className="flex items-start gap-1 text-[11px] leading-relaxed text-rose-600">
                <XCircle size={11} className="mt-0.5 shrink-0" /> {e}
              </li>
            ))}
          </ul>
        )}
        {row.warnings.length > 0 && (
          <ul className="space-y-0.5">
            {row.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1 text-[11px] leading-relaxed text-amber-700">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
        {row.errors.length === 0 && row.warnings.length === 0 && (
          <span className="text-[11px] text-emerald-600">بدون خطا</span>
        )}
      </td>
      {showConfirm && (
        <td className="px-3 py-2.5">
          {row.kind === 'CONFLICT' ? (
            <input
              type="checkbox"
              checked={confirmed}
              onChange={onToggleConfirm}
              className="h-4 w-4 cursor-pointer accent-[var(--color-accent-500)]"
              aria-label="تأیید صریح تغییر کد ملی"
            />
          ) : (
            <span className="text-[var(--color-border)]">—</span>
          )}
        </td>
      )}
    </tr>
  );
}
