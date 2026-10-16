import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { env } from '@/lib/env';
import { getSessionUser, touchSession } from '@/server/services/auth';
import { ROLES, type Role, hasPermission } from '@/lib/permissions';

export interface AuthedUser {
  id: string;
  role: Role;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
  isActive: boolean;
  sessionId: string;
}

export interface AuthContext {
  user: AuthedUser;
  token: string;
}

/**
 * گرفتن کاربر جاری (کش‌شده در یک درخواست).
 * هیچ‌وقت null برنمی‌گرداند — در صورت نبود نشست redirect می‌کند.
 */
export const getCurrentUser = cache(
  async (opts?: { allowPasswordChangePage?: boolean }): Promise<AuthContext> => {
    const store = await cookies();
    const token = store.get(env.sessionCookieName)?.value;
    if (!token) redirect('/login');

    const row = await getSessionUser(token);
    if (!row) redirect('/login');

    if (!row.user.isActive) {
      redirect('/login?error=disabled');
    }

    await touchSession(row.session.id);

    const user: AuthedUser = {
      id: row.user.id,
      role: row.user.role as Role,
      username: row.user.username,
      displayName: row.user.displayName,
      mustChangePassword: row.user.mustChangePassword || row.user.passwordHash === null,
      isActive: row.user.isActive,
      sessionId: row.session.id,
    };

    return { user, token };
  },
);

/**
 * گارد نقش — پیش‌فرض: رد.
 * در صفحه/DAL صدا زده می‌شود (لایه اول proxy نیست).
 */
export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await getCurrentUser();

  if (ctx.user.mustChangePassword) {
    // تا تعویض رمز، هیچ صفحه‌ای جز /change-password در دسترس نیست
    redirect('/change-password');
  }

  if (!roles.includes(ctx.user.role)) {
    redirect('/403');
  }
  return ctx;
}

/** گارد مجوز — از ماتریس واحد permissions.ts */
export async function requirePermission(permission: string): Promise<AuthContext> {
  const ctx = await getCurrentUser();

  if (ctx.user.mustChangePassword) redirect('/change-password');

  if (!hasPermission(ctx.user.role, permission)) {
    redirect('/403');
  }
  return ctx;
}

/** فقط برای API: نقش را چک می‌کند ولی redirect نمی‌کند */
export async function apiAuth(
  ...roles: Role[]
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; status: 401 | 403; error: string }> {
  const store = await cookies();
  const token = store.get(env.sessionCookieName)?.value;
  if (!token) return { ok: false, status: 401, error: 'نشست معتبر نیست' };

  const row = await getSessionUser(token);
  if (!row || !row.user.isActive) return { ok: false, status: 401, error: 'نشست معتبر نیست' };

  const ctx: AuthContext = {
    user: {
      id: row.user.id,
      role: row.user.role as Role,
      username: row.user.username,
      displayName: row.user.displayName,
      mustChangePassword: row.user.mustChangePassword || row.user.passwordHash === null,
      isActive: row.user.isActive,
      sessionId: row.session.id,
    },
    token,
  };

  if (roles.length > 0 && !roles.includes(ctx.user.role)) {
    return { ok: false, status: 403, error: 'دسترسی مجاز نیست' };
  }
  return { ok: true, ctx };
}

export { ROLES };
