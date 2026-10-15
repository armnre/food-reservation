import { describe, it, expect } from 'vitest';
import { signQrToken, verifyQrToken } from '../server/services/reservation';
import { tomanToRial, rialToToman, formatToman, parseTomanInput } from '../lib/money';
import { tehranDayKey, tehranMidnight, isSameTehranDay, mealInstant } from '../lib/tehran-time';

/**
 * تست‌های واحد واقعی — منطق دیتابیسی رزرو/کیف پول در src/tests/integration/ پوشش داده شده است.
 * (تست‌های قبلی این فایل فقط literal چک می‌کردند و حذف شدند.)
 */

describe('QR Token — امضای HMAC', () => {
  it('توکن معتبر را تأیید می‌کند', () => {
    const token = signQrToken('res-123');
    expect(verifyQrToken(token)).toBe('res-123');
  });

  it('توکن دستکاری‌شده را رد می‌کند', () => {
    const token = signQrToken('res-123');
    const [id, sig] = token.split('.');
    expect(verifyQrToken(`res-999.${sig}`)).toBeNull();
    expect(verifyQrToken(`${id}.${sig.slice(0, -2)}xx`)).toBeNull();
  });

  it('فرمت نامعتبر را رد می‌کند', () => {
    expect(verifyQrToken('')).toBeNull();
    expect(verifyQrToken('no-dot')).toBeNull();
    expect(verifyQrToken('a.b.c')).toBeNull();
    expect(verifyQrToken('.sig')).toBeNull();
  });

  it('دو توکن برای id یکسان یکسان‌اند (deterministic)', () => {
    expect(signQrToken('x')).toBe(signQrToken('x'));
  });
});

describe('پول — تبدیل تومان و ریال', () => {
  it('تبدیل دوطرفه درست است', () => {
    expect(tomanToRial(50_000)).toBe(500_000);
    expect(rialToToman(500_000)).toBe(50_000);
  });

  it('مبالغ اعشاری یا غیر صحیح رد می‌شوند', () => {
    expect(() => tomanToRial(1.5)).toThrow();
    expect(() => rialToToman(123.45)).toThrow();
  });

  it('نمایش فارسی تومان', () => {
    expect(formatToman(120_000)).toContain('تومان');
  });

  it('parseTomanInput ورودی فارسی را می‌پذیرد', () => {
    const r = parseTomanInput('۵۰٬۰۰۰');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rials).toBe(500_000);
  });
});

describe('زمان تهران — مستقل از TZ سرور', () => {
  it('کلید روز تهران درست است', () => {
    // 2026-06-15 12:00 UTC = 2026-06-15 15:30 تهران
    expect(tehranDayKey(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06-15');
    // 2026-06-15 22:00 UTC = 2026-06-16 01:30 تهران — روز بعدی
    expect(tehranDayKey(new Date('2026-06-15T22:00:00Z'))).toBe('2026-06-16');
  });

  it('نیمه‌شب تهران همان لحظهٔ درست است', () => {
    const m = tehranMidnight('2026-06-15');
    expect(m.toISOString()).toBe('2026-06-14T20:30:00.000Z');
    expect(tehranDayKey(m)).toBe('2026-06-15');
  });

  it('isSameTehranDay مرز نیمه‌شب را درست تشخیص می‌دهد', () => {
    const a = new Date('2026-06-15T23:59:00Z'); // 03:29 بامداد ۱۶ ژوئن تهران؟ نه — 03:29 روز ۱۶
    const b = new Date('2026-06-15T10:00:00Z'); // 13:30 روز ۱۵ تهران
    expect(isSameTehranDay(a, b)).toBe(false);
    const c = new Date('2026-06-15T20:31:00Z'); // 00:01 روز ۱۶ تهران
    const d = new Date('2026-06-15T22:00:00Z'); // 01:30 روز ۱۶ تهران
    expect(isSameTehranDay(c, d)).toBe(true);
  });

  it('mealInstant ساعت وعده را به وقت تهران تفسیر می‌کند', () => {
    const day = tehranMidnight('2026-06-15');
    const slot = new Date('1970-01-01T11:30:00Z');
    const instant = mealInstant(day, slot);
    expect(instant.toISOString()).toBe('2026-06-15T08:00:00.000Z'); // 11:30 تهران = 08:00 UTC
  });
});
