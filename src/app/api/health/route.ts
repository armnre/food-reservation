import { NextResponse } from 'next/server';
import { redisHealth } from '@/lib/rate-limit';
import { env, assertProductionReady } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // Redis: در production اجباری (الف-۶)
  const redis = await redisHealth();
  checks.redis = redis;

  let envOk = true;
  let envDetail = 'ok';
  try {
    assertProductionReady();
  } catch (e) {
    envOk = false;
    envDetail = (e as Error).message;
  }
  checks.env = { ok: envOk, detail: envDetail };

  // دیتابیس
  try {
    const { db } = await import('@/db');
    await db.execute(/* sql */ `select 1`);
    checks.database = { ok: true, detail: 'database: ok' };
  } catch (e) {
    checks.database = { ok: false, detail: `database: ${(e as Error).message}` };
  }

  // هشدار پیکربندی پراکسی — در production اگر hop صفر است، همهٔ IPها یکسان دیده می‌شوند
  const proxyHops = env.trustedProxyHops;
  const proxyOk = !env.isProduction || proxyHops > 0;
  checks.proxy = {
    ok: proxyOk,
    detail: proxyOk
      ? `trusted proxy hops: ${proxyHops}`
      : 'TRUSTED_PROXY_HOPS=0 در production همهٔ IPها یکسان دیده می‌شوند',
  };
  const warnings: string[] = [];
  if (!proxyOk) warnings.push('TRUSTED_PROXY_HOPS پشت reverse proxy تنظیم نشده است');

  // در production پیش‌فرض: Redis اجباری (الف-۶) — نبود یا قطع بودن آن ⇒ 503
  const redisRequired = env.redisStrict;
  const healthy = envOk && checks.database.ok;
  const redisGate = redis.ok || !redisRequired;
  const ok = healthy && redisGate;

  return NextResponse.json(
    {
      status: ok ? (redis.ok ? 'ok' : 'degraded') : 'down',
      redisStrict: redisRequired,
      environment: process.env.NODE_ENV ?? 'development',
      checks,
      warnings,
    },
    { status: ok ? 200 : 503 },
  );
}
