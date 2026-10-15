import { toPersianDigits, toLatinDigits } from './validation';

/**
 * مبالغ همیشه در دیتابیس عدد صحیح **ریال**؛ نمایش به **تومان**.
 */

export function rialToToman(rials: number): number {
  if (!Number.isInteger(rials)) throw new Error('مبلغ باید عدد صحیح ریال باشد');
  return Math.floor(rials / 10);
}

export function tomanToRial(toman: number): number {
  if (!Number.isInteger(toman)) throw new Error('مبلغ باید عدد صحیح تومان باشد');
  return toman * 10;
}

/** نمایش فارسی مبلغ: ۱۲٬۰۰۰ تومان */
export function formatToman(rials: number): string {
  const toman = rialToToman(rials);
  return `${toPersianDigits(toman.toLocaleString('en-US'))} تومان`;
}

export function formatRial(rials: number): string {
  return `${toPersianDigits(rials.toLocaleString('en-US'))} ریال`;
}

/** مبلغ ورودی کاربر (تومان) → ریال، با اعتبارسنجی */
export function parseTomanInput(value: string): { ok: true; rials: number } | { ok: false; error: string } {
  const digits = toLatinDigits(value).replace(/[^\d]/g, '');
  if (digits === '') return { ok: false, error: 'مبلغ را وارد کنید' };
  const toman = Number.parseInt(digits, 10);
  if (!Number.isFinite(toman) || toman < 0) return { ok: false, error: 'مبلغ نامعتبر است' };
  return { ok: true, rials: tomanToRial(toman) };
}

export function isNonNegativeRial(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
