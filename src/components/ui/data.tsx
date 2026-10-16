'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown, Inbox } from 'lucide-react';

/* ───────────── Badge ───────────── */

export function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'accent';
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: 'bg-[var(--color-brand-100)] text-[var(--color-brand-700)] border-[var(--color-brand-200)]',
    success: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-transparent',
    warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-transparent',
    danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-transparent',
    info: 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-transparent',
    accent: 'bg-[var(--color-accent-50)] text-[var(--color-accent-700)] border-[var(--color-accent-200)]',
    muted: 'bg-[var(--color-muted)] text-[var(--color-foreground-muted)] border-[var(--color-border)]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5 ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ───────────── Field / Input ───────────── */

export function Field({
  label,
  error,
  hint,
  required,
  children,
  htmlFor,
}: {
  label?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-[var(--color-foreground)]"
        >
          {label}
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-[var(--color-foreground-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-muted)]/50 shadow-[inset_0_1px_2px_rgba(58,45,125,0.04)] transition-all duration-150 focus:border-[var(--color-brand-700)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-700)]/20 disabled:opacity-60';

export function TextInput({
  error,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string | null }) {
  return (
    <input
      className={`${inputCls} ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputCls} cursor-pointer ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputCls} min-h-[92px] resize-y ${className}`} {...props} />;
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-[var(--color-brand-700)]' : 'bg-[var(--color-border)]'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
          style={checked ? { right: 2 } : { right: 22 }}
        />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

/* ───────────── StatCard ───────────── */

export function StatCard({
  title,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'brand' | 'accent' | 'success' | 'warning';
}) {
  const tones: Record<string, string> = {
    brand: 'from-[var(--color-brand-50)] to-[var(--color-brand-100)]/40 text-[var(--color-brand-700)]',
    accent: 'from-[var(--color-accent-50)] to-[var(--color-accent-100)]/40 text-[var(--color-accent-600)]',
    success: 'from-emerald-50 to-emerald-100/40 text-emerald-600',
    warning: 'from-amber-50 to-amber-100/40 text-amber-600',
  };
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)] transition-all duration-200 hover:shadow-[0_8px_24px_rgba(58,45,125,0.10)]">
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${tones[tone].replace('text-', 'from-').split(' ')[0]} opacity-60`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-foreground-muted)]">{title}</p>
          <p className="mt-2 text-[26px] font-bold leading-none tracking-tight text-[var(--color-foreground)]">
            {value}
          </p>
          {hint && <p className="mt-2 text-xs text-[var(--color-foreground-muted)]">{hint}</p>}
        </div>
        {icon && (
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tones[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────── Tabs ───────────── */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/60 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition-colors ${active === t.id ? 'text-[var(--color-brand-950)]' : 'text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)]'}`}
        >
          {active === t.id && (
            <motion.span
              layoutId="tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="absolute inset-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
            />
          )}
          <span className="relative z-10">{t.label}</span>
          {t.count !== undefined && (
            <span
              className={`relative z-10 rounded-full px-1.5 text-[10px] tabular-nums ${active === t.id ? 'bg-[var(--color-brand-100)] text-[var(--color-brand-800)]' : 'bg-[var(--color-border)] text-[var(--color-foreground-muted)]'}`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ───────────── DataTable ───────────── */

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'right' | 'left' | 'center';
  width?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  onSortChange?: (key: string) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (p: number) => void;
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  selectedKeys?: Set<string>;
  onToggleSelect?: (key: string) => void;
  onToggleSelectAll?: () => void;
  loading?: boolean;
  skeletonCols?: number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sort,
  onSortChange,
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  search,
  onSearchChange,
  searchPlaceholder = 'جستجو…',
  emptyTitle = 'چیزی برای نمایش نیست',
  emptyDescription = 'هنوز رکوردی ثبت نشده است.',
  selectedKeys,
  onToggleSelect,
  onToggleSelectAll,
  loading = false,
  skeletonCols = 5,
}: DataTableProps<T>) {
  const reduce = useReducedMotion();
  const selectable = Boolean(selectedKeys && onToggleSelect);
  const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]">
      {(onSearchChange || selectable) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
          {onSearchChange && (
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-foreground-muted)]"
              />
              <input
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className={`${inputCls} pr-9`}
              />
            </div>
          )}
          {selectable && selectedKeys && selectedKeys.size > 0 && (
            <span className="rounded-lg bg-[var(--color-brand-50)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-800)]">
              {selectedKeys.size} مورد انتخاب شده
            </span>
          )}
        </div>
      )}

      <div className="data-table-scroll responsive">
        <table className="data-table">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/40">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="انتخاب همه"
                    checked={rows.length > 0 && rows.every((r, i) => selectedKeys?.has(rowKey(r, i)))}
                    onChange={() => onToggleSelectAll?.()}
                    className="h-4 w-4 cursor-pointer accent-[var(--color-brand-700)]"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-4 py-3 text-xs font-semibold text-[var(--color-foreground-muted)] ${c.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      onClick={() => onSortChange(c.key)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-foreground)]"
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )
                      ) : (
                        <ArrowUpDown size={13} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, r) => (
                <tr key={r} className="border-b border-[var(--color-border-subtle)]">
                  {selectable && (
                    <td className="px-3 py-3">
                      <div className="h-4 w-4 animate-pulse rounded bg-[var(--color-muted)]" />
                    </td>
                  )}
                  {Array.from({ length: skeletonCols }).map((_, c) => (
                    <td key={c} className="px-4 py-3">
                      <div
                        className="h-4 animate-pulse rounded bg-[var(--color-muted)]"
                        style={{ width: `${55 + ((r + c) % 4) * 10}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <div className="flex flex-col items-center py-14 text-center">
                    <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-muted)] text-[var(--color-foreground-muted)]">
                      <Inbox size={24} />
                    </div>
                    <p className="text-sm font-bold">{emptyTitle}</p>
                    <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[var(--color-foreground-muted)]">
                      {emptyDescription}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const key = rowKey(row, i);
                return (
                  <motion.tr
                    key={key}
                    initial={reduce ? false : { opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.25) }}
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-[var(--color-border-subtle)] transition-colors last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-[var(--color-brand-50)]/50 dark:hover:bg-[var(--color-brand-950)]/25' : ''}`}
                  >
                    {selectable && (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="انتخاب ردیف"
                          checked={selectedKeys?.has(key) ?? false}
                          onChange={() => onToggleSelect?.(key)}
                          className="h-4 w-4 cursor-pointer accent-[var(--color-brand-700)]"
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        data-label={c.header}
                        className={`px-4 py-3 ${c.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                      >
                        {c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? '')}
                      </td>
                    ))}
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-4 py-3">
          <p className="text-xs text-[var(--color-foreground-muted)]">
            صفحه <span className="font-bold tabular-nums">{page}</span> از{' '}
            <span className="font-bold tabular-nums">{totalPages}</span>
            {total !== undefined && <> — مجموع {total} رکورد</>}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-40"
              aria-label="صفحه قبل"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-foreground-muted)] transition-colors hover:bg-[var(--color-muted)] disabled:opacity-40"
              aria-label="صفحه بعد"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
