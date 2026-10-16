import { describe, it, expect, afterAll } from 'vitest';
import { db, pool } from '@/db';
import { users, loginAttempts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { hash } from 'argon2';
import { ARGON2_OPTIONS } from '@/lib/argon2-gate';
import {
  login,
  resetLoginCounters,
  IDENTIFIER_MAX_LENGTH,
  type CaptchaChallenge,
} from '@/server/services/auth';
import { closePool } from './helpers';

/**
 * فاز ۱-۶ — قفل ورود دو لایه و رد زودهنگام ورودی نامعتبر.
 */

/** حل کپچای ریاضی از متن سؤال — برای شبیه‌سازی کاربر واقعی */
function solveCaptcha(question: string): string {
  const m = question.match(/(\d+)\s*([+−×])\s*(\d+)/);
  if (!m) throw new Error(`کپچای قابل‌پارس نیست: ${question}`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (m[2] === '+') return String(a + b);
  if (m[2] === '−') return String(a - b);
  return String(a * b);
}

/** ورود ناموفق با پاسخ خودکار کپچا — تا ثبت شکست واقعی */
async function failLogin(identifier: string, ip: string, captcha?: CaptchaChallenge) {
  const r = await login({
    kind: 'STAFF',
    identifier,
    password: 'Wrong@1',
    ip,
    captchaToken: captcha?.token,
    captchaAnswer: captcha ? solveCaptcha(captcha.question) : undefined,
  });
  return r;
}

async function createLoginUser(username: string) {
  const [u] = await db
    .insert(users)
    .values({
      role: 'STAFF',
      username,
      passwordHash: await hash('Correct@12345', ARGON2_OPTIONS),
      mustChangePassword: false,
      isActive: true,
      displayName: 'کاربر تست قفل',
    })
    .returning();
  return u;
}

describe('قفل ورود دو لایه', () => {
  it('۵ شکست از IP الف ← قفل؛ همان شناسه از IP ب ← قفل نیست و ورود موفق', async () => {
    const u = await createLoginUser(`lockuser${Date.now()}`);
    const ipA = '10.0.0.1';
    const ipB = '10.0.0.2';

    // ۵ شکست از IP الف — با پاسخ خودکار کپچا (بدون آن، شکست ثبت نمی‌شود)
    let captcha: CaptchaChallenge | undefined;
    for (let i = 0; i < 5; i++) {
      const r = await failLogin(u.username, ipA, captcha);
      expect(r.ok).toBe(false);
      if (!r.ok && r.captcha) captcha = r.captcha;
    }

    // تلاش ششم از همان IP → قفل
    const locked = await login({
      kind: 'STAFF',
      identifier: u.username,
      password: 'Correct@12345',
      ip: ipA,
      captchaToken: captcha?.token,
      captchaAnswer: captcha ? solveCaptcha(captcha.question) : undefined,
    });
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.lock.locked).toBe(true);
      expect(locked.error).toContain('بیش از حد مجاز');
    }

    // همان شناسه از IP دیگر → قفل نیست؛ فقط کپچای سطح-حساب (افزایش سختی، نه قفل کامل)
    const firstB = await login({ kind: 'STAFF', identifier: u.username, password: 'Correct@12345', ip: ipB });
    expect(firstB.ok).toBe(false);
    let captchaB: CaptchaChallenge | undefined;
    if (!firstB.ok && firstB.captcha) captchaB = firstB.captcha;

    const fromB = await login({
      kind: 'STAFF',
      identifier: u.username,
      password: 'Correct@12345',
      ip: ipB,
      captchaToken: captchaB?.token,
      captchaAnswer: captchaB ? solveCaptcha(captchaB.question) : undefined,
    });
    expect(fromB.ok).toBe(true);

    await resetLoginCounters(u.username, ipA);
    await resetLoginCounters(u.username, ipB);
  });

  it('ورودی بلندتر از سقف ← رد بدون درج در login_attempts', async () => {
    const longId = 'x'.repeat(IDENTIFIER_MAX_LENGTH + 10);
    const before = await db.select().from(loginAttempts).where(eq(loginAttempts.identifier, longId));

    const r = await login({ kind: 'STAFF', identifier: longId, password: 'whatever', ip: '10.0.0.3' });
    expect(r.ok).toBe(false);

    const after = await db.select().from(loginAttempts).where(eq(loginAttempts.identifier, longId));
    expect(after.length).toBe(before.length); // هیچ ردیفی درج نشد
  });

  it('ورودی خالی ← رد بدون درج', async () => {
    const before = await db.select().from(loginAttempts);
    const r = await login({ kind: 'STAFF', identifier: '', password: 'x', ip: '10.0.0.4' });
    expect(r.ok).toBe(false);
    const after = await db.select().from(loginAttempts);
    expect(after.length).toBe(before.length);
  });

  it('شکست‌ها شمارندهٔ موفقیت را خراب نمی‌کنند — ورود موفق پس از شکست کار می‌کند', async () => {
    const u = await createLoginUser(`succuser${Date.now()}`);
    const ip = '10.0.0.5';
    await login({ kind: 'STAFF', identifier: u.username, password: 'nope', ip });
    const ok = await login({ kind: 'STAFF', identifier: u.username, password: 'Correct@12345', ip });
    expect(ok.ok).toBe(true);
    // ردیف login_attempts موفق ثبت شده
    const attempts = await db
      .select()
      .from(loginAttempts)
      .where(and(eq(loginAttempts.identifier, u.username), eq(loginAttempts.success, true)));
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    await resetLoginCounters(u.username, ip);
  });
});

afterAll(async () => {
  await closePool();
});
