import { describe, it, expect } from 'vitest';
import {
  toLatinDigits, toPersianDigits, normalizePersianText,
  normalizeNationalCode, isValidNationalCode, normalizeStudentNumber,
  normalizeMobile, parseStudentStatus, parseStaffKind,
  validatePersonalPassword, passwordStrength, generateTemporaryPassword,
} from '../lib/validation';

describe('تبدیل ارقام', () => {
  it('ارقام فارسی و عربی را به لاتین تبدیل می‌کند', () => {
    expect(toLatinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toLatinDigits('۴۰۱۲۳۴۵۶')).toBe('40123456');
  });

  it('ارقام لاتین را به فارسی تبدیل می‌کند', () => {
    expect(toPersianDigits('40123456')).toBe('۴۰۱۲۳۴۵۶');
  });
});

describe('نرمال‌سازی متن فارسی', () => {
  it('ي و ك را به ی و ک تبدیل می‌کند', () => {
    expect(normalizePersianText('علي كريمي')).toBe('علی کریمی');
  });

  it('فاصله‌های اضافی را حذف می‌کند', () => {
    expect(normalizePersianText('  علی   رضایی  ')).toBe('علی رضایی');
  });
});

describe('کد ملی', () => {
  it('صفرهای ابتدایی حفظ می‌شوند', () => {
    expect(normalizeNationalCode('۰۰۱۲۳۴۵۶۷۸')).toBe('0012345678');
    expect(normalizeNationalCode('0012345678')).toBe('0012345678');
  });

  it('کد ملی معتبر را قبول می‌کند', () => {
    // کدهای ملی با الگوریتم رقم کنترلی واقعی
    expect(isValidNationalCode('0499370899')).toBe(true);
    expect(isValidNationalCode('1111111111')).toBe(false);
  });

  it('کد ملی تکراری (همه رقم یکسان) را رد می‌کند', () => {
    expect(isValidNationalCode('0000000000')).toBe(false);
    expect(isValidNationalCode('1111111111')).toBe(false);
    expect(isValidNationalCode('9999999999')).toBe(false);
  });

  it('کد کوتاه یا نامتقارن را رد می‌کند', () => {
    expect(isValidNationalCode('123')).toBe(false);
    expect(isValidNationalCode('1234567890')).toBe(false);
    expect(isValidNationalCode('')).toBe(false);
  });
});

describe('شماره دانشجویی و موبایل', () => {
  it('شماره دانشجویی فقط رقم می‌پذیرد', () => {
    expect(normalizeStudentNumber('۴۰۱۲۳abc۴۵۶')).toBe('40123456');
  });

  it('موبایل ایران را نرمال می‌کند', () => {
    expect(normalizeMobile('09121234567')).toBe('09121234567');
    expect(normalizeMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
    expect(normalizeMobile('989121234567')).toBe('09121234567');
    expect(normalizeMobile('12345')).toBeUndefined();
    expect(normalizeMobile('')).toBeUndefined();
  });
});

describe('وضعیت و نوع کارمند', () => {
  it('وضعیت فارسی و انگلیسی را تشخیص می‌دهد', () => {
    expect(parseStudentStatus('فعال')).toBe('ACTIVE');
    expect(parseStudentStatus('ON_LEAVE')).toBe('ON_LEAVE');
    expect(parseStudentStatus('مرخصی')).toBe('ON_LEAVE');
    expect(parseStudentStatus('فارغ‌التحصیل')).toBe('GRADUATED');
    expect(parseStudentStatus('نامشخص')).toBeNull();
  });

  it('نوع کارمند را تشخیص می‌دهد', () => {
    expect(parseStaffKind('کارمند')).toBe('EMPLOYEE');
    expect(parseStaffKind('هیئت‌علمی')).toBe('FACULTY');
    expect(parseStaffKind('پیمانکار')).toBe('CONTRACTOR');
    expect(parseStaffKind('کارمند سلف')).toBe('CAFETERIA');
    expect(parseStaffKind('نامشخص')).toBeNull();
  });
});

describe('رمز عبور', () => {
  it('رمز کوتاه را رد می‌کند', () => {
    expect(validatePersonalPassword('1234567', {})).toContain('حداقل ۸');
  });

  it('رمز برابر با کد ملی را رد می‌کند', () => {
    expect(validatePersonalPassword('0012345678', { nationalCode: '0012345678' })).toContain('کد ملی');
  });

  it('رمز برابر با شماره دانشجویی را رد می‌کند', () => {
    expect(validatePersonalPassword('40123456', { studentNumber: '40123456' })).toContain('شماره دانشجویی');
  });

  it('رمز معتبر را قبول می‌کند', () => {
    expect(validatePersonalPassword('MyP@ssw0rd!', { nationalCode: '0012345678', studentNumber: '40123456' })).toBeNull();
  });

  it('قدرت رمز را محاسبه می‌کند', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('MyP@ssw0rd!')).toBeGreaterThanOrEqual(3);
  });

  it('رمز موقت تولید می‌کند', () => {
    const pw = generateTemporaryPassword(10);
    expect(pw).toHaveLength(10);
  });
});
