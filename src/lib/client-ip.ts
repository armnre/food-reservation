import { env } from './env';

/**
 * تشخیص IP کلاینت به شکل جعل‌ناپذیر (الف-۲).
 *
 * قاعده:
 *  - TRUSTED_PROXY_HOPS = 0  ⇒  فقط IP سوکت. هیچ هدری خوانده نمی‌شود.
 *                              (هدر X-Forwarded-For کاملاً نادیده گرفته می‌شود.)
 *  - TRUSTED_PROXY_HOPS = N  ⇒  زنجیره X-Forwarded-For از **انتها** با N پرش خوانده می‌شود.
 *                              یعنی index = length - N  (و نه مقدار اول که قابل جعل است).
 *
 * وابستگی‌ها فقط به `env.trustedProxyHops` است تا در تست قابل تغییر باشد.
 */

export interface ClientIpSource {
  headers: { get(name: string): string | null };
  ip?: string | null;
  socketRemoteAddress?: string | null;
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

function isIp(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('::ffff:')) return IPV4.test(v.slice(7));
  return IPV4.test(v) || IPV6.test(v);
}

function normalize(value: string): string {
  const v = value.trim();
  return v.startsWith('::ffff:') ? v.slice(7) : v;
}

/** آدرس سوکت — اولویت با ip داخلی Next سپس آدرس سوکت */
function socketIp(source: ClientIpSource): string | null {
  const candidates = [source.ip, source.socketRemoteAddress];
  for (const c of candidates) {
    if (c && isIp(c)) return normalize(c);
  }
  return null;
}

/**
 * گرفتن IP کلاینت.
 * @param source منبع درخواست
 * @param hopsOverride برای تست — مقدار TRUSTED_PROXY_HOPS را بازنویسی می‌کند
 */
export function getClientIp(source: ClientIpSource, hopsOverride?: number): string {
  const hops = hopsOverride ?? env.trustedProxyHops;

  // hop = 0 ⇒ هیچ هدری قابل‌اعتماد نیست؛ فقط IP سوکت
  if (hops <= 0) {
    return socketIp(source) ?? '0.0.0.0';
  }

  const header = source.headers.get('x-forwarded-for');
  if (!header) {
    return socketIp(source) ?? '0.0.0.0';
  }

  // زنجیره: "client, proxy1, proxy2" — سمت راست نزدیک‌ترین پراکسی است
  const chain = header
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '' && isIp(p))
    .map(normalize);

  if (chain.length === 0) {
    return socketIp(source) ?? '0.0.0.0';
  }

  // از انتها با N پرش
  const index = chain.length - hops;
  if (index < 0) {
    // زنجیره کوتاه‌تر از تعداد hop مورد اعتماد ⇒ به سوکت برمی‌گردیم
    return socketIp(source) ?? '0.0.0.0';
  }
  return chain[index];
}
