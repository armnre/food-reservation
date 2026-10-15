/**
 * سماور آرگون۲ — محدودیت هم‌زمانی عملیات hash/verify (فاز ۱-۶).
 *
 * argon2 با memoryCost=۶۴MB و timeCost=۳ پرهزینه است؛ بدون محدودیت،
 * مهاجم با شناسه‌های متفاوت می‌تواند CPU/RAM سرور را پر کند.
 */
const MAX_CONCURRENT = Number(process.env.ARGON2_MAX_CONCURRENT || 4);

let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
}

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

/** اجرای کار سنگین argon2 زیر سماور */
export async function withArgon2Gate<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}


/** پارامترهای argon2 — از env قابل تنظیم (تست‌ها با هزینهٔ کم اجرا می‌شوند) */
export const ARGON2_OPTIONS = {
  type: 2 as const,
  memoryCost: Number(process.env.ARGON2_MEMORY_COST || 65536),
  timeCost: Number(process.env.ARGON2_TIME_COST || 3),
};
