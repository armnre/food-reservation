import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/**
 * رمزنگاری داده‌های حساس (کد ملی) با AES-256-GCM.
 * فرمت ذخیره: base64(iv[12] || tag[16] || ciphertext)
 */
export function encryptSecret(plain: string): string {
  const key = env.dataEncryptionKey;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const key = env.dataEncryptionKey;
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 12 + 16 + 1) throw new Error('داده رمزنگاری‌شده معتبر نیست');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/**
 * ایندکس کور (blind index) — HMAC-SHA256 روی مقدار نرمال‌شده.
 * برای جستجو و یکتایی بدون نگهداری مقدار خام.
 */
export function blindIndex(normalizedValue: string): string {
  return createHmac('sha256', env.dataHashKey).update(normalizedValue, 'utf8').digest('base64');
}

/** مقایسه امن (ثابت‌الزمان) دو رشته؛ طول‌های متفاوت ⇒ false بدون نشت زمانی معنادار */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // مقایسه‌ی ساختگی تا تفاوت زمانی محسوس نباشد
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** ماسک کد ملی برای نمایش: ۰۰۱۲****۳۴ */
export function maskNationalCode(code: string): string {
  const d = code.replace(/\D/g, '');
  if (d.length < 4) return '****';
  if (d.length < 8) return `${d.slice(0, 2)}****${d.slice(-2)}`;
  return `${d.slice(0, 4)}****${d.slice(-2)}`;
}

/** تولید توکن نشست */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** هش توکن نشست (sha256 — سریع و کافی برای مقدار پرانتروپی بالا) */
export function hashToken(token: string): string {
  return createHmac('sha256', env.dataHashKey).update(token, 'utf8').digest('hex');
}
