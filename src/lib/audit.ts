import { db } from '@/db';
import { auditLogs } from '@/db/schema';

export type AuditAction =
  | 'auth:login_success'
  | 'auth:login_failed'
  | 'auth:locked'
  | 'auth:suspicious_activity'
  | 'auth:password_changed'
  | 'auth:password_reset'
  | 'auth:session_revoked'
  | 'auth:logout_all'
  | 'user:created'
  | 'user:updated'
  | 'user:deactivated'
  | 'user:activated'
  | 'user:role_changed'
  | 'student:national_code_revealed'
  | 'student:status_changed'
  | 'student:created'
  | 'student:updated'
  | 'student:reset_password'
  | 'staff:created'
  | 'staff:updated'
  | 'staff:credentials_exported'
  | 'import:previewed'
  | 'import:committed'
  | 'import:undone'
  | 'import:conflict_overridden'
  | 'customer_group:updated'
  | 'food:created'
  | 'food:updated'
  | 'food:activated'
  | 'food:deactivated'
  | 'meal_slot:created'
  | 'meal_slot:updated'
  | 'menu_item:created'
  | 'menu_item:updated'
  | 'menu_item:removed'
  | 'menu:published'
  | 'menu:closed'
  | 'menu:reverted'
  | 'menu:window_updated'
  | 'menu:copied'
  | 'reservation:created'
  | 'reservation:cancelled'
  | 'reservation:used'
  | 'wallet:credited'
  | 'wallet:debited'
  | 'payment:initiated'
  | 'payment:completed'
  | 'payment:failed'
  | 'withdrawal:requested'
  | 'withdrawal:approved'
  | 'withdrawal:rejected';

export interface AuditActor {
  id: string | null;
  role: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * helper واحد ثبت لاگ — همه‌ی سرویس‌ها باید از همین استفاده کنند.
 * جدول append-only است (trigger دیتابیس از UPDATE/DELETE جلوگیری می‌کند).
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: input.actor.id,
      actorRole: (input.actor.role as never) ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before === undefined ? null : (input.before as never),
      after: input.after === undefined ? null : (input.after as never),
      ip: input.actor.ip ?? null,
      userAgent: input.actor.userAgent ?? null,
    });
  } catch (err) {
    // لاگ نباید عملیات اصلی را بشکند؛ ولی خطا را بی‌صدا رها نمی‌کنیم
    console.error('[audit] failed to write audit log', err);
    throw err;
  }
}

export function actorFromUser(
  user: { id: string; role: string } | null,
  meta?: { ip?: string | null; userAgent?: string | null },
): AuditActor {
  return {
    id: user?.id ?? null,
    role: user?.role ?? null,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  };
}
