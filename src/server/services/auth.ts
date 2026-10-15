import { verify, hash } from 'argon2';
import { randomInt, randomBytes } from 'node:crypto';
import { db } from '@/db';
import { users, studentProfiles, staffProfiles, sessions, loginAttempts } from '@/db/schema';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { encryptSecret, decryptSecret, blindIndex, safeEqual, hashToken, generateToken } from '@/lib/crypto';
import { normalizeNationalCode, normalizeStudentNumber, validatePersonalPassword, generateTemporaryPassword, toLatinDigits } from '@/lib/validation';
import { kvGet, kvSet, kvDel, kvIncrWindow, kvTake, kvTtl } from '@/lib/rate-limit';
import { audit, actorFromUser, type AuditActor } from '@/lib/audit';
import { env } from '@/lib/env';

/* ───────────── ثابت‌ها ───────────── */

export const LOCK_WINDOW_SECONDS = 15 * 60; // ۱۵ دقیقه
export const LOCK_THRESHOLD = 5; // ۵ تلاش ناموفق روی (شناسه + IP)
export const CAPTCHA_FROM_ATTEMPT = 3; // کپچا از تلاش سوم
export const SUSPICIOUS_THRESHOLD = 30; // بیش از ۳۰ شکست در ۱۵ دقیقه روی حساب

/**
 * hash ساختگی و ثابت — برای کاربر ناموجود هم argon2.verify اجرا می‌شود
 * تا زمان پاسخ یکسان باشد (بدون نشت وجود/نبود حساب).
 * مقدار از یک فرآیند یک‌بار ثبت‌شده نمی‌آید؛ خودش در اولین نیاز ساخته می‌شود.
 */
let dummyHashPromise: Promise<string> | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hash(randomBytes(32).toString('hex'), {
      type: 2,
      memoryCost: 65536,
      timeCost: 3,
    });
  }
  return dummyHashPromise;
}

async function burnVerifyTime(password: string): Promise<false> {
  try {
    await verify(await getDummyHash(), password);
  } catch {
    /* ignore */
  }
  return false;
}

/* ───────────── کلیدهای شمارش ───────────── */

function attemptKey(identifier: string, ip: string): string {
  return `login:attempt:${identifier}|${ip}`;
}
function accountKey(identifier: string): string {
  return `login:account:${identifier}`;
}
function captchaKey(identifier: string, ip: string): string {
  return `captcha:${identifier}|${ip}`;
}

/* ───────────── کپچا ───────────── */

export interface CaptchaChallenge {
  token: string;
  question: string;
}

const CAPTCHA_OPERATORS = [
  { sym: '+', fn: (a: number, b: number) => a + b },
  { sym: '−', fn: (a: number, b: number) => a - b },
  { sym: '×', fn: (a: number, b: number) => a * b },
] as const;

export async function issueCaptcha(identifier: string, ip: string): Promise<CaptchaChallenge> {
  const a = randomInt(2, 9);
  const b = randomInt(2, 9);
  const op = CAPTCHA_OPERATORS[randomInt(0, CAPTCHA_OPERATORS.length)];
  const answer = String(op.fn(a, b));
  const token = generateToken(16);
  await kvSet(`captcha:answer:${token}`, answer, 600);
  await kvSet(captchaKey(identifier, ip), token, 600);
  return { token, question: `${a} ${op.sym} ${b} چند می‌شود؟` };
}

export async function verifyCaptcha(identifier: string, ip: string, token: string, answer: string): Promise<boolean> {
  const expectedToken = await kvGet(captchaKey(identifier, ip));
  if (!expectedToken || !safeEqual(expectedToken, token)) return false;
  const expected = await kvTake(`captcha:answer:${token}`);
  if (!expected) return false;
  return safeEqual(expected, toLatinDigits(answer.trim()));
}

export async function isCaptchaRequired(identifier: string, ip: string): Promise<boolean> {
  const count = Number((await kvGet(attemptKey(identifier, ip))) ?? '0');
  return count >= CAPTCHA_FROM_ATTEMPT - 1;
}

/* ───────────── قفل (الف-۳) ───────────── */

export interface LockState {
  locked: boolean;
  remainingSeconds: number;
  attempts: number;
  captchaRequired: boolean;
  suspicious: boolean;
}

export async function getLockState(identifier: string, ip: string): Promise<LockState> {
  const key = attemptKey(identifier, ip);
  const raw = await kvGet(key);
  const attempts = Number(raw ?? '0');
  const locked = attempts >= LOCK_THRESHOLD;
  const remainingSeconds = locked ? await kvTtl(key) : 0;
  const accountFailures = Number((await kvGet(accountKey(identifier))) ?? '0');
  return {
    locked,
    remainingSeconds,
    attempts,
    captchaRequired: accountFailures >= CAPTCHA_FROM_ATTEMPT - 1,
    suspicious: accountFailures >= SUSPICIOUS_THRESHOLD,
  };
}

async function registerFailure(identifier: string, ip: string, actor: AuditActor): Promise<LockState> {
  const attempts = await kvIncrWindow(attemptKey(identifier, ip), LOCK_WINDOW_SECONDS);
  const accountFailures = await kvIncrWindow(accountKey(identifier), LOCK_WINDOW_SECONDS);
  // برای نمایش باقی‌مانده قفل
  await kvSet(`${attemptKey(identifier, ip)}:ttl`, String(LOCK_WINDOW_SECONDS), LOCK_WINDOW_SECONDS);

  if (accountFailures === SUSPICIOUS_THRESHOLD + 1) {
    await audit({
      actor,
      action: 'auth:suspicious_activity',
      entityType: 'login',
      entityId: null,
      after: { identifier, ip, failuresInWindow: accountFailures },
    });
  }

  return {
    locked: attempts >= LOCK_THRESHOLD,
    remainingSeconds: LOCK_WINDOW_SECONDS,
    attempts,
    captchaRequired: accountFailures >= CAPTCHA_FROM_ATTEMPT - 1,
    suspicious: accountFailures >= SUSPICIOUS_THRESHOLD,
  };
}

async function registerSuccess(identifier: string, ip: string): Promise<void> {
  await kvDel(attemptKey(identifier, ip));
  await kvDel(`${attemptKey(identifier, ip)}:ttl`);
  await kvDel(captchaKey(identifier, ip));
}

/** فقط برای تست‌ها */
export async function resetLoginCounters(identifier: string, ip: string): Promise<void> {
  await registerSuccess(identifier, ip);
}

/* ───────────── انواع ───────────── */

export type LoginKind = 'STUDENT' | 'STAFF';

export interface LoginInput {
  kind: LoginKind;
  identifier: string;
  password: string;
  ip: string;
  userAgent?: string | null;
  captchaToken?: string | null;
  captchaAnswer?: string | null;
}

export type LoginOutcome =
  | { ok: true; userId: string; mustChangePassword: boolean; redirectTo: string; token: string }
  | { ok: false; error: string; lock: LockState; captcha?: CaptchaChallenge };

/** پیام خطای یکسان برای همه‌ی حالت‌ها — بدون لو دادن اینکه کدام فیلد اشتباه است */
const GENERIC_ERROR = 'نام کاربری یا رمز عبور اشتباه است';

/* ───────────── ورود ───────────── */

export async function login(input: LoginInput): Promise<LoginOutcome> {
  const identifier = toLatinDigits(input.identifier).trim();
  const actor: AuditActor = { id: null, role: null, ip: input.ip, userAgent: input.userAgent ?? null };
  const [attempt] = await db.insert(loginAttempts).values({identifier,ip:input.ip,success:false}).returning({id:loginAttempts.id});
  const lock = await getLockState(identifier,input.ip);
  if(lock.locked) return {ok:false,error:'تلاش‌های ورود از این دستگاه بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر تلاش کنید.',lock};
  if(lock.captchaRequired && (!input.captchaToken||!input.captchaAnswer||!await verifyCaptcha(identifier,input.ip,input.captchaToken,input.captchaAnswer))){
    return {ok:false,error:'برای ادامه، پاسخ امنیتی را درست وارد کنید.',lock,captcha:await issueCaptcha(identifier,input.ip)};
  }
  const [user] = await db.select().from(users).where(and(eq(users.username,identifier),isNull(users.deletedAt))).limit(1);
  const [student] = user?.role==='STUDENT' ? await db.select().from(studentProfiles).where(eq(studentProfiles.userId,user.id)).limit(1) : [];
  let valid = false;
  if(user?.passwordHash){try{valid=await verify(user.passwordHash,input.password)}catch{valid=false}}
  else {await burnVerifyTime(input.password);if(user?.role==='STUDENT'&&student&&user.mustChangePassword){valid=safeEqual(blindIndex(toLatinDigits(input.password).trim()),student.nationalCodeHash)}}
  const kindMatches = user && (input.kind==='STUDENT'?user.role==='STUDENT':user.role!=='STUDENT');
  if(!valid||!kindMatches){
    const next = await registerFailure(identifier,input.ip,actor);
    if(user) await db.update(users).set({failedLoginCount:sql`${users.failedLoginCount}+1`,updatedAt:new Date()}).where(eq(users.id,user.id));
    await audit({actor,action:'auth:login_failed',entityType:'login',after:{identifier}});
    return {ok:false,error:GENERIC_ERROR,lock:next,captcha:next.captchaRequired?await issueCaptcha(identifier,input.ip):undefined};
  }
  if(!user.isActive||(student&&student.status!=='ACTIVE'))return {ok:false,error:'حساب شما فعال نیست؛ به معاونت دانشجویی مراجعه کنید.',lock};
  const token=generateToken(32);const mustChange=user.mustChangePassword||user.passwordHash===null;
  await db.transaction(async tx=>{
    await tx.insert(sessions).values({userId:user.id,tokenHash:hashToken(token),ip:input.ip,userAgent:input.userAgent??null,expiresAt:new Date(Date.now()+env.sessionTtlHours*3600000)});
    await tx.update(users).set({lastLoginAt:new Date(),failedLoginCount:0,lockedUntil:null,mustChangePassword:mustChange,updatedAt:new Date()}).where(eq(users.id,user.id));
    await tx.update(loginAttempts).set({success:true}).where(eq(loginAttempts.id,attempt.id));
  });
  await registerSuccess(identifier,input.ip);
  await audit({actor:{...actor,id:user.id,role:user.role},action:'auth:login_success',entityType:'user',entityId:user.id});
  return {ok:true,userId:user.id,mustChangePassword:mustChange,redirectTo:mustChange?'/change-password':defaultHomeForRole(user.role),token};
}

export function defaultHomeForRole(role: string): string {
  switch (role) {
    case 'STUDENT': return '/student';
    case 'STAFF': return '/staff';
    case 'VICE_STUDENT': return '/vice';
    case 'NUTRITION_MANAGER': return '/nutrition';
    case 'CAFETERIA_OPERATOR': return '/cafeteria';
    case 'SUPER_ADMIN': return '/admin';
    default: return '/login';
  }
}

/* ───────────── نشست ───────────── */

export async function getSessionUser(token: string | undefined | null) {
  if (!token) return null;
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(sessions.revokedAt),isNull(users.deletedAt),eq(users.isActive,true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? sql`${sessions.id} <> ${exceptSessionId}` : sql`TRUE`,
      ),
    );
  return result.rowCount ?? 0;
}

export async function touchSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + env.sessionTtlHours * 3600 * 1000) }).where(eq(sessions.id, sessionId));
}

/* ───────────── تعویض رمز ───────────── */

export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string, actor: AuditActor) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return { ok: false as const, error: 'کاربر یافت نشد' };

  let currentOk = false;
  if (user.passwordHash === null) {
    return { ok: false as const, error: 'برای تعیین رمز شخصی، ابتدا باید با کد ملی وارد شوید' };
  }
  currentOk = await verify(user.passwordHash, currentPassword);
  if (!currentOk) return { ok: false as const, error: 'رمز فعلی اشتباه است' };

  const studentRows = await db.select({ nc: studentProfiles.nationalCode, sn: studentProfiles.studentNumber })
    .from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  let nationalCode: string | null = null;
  if (studentRows[0]) {
    try { nationalCode = decryptSecret(studentRows[0].nc); } catch { nationalCode = null; }
  }

  const problem = validatePersonalPassword(newPassword, {
    nationalCode,
    studentNumber: studentRows[0]?.sn ?? null,
  });
  if (problem) return { ok: false as const, error: problem };

  await db.update(users).set({
    passwordHash: await hash(newPassword, { type: 2, memoryCost: 65536, timeCost: 3 }),
    mustChangePassword: false,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  await audit({ actor, action: 'auth:password_changed', entityType: 'user', entityId: userId });
  return { ok: true as const };
}

/** تعیین رمز شخصی برای اولین ورود (بدون نیاز به رمز فعلی) */
export async function setInitialPassword(userId: string, newPassword: string, actor: AuditActor) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return { ok: false as const, error: 'کاربر یافت نشد' };
  if (!user.mustChangePassword) return {ok:false as const,error:'این حساب به تعیین رمز اولیه نیاز ندارد'};

  const studentRows = await db.select({ nc: studentProfiles.nationalCode, sn: studentProfiles.studentNumber })
    .from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  let nationalCode: string | null = null;
  if (studentRows[0]) {
    try { nationalCode = decryptSecret(studentRows[0].nc); } catch { nationalCode = null; }
  }

  const problem = validatePersonalPassword(newPassword, {
    nationalCode,
    studentNumber: studentRows[0]?.sn ?? null,
  });
  if (problem) return { ok: false as const, error: problem };

  await db.update(users).set({
    passwordHash: await hash(newPassword, { type: 2, memoryCost: 65536, timeCost: 3 }),
    mustChangePassword: false,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  await audit({ actor, action: 'auth:password_changed', entityType: 'user', entityId: userId, after: { kind: 'initial' } });
  return { ok: true as const };
}

/* ───────────── ریست رمز (الف-۴ب) ───────────── */

export async function resetStudentPassword(userId: string, actor: AuditActor) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return { ok: false as const, error: 'کاربر یافت نشد' };

  await db.update(users).set({
    passwordHash: null,
    mustChangePassword: true,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  const revoked = await revokeAllSessions(userId);
  await audit({
    actor,
    action: 'student:reset_password',
    entityType: 'user',
    entityId: userId,
    before: { mustChangePassword: user.mustChangePassword },
    after: { passwordHash: null, mustChangePassword: true, revokedSessions: revoked },
  });
  return { ok: true as const, revoked };
}

export async function resetStaffPassword(userId: string, actor: AuditActor) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return { ok: false as const, error: 'کاربر یافت نشد' };

  const temporary = generateTemporaryPassword(10);
  await db.update(users).set({
    passwordHash: await hash(temporary, { type: 2, memoryCost: 65536, timeCost: 3 }),
    mustChangePassword: true,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  const revoked = await revokeAllSessions(userId);
  await audit({
    actor,
    action: 'auth:password_reset',
    entityType: 'user',
    entityId: userId,
    after: { revokedSessions: revoked },
  });
  return { ok: true as const, temporary, revoked };
}

export { encryptSecret, decryptSecret, blindIndex };
