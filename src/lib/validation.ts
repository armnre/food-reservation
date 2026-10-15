/**
 * اعتبارسنجی و نرمال‌سازی داده‌های هویتی (بخش ب-۲).
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** تبدیل ارقام فارسی/عربی به لاتین */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p > -1) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a > -1) {
      out += String(a);
      continue;
    }
    out += ch;
  }
  return out;
}

/** تبدیل ارقام لاتین به فارسی */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** نرمال‌سازی متن فارسی: ي→ی، ك→ک، حذف فاصله‌های اضافی */
export function normalizePersianText(input: string): string {
  return input
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ') // نیم‌فاصله → فاصله
    .replace(/\s+/g, ' ')
    .trim();
}

/** نرمال‌سازی کد ملی: فقط رقم، ارقام لاتین، حفظ صفرهای ابتدایی */
export function normalizeNationalCode(input: string): string {
  return toLatinDigits(input).trim();
}

/**
 * الگوریتم رقم کنترلی کد ملی ایران.
 */
export function isValidNationalCode(input: string): boolean {
  const code = normalizeNationalCode(input);
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;

  const sum = Array.from({ length: 9 }, (_, i) => Number(code[i]) * (10 - i)).reduce((a, b) => a + b, 0);
  const remainder = sum % 11;
  const checkDigit = Number(code[9]);
  return remainder < 2 ? checkDigit === remainder : checkDigit === 11 - remainder;
}

/** نرمال‌سازی شماره دانشجویی: فقط رقم */
export function normalizeStudentNumber(input: string): string {
  return toLatinDigits(input).replace(/\D/g, '');
}

/** موبایل ایران: 09xxxxxxxxx */
export function normalizeMobile(input: string): undefined | string {
  const d = toLatinDigits(input).replace(/\D/g, '');
  if (d === '') return undefined;
  const candidate = d.length === 12 && d.startsWith('98') ? `0${d.slice(2)}` : d;
  if (/^09\d{9}$/.test(candidate)) return candidate;
  return undefined;
}

export const STUDENT_STATUS_VALUES = ['ACTIVE', 'ON_LEAVE', 'WITHDRAWN', 'GRADUATED'] as const;
export type StudentStatus = (typeof STUDENT_STATUS_VALUES)[number];

const STATUS_ALIASES: Record<string, StudentStatus> = {
  'فعال': 'ACTIVE',
  'active': 'ACTIVE',
  'ACTIVE': 'ACTIVE',
  'مرخصی': 'ON_LEAVE',
  'on_leave': 'ON_LEAVE',
  'ON_LEAVE': 'ON_LEAVE',
  'انصراف': 'WITHDRAWN',
  'withdrawn': 'WITHDRAWN',
  'WITHDRAWN': 'WITHDRAWN',
  'فارغ‌التحصیل': 'GRADUATED',
  'فارغ التحصیل': 'GRADUATED',
  'graduated': 'GRADUATED',
  'GRADUATED': 'GRADUATED',
};

export function parseStudentStatus(input: string): StudentStatus | null {
  const key = normalizePersianText(String(input ?? '')).trim();
  return STATUS_ALIASES[key] ?? STATUS_ALIASES[key.toUpperCase()] ?? null;
}

export const STAFF_KIND_VALUES = ['EMPLOYEE', 'FACULTY', 'CONTRACTOR', 'CAFETERIA'] as const;
export type StaffKind = (typeof STAFF_KIND_VALUES)[number];

const STAFF_KIND_ALIASES: Record<string, StaffKind> = {
  'کارمند': 'EMPLOYEE',
  'employee': 'EMPLOYEE',
  'EMPLOYEE': 'EMPLOYEE',
  'هیئت‌علمی': 'FACULTY',
  'هیئت علمی': 'FACULTY',
  'هيات علمي': 'FACULTY',
  'هیات علمی': 'FACULTY',
  'faculty': 'FACULTY',
  'FACULTY': 'FACULTY',
  'پیمانکار': 'CONTRACTOR',
  'contractor': 'CONTRACTOR',
  'CONTRACTOR': 'CONTRACTOR',
  'سلف': 'CAFETERIA',
  'کارمند سلف': 'CAFETERIA',
  'cafeteria': 'CAFETERIA',
  'CAFETERIA': 'CAFETERIA',
};

export function parseStaffKind(input: string): StaffKind | null {
  const key = normalizePersianText(String(input ?? '')).trim();
  return STAFF_KIND_ALIASES[key] ?? STAFF_KIND_ALIASES[key.toUpperCase()] ?? null;
}

/** تولید رمز تصادفی قابل‌خواندن برای کارکنان */
export function generateTemporaryPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  require('node:crypto').randomFillSync(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** قدرت رمز عبور: 0..4 */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^\w\s]/.test(pw)) score++;
  return Math.min(score, 4);
}

/** خطاهای رمز عبور شخصی دانشجو */
export function validatePersonalPassword(
  password: string,
  ctx: { nationalCode?: string | null; studentNumber?: string | null },
): string | null {
  if (password.length < 8) return 'رمز عبور باید حداقل ۸ کاراکتر باشد';
  if (ctx.nationalCode && password === ctx.nationalCode) {
    return 'رمز عبور نباید با کد ملی برابر باشد';
  }
  if (ctx.studentNumber && password === ctx.studentNumber) {
    return 'رمز عبور نباید با شماره دانشجویی برابر باشد';
  }
  return null;
}
