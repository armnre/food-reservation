import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** ترکیب و تمیز کردن کلاس‌های Tailwind بدون تضاد */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** debounce ساده */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}
