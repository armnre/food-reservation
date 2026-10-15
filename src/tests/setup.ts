/**
 * راه‌اندازی محیط تست — کلیدها فقط برای تست تولید می‌شوند
 * و هیچ‌وقت در کد برنامه hardcode نشده‌اند.
 */
import { randomBytes } from 'node:crypto';

// vitest خودش NODE_ENV=test را تنظیم می‌کند
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.DATA_HASH_KEY = randomBytes(32).toString('base64');
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/app_db';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
process.env.TRUSTED_PROXY_HOPS = '0';
