import { db } from '@/db';
import { users, studentProfiles, sessions } from '@/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { canManageRole } from '@/lib/permissions';
import { audit } from '@/lib/audit';

/**
 * تغییر وضعیت دانشجویان (فاز ۱-۳) — هستهٔ مستقل از کوکی تا در تست یکپارچه قابل فراخوانی باشد.
 *
 * امنیت:
 *  - فقط هدف‌هایی که واقعاً STUDENT هستند و actor حق مدیریت‌شان را دارد تغییر می‌کنند
 *  - حداکثر ۵۰۰ هدف در هر فراخوانی
 *  - همهٔ تغییرها در یک تراکنش
 */
export interface SetStudentStatusInput {
  actor: { id: string; role: string };
  userIds: string[];
  status: string;
}

const VALID_STATUSES = ['ACTIVE', 'ON_LEAVE', 'WITHDRAWN', 'GRADUATED'] as const;

export async function setStudentStatus(
  input: SetStudentStatusInput,
): Promise<{ ok: true; updated: number; skipped: number } | { ok: false; error: string; skipped?: number }> {
  const parsed = VALID_STATUSES.find((s) => s === input.status);
  if (!parsed) return { ok: false, error: 'وضعیت نامعتبر است' };

  const unique = [...new Set(input.userIds)];
  if (unique.length === 0) return { ok: false, error: 'فهرست خالی است' };
  if (unique.length > 500) return { ok: false, error: 'حداکثر ۵۰۰ دانشجو در هر عملیات مجاز است' };
  if (unique.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    return { ok: false, error: 'شناسهٔ نامعتبر در فهرست' };
  }

  const targets = await db
    .select({ userId: users.id, role: users.role, status: studentProfiles.status })
    .from(studentProfiles)
    .innerJoin(users, eq(users.id, studentProfiles.userId))
    .where(and(inArray(studentProfiles.userId, unique), isNull(users.deletedAt)));

  const allowed = targets.filter(
    (t) => t.role === 'STUDENT' && canManageRole(input.actor.role as never, t.role),
  );
  const blocked = targets.filter(
    (t) => !(t.role === 'STUDENT' && canManageRole(input.actor.role as never, t.role)),
  );
  if (allowed.length === 0) {
    return { ok: false, error: 'هیچ دانشجوی مجازی برای این عملیات یافت نشد', skipped: blocked.length };
  }

  const allowedIds = allowed.map((t) => t.userId);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(studentProfiles)
      .set({ status: parsed, updatedAt: now })
      .where(inArray(studentProfiles.userId, allowedIds));
    await tx
      .update(users)
      .set({ isActive: parsed === 'ACTIVE', updatedAt: now })
      .where(inArray(users.id, allowedIds));
    if (parsed !== 'ACTIVE') {
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(inArray(sessions.userId, allowedIds), isNull(sessions.revokedAt)));
    }
  });

  const beforeByUser = new Map(targets.map((t) => [t.userId, t.status]));
  for (const userId of allowedIds) {
    await audit({
      actor: { id: input.actor.id, role: input.actor.role, ip: null, userAgent: null },
      action: 'student:status_changed',
      entityType: 'student_profile',
      entityId: userId,
      before: { status: beforeByUser.get(userId) ?? null },
      after: { status: parsed },
    });
  }
  return { ok: true, updated: allowedIds.length, skipped: blocked.length };
}
