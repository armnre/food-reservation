'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, Table2, Pencil, Power, UploadCloud, Flame, Tag, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Field, TextInput, Select, Textarea, DataTable, type Column } from '@/components/ui/data';
import { Dialog, ConfirmDialog, useToast, EmptyState } from '@/components/ui/feedback';
import { createFoodAction, updateFoodAction, toggleFoodAction } from '@/server/actions/menu-actions';
import { uploadUrl } from '@/lib/upload-url';
import { fileToBase64 } from '@/lib/download';
import { toPersianDigits } from '@/lib/validation';

export interface FoodItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  categoryLabel: string;
  calories: number | null;
  tags: string[];
  thumbPath: string | null;
  imagePath: string | null;
  isActive: boolean;
  createdAt: string;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'MAIN', label: 'غذای اصلی' },
  { value: 'SIDE', label: 'میان‌وعده' },
  { value: 'SALAD', label: 'سالاد' },
  { value: 'DESSERT', label: 'دسر' },
  { value: 'DRINK', label: 'نوشیدنی' },
  { value: 'OTHER', label: 'سایر' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'MAIN',
  calories: '',
  tags: '',
};

export function FoodsClient({
  items,
  initialQuery,
}: {
  items: FoodItem[];
  initialQuery: { q: string; category: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [query, setQuery] = useState(initialQuery.q);
  const [category, setCategory] = useState(initialQuery.category);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<FoodItem | null>(null);

  function navigate(next: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { ...initialQuery, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'ALL') params.set(k, v);
    }
    router.push(`/nutrition/foods?${params.toString()}`);
    router.refresh();
  }

  const columns: Column<FoodItem>[] = [
    {
      key: 'name',
      header: 'نام غذا',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]">
            {r.thumbPath ? (
              <Image
                src={uploadUrl(r.thumbPath) ?? ''}
                alt={r.name}
                fill
                className="object-cover"
                sizes="36px"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-[10px] text-[var(--color-foreground-muted)]">
                🍽
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{r.name}</p>
            <p className="text-[10px] text-[var(--color-foreground-muted)]">{r.categoryLabel}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'tags',
      header: 'برچسب‌ها',
      hideOnMobile: true,
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.tags.length === 0 ? (
            <span className="text-[11px] text-[var(--color-foreground-muted)]">—</span>
          ) : (
            r.tags.map((t) => (
              <Badge key={t} variant="muted">
                {t}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'calories',
      header: 'کالری',
      render: (r) =>
        r.calories ? (
          <span className="text-xs tabular-nums">{toPersianDigits(r.calories)}</span>
        ) : (
          <span className="text-[11px] text-[var(--color-foreground-muted)]">—</span>
        ),
    },
    {
      key: 'isActive',
      header: 'وضعیت',
      render: (r) => (
        <Badge variant={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'فعال' : 'غیرفعال'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'عملیات',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(r);
              setFormOpen(true);
            }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]"
            aria-label="ویرایش"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmToggle(r);
            }}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-foreground-muted)] transition-colors hover:bg-amber-50 hover:text-amber-700"
            aria-label={r.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
          >
            <Power size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="min-w-[220px] flex-1">
          <Field label="جستجو" htmlFor="fq">
            <TextInput
              id="fq"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && navigate({ q: query })}
              placeholder="نام غذا"
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="دسته" htmlFor="fcat">
            <Select id="fcat" value={category} onChange={(e) => navigate({ category: e.target.value })}>
              <option value="ALL">همه دسته‌ها</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="primary" icon={<Search size={16} />} onClick={() => navigate({ q: query })}>
          جستجو
        </Button>
        <div className="mr-auto flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
          <button
            onClick={() => setView('grid')}
            className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${view === 'grid' ? 'bg-[var(--color-brand-950)] text-white' : 'text-[var(--color-foreground-muted)] hover:bg-[var(--color-muted)]'}`}
            aria-label="نمای کارتی"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setView('table')}
            className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${view === 'table' ? 'bg-[var(--color-brand-950)] text-white' : 'text-[var(--color-foreground-muted)] hover:bg-[var(--color-muted)]'}`}
            aria-label="نمای جدولی"
          >
            <Table2 size={15} />
          </button>
        </div>
      </div>

      <div className="mb-5">
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          افزودن غذا
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <EmptyState
            title="کتابخانه غذا خالی است"
            description="نخستین غذا را با نام، دسته، تصویر و برچسب اضافه کنید تا در برنامه هفتگی قابل استفاده باشد."
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                icon={<Plus size={16} />}
              >
                افزودن غذا
              </Button>
            }
          />
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((f) => (
            <article
              key={f.id}
              className={`group overflow-hidden rounded-xl border bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)] transition-all duration-200 hover:shadow-[0_10px_28px_rgba(58,45,125,0.12)] ${f.isActive ? 'border-[var(--color-border)]' : 'border-[var(--color-border)] opacity-65'}`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-muted)]">
                {f.imagePath ? (
                  <Image
                    src={uploadUrl(f.imagePath) ?? ''}
                    alt={f.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-4xl opacity-40">🍽</div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
                <div className="absolute bottom-2.5 right-2.5 flex flex-wrap gap-1">
                  <Badge variant="accent">{f.categoryLabel}</Badge>
                  {!f.isActive && <Badge variant="danger">غیرفعال</Badge>}
                </div>
              </div>

              <div className="p-4">
                <h3 className="truncate text-sm font-bold">{f.name}</h3>
                {f.description && (
                  <p className="mt-1 line-clamp-2 min-h-[32px] text-[11px] leading-relaxed text-[var(--color-foreground-muted)]">
                    {f.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {f.calories ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-50)] px-2 py-0.5 text-[10px] text-[var(--color-accent-700)]">
                      <Flame size={10} /> {toPersianDigits(f.calories)} کالری
                    </span>
                  ) : null}
                  {f.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] text-[var(--color-foreground-muted)]"
                    >
                      <Tag size={9} /> {t}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    icon={<Pencil size={13} />}
                    onClick={() => {
                      setEditing(f);
                      setFormOpen(true);
                    }}
                  >
                    ویرایش
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Power size={13} />}
                    onClick={() => setConfirmToggle(f)}
                  >
                    {f.isActive ? 'غیرفعال' : 'فعال'}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          onRowClick={(r) => {
            setEditing(r);
            setFormOpen(true);
          }}
          emptyTitle="غذایی یافت نشد"
          emptyDescription="فیلترها را تغییر دهید."
        />
      )}

      <FoodFormDialog
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          toast.push({ kind: 'success', title: 'اطلاعات غذا ذخیره شد' });
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmToggle)}
        onClose={() => setConfirmToggle(null)}
        title={confirmToggle?.isActive ? 'غیرفعال‌سازی غذا' : 'فعال‌سازی غذا'}
        description={
          confirmToggle?.isActive
            ? `«${confirmToggle?.name}» غیرفعال می‌شود. در منوهای گذشته باقی می‌ماند ولی در برنامه‌های جدید نمایش داده نمی‌شود.`
            : `«${confirmToggle?.name}» دوباره فعال می‌شود.`
        }
        confirmLabel={confirmToggle?.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
        danger={confirmToggle?.isActive}
        onConfirm={async () => {
          if (!confirmToggle) return;
          const res = await toggleFoodAction(confirmToggle.id, !confirmToggle.isActive);
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

function FoodFormDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: FoodItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState(EMPTY_FORM);
  const [image, setImage] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // همگام‌سازی فرم در render — بدون useEffect (الگوی رسمی React)
  const [prevDialogKey, setPrevDialogKey] = useState<string | null>(null);
  const dialogKey = open ? `food:${editing?.id ?? 'new'}` : null;
  if (dialogKey !== prevDialogKey) {
    setPrevDialogKey(dialogKey);
    if (open) {
      setValues({
        name: editing?.name ?? '',
        description: editing?.description ?? '',
        category: editing?.category ?? 'MAIN',
        calories: editing?.calories ? String(editing.calories) : '',
        tags: (editing?.tags ?? []).join('، '),
      });
      setImage(null);
      setErrors({});
    }
  }

  async function pickImage(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setErrors((p) => ({ ...p, image: 'حجم تصویر نباید بیشتر از ۲ مگابایت باشد' }));
      return;
    }
    const base64 = await fileToBase64(file);
    setImage({ base64, mime: file.type, preview: URL.createObjectURL(file) });
    setErrors((p) => ({ ...p, image: '' }));
  }

  async function submit() {
    const e: Record<string, string> = {};
    if (!values.name.trim()) e.name = 'نام غذا الزامی است';
    if (values.calories && !/^\d+$/.test(values.calories)) e.calories = 'کالری باید عدد باشد';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setBusy(true);
    const payload = {
      name: values.name,
      description: values.description || null,
      category: values.category,
      calories: values.calories ? Number.parseInt(values.calories, 10) : null,
      tags: values.tags
        .split(/[،,]/)
        .map((t) => t.trim())
        .filter(Boolean),
      imageBase64: image?.base64 ?? null,
      imageMime: image?.mime ?? null,
    };
    const res = editing
      ? await updateFoodAction({ id: editing.id, ...payload })
      : await createFoodAction(payload);
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
      title={editing ? 'ویرایش غذا' : 'افزودن غذای جدید'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={busy} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'افزودن غذا'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="نام غذا" required error={errors.name}>
          <TextInput
            value={values.name}
            onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
          />
        </Field>
        <Field label="دسته">
          <Select
            value={values.category}
            onChange={(e) => setValues((p) => ({ ...p, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="کالری (اختیاری)" error={errors.calories}>
          <TextInput
            dir="ltr"
            value={values.calories}
            className="text-right"
            onChange={(e) => setValues((p) => ({ ...p, calories: e.target.value }))}
          />
        </Field>
        <Field label="برچسب‌ها" hint="با ویرگول جدا کنید — مثلاً گیاهی، تند">
          <TextInput
            value={values.tags}
            onChange={(e) => setValues((p) => ({ ...p, tags: e.target.value }))}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="توضیحات">
            <Textarea
              value={values.description}
              onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[13px] font-medium">تصویر غذا</p>
        <label className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-[var(--color-border)] p-4 transition-colors hover:border-[var(--color-brand-300)] hover:bg-[var(--color-brand-50)]/40">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]">
            {image?.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.preview} alt="" className="h-full w-full object-cover" />
            ) : editing?.thumbPath ? (
              <Image src={uploadUrl(editing.thumbPath) ?? ''} alt="" fill className="object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[var(--color-foreground-muted)]">
                <UploadCloud size={22} />
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold">انتخاب تصویر</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-foreground-muted)]">
              فرمت jpg، png یا webp — حداکثر ۲ مگابایت
              <br />
              پس از آپلود به webp تبدیل و ذخیره می‌شود.
            </p>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickImage(f);
            }}
          />
        </label>
        {errors.image && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.image}</p>}
      </div>
    </Dialog>
  );
}
