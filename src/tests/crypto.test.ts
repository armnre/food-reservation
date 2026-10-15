import { describe, it, expect } from 'vitest';
import {
  encryptSecret, decryptSecret, blindIndex, safeEqual, maskNationalCode,
  generateToken, hashToken,
} from '../lib/crypto';

describe('رمزنگاری AES-256-GCM', () => {
  it('رفت‌وبرگشت رمزنگاری درست است', () => {
    const plain = '0012345678';
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('هر بار خروجی متفاوت می‌دهد (IV تصادفی)', () => {
    const a = encryptSecret('0012345678');
    const b = encryptSecret('0012345678');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('داده دستکاری‌شده را رد می‌کند', () => {
    const enc = encryptSecret('0012345678');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff;
    expect(() => decryptSecret(buf.toString('base64'))).toThrow();
  });

  it('در خروجی رمزنگاری‌شده هیچ کد ملی خامی نیست', () => {
    const enc = encryptSecret('0499370899');
    expect(enc.includes('0499370899')).toBe(false);
  });
});

describe('ایندکس کور', () => {
  it('برای مقدار یکسان یکتاست', () => {
    expect(blindIndex('0012345678')).toBe(blindIndex('0012345678'));
  });

  it('برای مقدار متفاوت متفاوت است', () => {
    expect(blindIndex('0012345678')).not.toBe(blindIndex('0012345679'));
  });

  it('مقدار خام را آشکار نمی‌کند', () => {
    expect(blindIndex('0012345678')).not.toContain('0012345678');
  });
});

describe('مقایسه امن', () => {
  it('رشته‌های برابر را درست می‌سنجد', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });

  it('رشته‌های نابرابر یا با طول متفاوت را رد می‌کند', () => {
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('ماسک کد ملی', () => {
  it('فرمت ماسک درست است', () => {
    expect(maskNationalCode('0012345678')).toBe('0012****78');
    expect(maskNationalCode('12')).toBe('****');
    expect(maskNationalCode('123456')).toBe('12****56');
  });
});

describe('توکن نشست', () => {
  it('توکن یکتا تولید می‌کند', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('هش توکن پایدار است', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
});
