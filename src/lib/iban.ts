import { toLatinDigits } from './validation';

/**
 * اعتبارسنجی شماره شبا (IBAN) ایرانی — فاز ۳-۴.
 * الگو: IR + ۲۴ رقم (مجموع ۲۶ نویسه) با checksum استاندارد ISO 7064 mod-97.
 */

/** نرمال‌سازی: ارقام فارسی→لاتین، حذف فاصله، حروف بزرگ */
export function normalizeIban(raw: string): string {
  return toLatinDigits(raw).replace(/[\s_-]/g, '').toUpperCase();
}

/** اعتبارسنجی کامل — خروجی شبه‌یکی شبا نرمال‌شده است */
export function validateIban(raw: string): { ok: true; iban: string } | { ok: false; error: string } {
  const iban = normalizeIban(raw);
  if (!iban) return { ok: false, error: 'شماره شبا را وارد کنید' };
  if (!/^IR\d{24}$/.test(iban)) {
    return { ok: false, error: 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد' };
  }
  if (!mod97(iban)) {
    return { ok: false, error: 'شماره شبا معتبر نیست (رقم کنترلی اشتباه است)' };
  }
  return { ok: true, iban };
}

/** الگوریتم ISO 7064 mod-97 */
function mod97(iban: string): boolean {
  // جابه‌جایی ۴ نویسهٔ اول به انتها
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  // تبدیل حروف به عدد (A=10, B=11, …)
  const digits = rearranged
    .split('')
    .map((ch) => (/[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join('');
  // محاسبهٔ mod 97 به صورت تکه‌تکه (اعداد بزرگ JS مشکل دارند)
  let remainder = 0;
  for (const ch of digits) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

/** ماسک برای نمایش: IR12••••••••••••••••1234 */
export function maskIban(raw: string): string {
  const iban = normalizeIban(raw);
  if (iban.length < 10) return '•'.repeat(iban.length);
  return `${iban.slice(0, 4)}${'•'.repeat(iban.length - 8)}${iban.slice(-4)}`;
}
