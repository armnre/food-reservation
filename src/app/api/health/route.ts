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
    },
    { status: ok ? 200 : 503 },
  );
}
