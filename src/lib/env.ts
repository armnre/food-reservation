import { config } from 'dotenv';
/** Environment always takes precedence. The local ignored file preserves sandbox keys. */
config({ path: 'secrets.env', quiet: true });

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new EnvError(`متغیر محیطی ${name} تنظیم نشده است`);
  return value;
}

function key(name: string) {
  const bytes = Buffer.from(required(name), 'base64');
  if (bytes.length !== 32) throw new EnvError(`${name} باید ۳۲ بایت base64 باشد`);
  return bytes;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new EnvError(`${name} باید عدد صحیح بین ${min} و ${max} باشد`);
  }
  return n;
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get redisUrl() {
    return required('REDIS_URL');
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },

  /** REDIS_STRICT=true (پیش‌فرض در production) نبود Redis را خطای ۵۰۳ می‌کند؛ false فقط وقتی Redis واقعاً در دسترس نیست. */
  get redisStrict() {
    if (process.env.REDIS_STRICT !== undefined) return process.env.REDIS_STRICT === 'true';
    return process.env.NODE_ENV === 'production';
  },

  get dataEncryptionKey() {
    return key('DATA_ENCRYPTION_KEY');
  },
  get dataHashKey() {
    return key('DATA_HASH_KEY');
  },

  get trustedProxyHops() {
    const n = Number(process.env.TRUSTED_PROXY_HOPS || 0);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new EnvError('TRUSTED_PROXY_HOPS نامعتبر است');
    return n;
  },

  /** TTL اسلایدینگ نشست — از متغیر محیطی، پیش‌فرض ۸ ساعت */
  get sessionTtlHours() {
    return intEnv('SESSION_TTL_HOURS', 8, 1, 72);
  },

  /** سقف مطلق عمر نشست از لحظهٔ ورود — تمدید اسلایدینگ هرگز از آن عبور نمی‌کند */
  get sessionAbsoluteTtlHours() {
    return intEnv('SESSION_ABSOLUTE_TTL_HOURS', 24, 1, 168);
  },

  get sessionCookieName() {
    return process.env.SESSION_COOKIE_NAME || 'hm_sofreh_session';
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || './uploads';
  },
};

export function assertProductionReady() {
  env.databaseUrl;
  env.dataEncryptionKey;
  env.dataHashKey;
  if (env.isProduction) env.redisUrl;
}
