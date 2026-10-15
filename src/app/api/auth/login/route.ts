import { NextResponse } from 'next/server';
import { login, issueCaptcha, getLockState, type LoginKind } from '@/server/services/auth';
import { getClientIp } from '@/lib/client-ip';
import { env } from '@/lib/env';
import { db } from '@/db';
import { systemSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

const GENERIC_ERROR = 'نام کاربری یا رمز عبور اشتباه است';

export async function POST(request: Request) {
  const ip = getClientIp(request as unknown as { headers: Headers; ip?: string | null });
  const userAgent = request.headers.get('user-agent');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'درخواست نامعتبر است' }, { status: 400 });
  }

  const kind = body.kind === 'STAFF' ? 'STAFF' : 'STUDENT';
  const identifier = String(body.identifier ?? '').trim();
  const password = String(body.password ?? '');

  if (!identifier || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const result = await login({
    kind: kind as LoginKind,
    identifier,
    password,
    ip,
    userAgent,
    captchaToken: body.captchaToken ? String(body.captchaToken) : null,
    captchaAnswer: body.captchaAnswer ? String(body.captchaAnswer) : null,
  });

  if (!result.ok) {
    const payload: Record<string, unknown> = {
      error: result.error,
      captchaRequired: result.lock.captchaRequired,
      locked: result.lock.locked,
    };
    if (result.captcha) {
      payload.captcha = result.captcha;
    }
    return NextResponse.json(payload, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    mustChangePassword: result.mustChangePassword,
    redirectTo: result.redirectTo,
  });

  response.cookies.set(env.sessionCookieName, result.token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionTtlHours * 3600,
  });

  return response;
}

/** برای فرم ورود: آیا کپچا لازم است؟ */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const identifier = url.searchParams.get('identifier') ?? '';
  const ip = getClientIp(request as unknown as { headers: Headers; ip?: string | null });

  if (!identifier) {
    return NextResponse.json({ captchaRequired: false });
  }

  const lock = await getLockState(identifier, ip);
  const payload: Record<string, unknown> = {
    captchaRequired: lock.captchaRequired,
    locked: lock.locked,
  };
  if (lock.captchaRequired) {
    payload.captcha = await issueCaptcha(identifier, ip);
  }
  return NextResponse.json(payload);
}

/** نام سامانه برای نمایش در صفحه ورود — از system_settings */
export const dynamic = 'force-dynamic';

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

// نگه‌داشتن ارجاع به db تا در build درخت‌کشی نشود
export async function OPTIONS() {
  await db.select().from(systemSettings).where(eq(systemSettings.key, 'brand'));
  return new NextResponse(null, { status: 200 });
}
