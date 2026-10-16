import { describe, it, expect } from 'vitest';
import {
  rialToToman,
  tomanToRial,
  formatToman,
  formatRial,
  parseTomanInput,
  isNonNegativeRial,
} from '../lib/money';
import { toJalali, fromJalali } from '../lib/jalali';
import { toPersianDigits } from '../lib/validation';

describe('کمک‌پول (ریال ↔ تومان)', () => {
  it('تبدیل ریال به تومان', () => {
    expect(rialToToman(120000)).toBe(12000);
    expect(rialToToman(120500)).toBe(12050);
    expect(rialToToman(0)).toBe(0);
  });

  it('تبدیل تومان به ریال', () => {
    expect(tomanToRial(12000)).toBe(120000);
    expect(tomanToRial(0)).toBe(0);
  });

  it('رفت‌وبرگشت بدون اتلاف', () => {
    expect(rialToToman(tomanToRial(5000))).toBe(5000);
  });

  it('مبلغ غیرصحیح را رد می‌کند', () => {
    expect(() => rialToToman(1.5)).toThrow();
    expect(() => tomanToRial(2.3)).toThrow();
  });

  it('نمایش فارسی مبلغ', () => {
    expect(formatToman(120000)).toContain('12,000'.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));
    expect(formatToman(120000)).toContain('تومان');
    expect(formatRial(120000)).toContain('ریال');
  });

  it('ورودی کاربر را تبدیل می‌کند', () => {
    const r = parseTomanInput('۲۵٬۰۰۰');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rials).toBe(250000);
  });

  it('ورودی خالی را رد می‌کند', () => {
    const r = parseTomanInput('');
    expect(r.ok).toBe(false);
  });

  it('مبلغ غیرمنفی', () => {
    expect(isNonNegativeRial(0)).toBe(true);
    expect(isNonNegativeRial(100)).toBe(true);
    expect(isNonNegativeRial(-1)).toBe(false);
    expect(isNonNegativeRial(1.5)).toBe(false);
  });
});

describe('تاریخ شمسی', () => {
  it('تاریخ میلادی را به شمسی تبدیل می‌کند', () => {
    // 1403/01/01 شمسی ≈ 2024/03/20 میلادی
    const d = new Date(2024, 2, 20);
    expect(toJalali(d)).toBe('1403/01/01');
  });

  it('تاریخ شمسی را به میلادی تبدیل می‌کند — نیمه‌شب تهران', () => {
    const d = fromJalali('1403/01/01');
    // ۱۴۰۳/۰۱/۰۱ = ۲۰ مارس ۲۰۲۴؛ نیمه‌شب تهران = 2024-03-19T20:30:00Z
    expect(d.toISOString()).toBe('2024-03-19T20:30:00.000Z');
  });

  it('رفت‌وبرگشت تاریخ پایدار است — مستقل از TZ سرور', () => {
    const d = new Date(2025, 8, 15); // ۱۵ سپتامبر ۲۰۲۵ ساعت محلی سرور
    const round = fromJalali(toJalali(d));
    // هر دو باید به یک «روز تقویمی تهران» اشاره کنند
    expect(toJalali(round)).toBe(toJalali(d));
  });

  it('ارقام نمایش فارسی است', () => {
    expect(toPersianDigits('1403')).toBe('۱۴۰۳');
    // نمایش تاریخ همیشه با ارقام فارسی
    expect(toPersianDigits(toJalali(new Date(2024, 2, 20)))).toBe('۱۴۰۳/۰۱/۰۱');
  });
});
