import { NextResponse } from 'next/server';
import { apiAuth } from '@/server/dal/auth';
import { revokeAllSessions, revokeSession } from '@/server/services/auth';
import { env } from '@/lib/env';
import { getClientIp } from '@/lib/client-ip';
import { audit, actorFromUser } from '@/lib/audit';

export async function POST(request: Request) {
  const auth = await apiAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const allDevices = body.allDevices === true;

  if (allDevices) {
    const count = await revokeAllSessions(auth.ctx.user.id);
    await audit({
      actor: actorFromUser(auth.ctx.user, {
        ip: getClientIp(request as unknown as { headers: Headers; ip?: string | null }),
        userAgent: request.headers.get('user-agent'),
      }),
      action: 'auth:logout_all',
      entityType: 'user',
      entityId: auth.ctx.user.id,
      after: { revoked: count },
    });
  } else {
    await revokeSession(auth.ctx.user.sessionId);
  }

  const response = NextResponse.json({ ok: true, revokedAll: allDevices });
  response.cookies.set(env.sessionCookieName, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
