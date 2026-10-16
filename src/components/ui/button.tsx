'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'outline';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--color-brand-950)] text-white hover:bg-[var(--color-brand-900)] shadow-[0_4px_14px_rgba(58,45,125,0.35)] hover:shadow-[0_6px_20px_rgba(58,45,125,0.45)]',
  accent:
    'bg-[var(--color-accent-500)] text-white hover:bg-[var(--color-accent-600)] shadow-[0_4px_14px_rgba(240,128,32,0.32)]',
  secondary:
    'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-brand-100)] dark:hover:bg-[var(--color-brand-900)]/40 border border-[var(--color-border)]',
  outline:
    'bg-transparent text-[var(--color-brand-700)] border border-[var(--color-brand-300)] hover:bg-[var(--color-brand-50)] dark:text-[var(--color-brand-300)] dark:hover:bg-[var(--color-brand-950)]/40',
  ghost:
    'bg-transparent text-[var(--color-foreground-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-[0_4px_14px_rgba(225,29,72,0.28)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-lg gap-2',
  lg: 'h-13 px-7 text-base rounded-xl gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  block = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-700)]/40 focus-visible:ring-offset-2 ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-[var(--color-brand-600)]" />;
}
