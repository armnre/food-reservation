import { db } from '@/db';
import {
  users,
  studentProfiles,
  staffProfiles,
  sessions,
  importBatches,
  importRows,
  auditLogs,
  systemSettings,
} from '@/db/schema';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, count, type SQL } from 'drizzle-orm';
import { requireRole, apiAuth, type AuthContext } from './auth';
import { ROLES } from '@/lib/permissions';
import { decryptSecret, maskNationalCode, blindIndex } from '@/lib/crypto';
import { toJalaliDateTime } from '@/lib/jalali';

/* ───────────── دانشجویان ───────────── */

export interface StudentListFilters {
  q?: string;
  status?: string;
  faculty?: string;
  entryYear?: string;
  page?: number;
  pageSize?: number;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

export interface StudentListItem {
  userId: string;
  studentNumber: string;
  displayName: string;
  firstName: string;
  lastName: string;
  faculty: string | null;
  major: string | null;
  entryYear: number | null;
  status: string;
  mobile: string | null;
  nationalCodeMasked: string;
  lastLoginAt: string | null;
  isActive: boolean;
}

export async function listStudents(filters: StudentListFilters) {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));
  const conditions: (SQL | undefined)[] = [isNull(users.deletedAt)];

  if (filters.q && filters.q.trim() !== '') {
    const q = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(studentProfiles.firstName, q),
        ilike(studentProfiles.lastName, q),
        ilike(studentProfiles.studentNumber, q),
        ilike(users.displayName, q),
        sql`${studentProfiles.nationalCodeHash} = ${blindIndex(q.replace(/%/g, ''))}`,
      ),
    );
  }
  if (filters.status && filters.status !== 'ALL') {
    conditions.push(eq(studentProfiles.status, filters.status as never));
  }
  if (filters.faculty && filters.faculty !== 'ALL') {
    conditions.push(eq(studentProfiles.faculty, filters.faculty));
  }
  if (filters.entryYear && filters.entryYear !== 'ALL') {
    conditions.push(eq(studentProfiles.entryYear, Number.parseInt(filters.entryYear, 10)));
  }

  const where = and(...conditions);

  const sortColumn =
    filters.sortKey === 'studentNumber'
      ? studentProfiles.studentNumber
      : filters.sortKey === 'firstName'
        ? studentProfiles.firstName
        : filters.sortKey === 'lastName'
          ? studentProfiles.lastName
          : filters.sortKey === 'entryYear'
            ? studentProfiles.entryYear
            : filters.sortKey === 'status'
              ? studentProfiles.status
              : studentProfiles.createdAt;

  const order = filters.sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const [totalRow] = await db
    .select({ value: count() })
    .from(studentProfiles)
    .innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(where);

  const rows = await db
    .select({
      userId: users.id,
      studentNumber: studentProfiles.studentNumber,
      displayName: users.displayName,
      firstName: studentProfiles.firstName,
      lastName: studentProfiles.lastName,
      faculty: studentProfiles.faculty,
      major: studentProfiles.major,
      entryYear: studentProfiles.entryYear,
      status: studentProfiles.status,
      mobile: users.mobile,
      nationalCode: studentProfiles.nationalCode,
      lastLoginAt: users.lastLoginAt,
      isActive: users.isActive,
    })
    .from(studentProfiles)
    .innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(where)
    .orderBy(order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items: StudentListItem[] = rows.map((r) => ({
    ...r,
    nationalCodeMasked: safeMask(r.nationalCode),
    lastLoginAt: r.lastLoginAt ? toJalaliDateTime(r.lastLoginAt) : null,
  }));

  return {
    items,
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
    ctx,
  };
}

function safeMask(encrypted: string | null): string {
  if (!encrypted) return '****';
  try {
    return maskNationalCode(decryptSecret(encrypted));
  } catch {
    return '****';
  }
}

export async function getStudentDetail(userId: string) {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);

  const rows = await db
    .select({
      user: users,
      student: studentProfiles,
    })
    .from(studentProfiles)
    .innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(and(eq(studentProfiles.userId, userId), isNull(users.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return { found: false as const, ctx };

  const sessionRows = await db
    .select({
      id: sessions.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      revokedAt: sessions.revokedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt))
    .limit(20);

  const timeline = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(30);

  return {
    found: true as const,
    ctx,
    user: {
      id: row.user.id,
      username: row.user.username,
      displayName: row.user.displayName,
      role: row.user.role,
      isActive: row.user.isActive,
      mustChangePassword: row.user.mustChangePassword,
      mobile: row.user.mobile,
      lastLoginAt: row.user.lastLoginAt ? toJalaliDateTime(row.user.lastLoginAt) : null,
      createdAt: toJalaliDateTime(row.user.createdAt),
    },
    student: {
      studentNumber: row.student.studentNumber,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      faculty: row.student.faculty,
      major: row.student.major,
      entryYear: row.student.entryYear,
      status: row.student.status,
      customerGroup: row.student.customerGroup,
      nationalCodeMasked: safeMask(row.student.nationalCode),
    },
    sessions: sessionRows.map((s) => ({
      id: s.id,
      ip: s.ip,
      device: (s.userAgent ?? '').slice(0, 80),
      createdAt: toJalaliDateTime(s.createdAt),
      lastSeenAt: toJalaliDateTime(s.lastSeenAt),
      active: s.revokedAt === null && s.expiresAt.getTime() > Date.now(),
    })),
    timeline: timeline.map((t) => ({
      id: t.id,
      action: t.action,
      actorRole: t.actorRole,
      createdAt: toJalaliDateTime(t.createdAt),
    })),
  };
}

/** نمایش کد ملی کامل — همیشه در لاگ ثبت می‌شود */
export async function revealNationalCode(
  userId: string,
  actorMeta: { ip?: string | null; userAgent?: string | null },
) {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
  const rows = await db
    .select({ nc: studentProfiles.nationalCode, studentNumber: studentProfiles.studentNumber })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  if (!rows[0]) return { found: false as const };

  const { audit } = await import('@/lib/audit');
  await audit({
    actor: { id: ctx.user.id, role: ctx.user.role, ip: actorMeta.ip, userAgent: actorMeta.userAgent },
    action: 'student:national_code_revealed',
    entityType: 'student_profile',
    entityId: userId,
    after: { studentNumber: rows[0].studentNumber },
  });

  return { found: true as const, nationalCode: decryptSecret(rows[0].nc) };
}

export async function getStudentFaculties(): Promise<string[]> {
  await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
  const rows = await db
    .selectDistinct({ faculty: studentProfiles.faculty })
    .from(studentProfiles)
    .where(isNull(studentProfiles.deletedAt));
  return rows
    .map((r) => r.faculty)
    .filter((f): f is string => Boolean(f))
    .sort();
}

/* ───────────── کارکنان ───────────── */

export interface StaffListFilters {
  q?: string;
  kind?: string;
  page?: number;
  pageSize?: number;
}

export async function listStaff(filters: StaffListFilters) {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));
  const conditions: (SQL | undefined)[] = [isNull(users.deletedAt)];

  if (filters.q && filters.q.trim() !== '') {
    const q = `%${filters.q.trim()}%`;
    conditions.push(or(ilike(users.displayName, q), ilike(users.username, q)));
  }
  if (filters.kind && filters.kind !== 'ALL') {
    conditions.push(eq(staffProfiles.kind, filters.kind as never));
  }
  const where = and(...conditions);

  const [totalRow] = await db
    .select({ value: count() })
    .from(staffProfiles)
    .innerJoin(users, eq(staffProfiles.userId, users.id))
    .where(where);

  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      mobile: users.mobile,
      lastLoginAt: users.lastLoginAt,
      kind: staffProfiles.kind,
      department: staffProfiles.department,
      employerNote: staffProfiles.employerNote,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(staffProfiles.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    ctx,
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
    items: rows.map((r) => ({
      ...r,
      lastLoginAt: r.lastLoginAt ? toJalaliDateTime(r.lastLoginAt) : null,
    })),
  };
}

/* ───────────── ایمپورت‌ها ───────────── */

export async function listImportBatches() {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
  const batches = await db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(50);
  return {
    ctx,
    items: batches.map((b) => ({
      id: b.id,
      kind: b.kind,
      fileName: b.fileName,
      status: b.status,
      recordCount: b.recordCount,
      createdCount: b.createdCount,
      updatedCount: b.updatedCount,
      rejectedCount: b.rejectedCount,
      deactivatedCount: b.deactivatedCount,
      createdAt: toJalaliDateTime(b.createdAt),
      undoneAt: b.undoneAt ? toJalaliDateTime(b.undoneAt) : null,
    })),
  };
}

export async function getImportBatchDetail(batchId: string) {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
  const batches = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  const batch = batches[0];
  if (!batch) return { found: false as const, ctx };

  const rows = await db
    .select()
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .orderBy(asc(importRows.rowNumber))
    .limit(1000);

  return {
    found: true as const,
    ctx,
    batch: {
      id: batch.id,
      kind: batch.kind,
      fileName: batch.fileName,
      status: batch.status,
      recordCount: batch.recordCount,
      createdCount: batch.createdCount,
      updatedCount: batch.updatedCount,
      rejectedCount: batch.rejectedCount,
      deactivatedCount: batch.deactivatedCount,
      createdAt: toJalaliDateTime(batch.createdAt),
    },
    rows: rows.map((r) => ({
      id: r.id,
      rowNumber: r.rowNumber,
      status: r.status,
      errors: (r.errors as string[] | null) ?? [],
      payload: r.payload as Record<string, unknown>,
    })),
  };
}

/* ───────────── لاگ رویدادها (مدیر ارشد) ───────────── */

export async function listAuditLogs(filters: {
  action?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}) {
  const ctx = await requireRole(ROLES.SUPER_ADMIN);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));
  const conditions: (SQL | undefined)[] = [];
  if (filters.action && filters.action !== 'ALL')
    conditions.push(eq(auditLogs.action, filters.action as never));
  if (filters.entityType && filters.entityType !== 'ALL')
    conditions.push(eq(auditLogs.entityType, filters.entityType));
  const where = and(...conditions);

  const [totalRow] = await db.select({ value: count() }).from(auditLogs).where(where);
  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    ctx,
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorRole: r.actorRole,
      entityType: r.entityType,
      entityId: r.entityId,
      ip: r.ip,
      createdAt: toJalaliDateTime(r.createdAt),
      before: r.before,
      after: r.after,
    })),
  };
}

/* ───────────── آمار ───────────── */

export async function getViceStats() {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);

  const byStatus = await db
    .select({ status: studentProfiles.status, value: count() })
    .from(studentProfiles)
    .innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(isNull(users.deletedAt))
    .groupBy(studentProfiles.status);

  const byFaculty = await db
    .select({ faculty: studentProfiles.faculty, value: count() })
    .from(studentProfiles)
    .innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(and(isNull(users.deletedAt), isNull(studentProfiles.faculty)))
    .groupBy(studentProfiles.faculty);

  const byFacultyAll = await db
    .select({ faculty: studentProfiles.faculty, value: count() })
    .from(studentProfiles)
    .innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(isNull(users.deletedAt))
    .groupBy(studentProfiles.faculty);

  const [staffCount] = await db
    .select({ value: count() })
    .from(staffProfiles)
    .innerJoin(users, eq(staffProfiles.userId, users.id))
    .where(isNull(users.deletedAt));

  const [studentCount] = await db
    .select({ value: count() })
    .from(studentProfiles)
    .innerJoin(users, eq(studentProfiles.userId, users.id))
    .where(isNull(users.deletedAt));

  const [lastBatch] = await db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(1);

  const lastLogins = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(and(isNotNull(users.lastLoginAt), isNull(users.deletedAt)))
    .orderBy(desc(users.lastLoginAt))
    .limit(8);

  void byFaculty;

  return {
    ctx,
    totalStudents: Number(studentCount?.value ?? 0),
    totalStaff: Number(staffCount?.value ?? 0),
    byStatus: byStatus.map((s) => ({ name: statusLabel(s.status), value: Number(s.value) })),
    byFaculty: byFacultyAll
      .filter((f) => f.faculty)
      .map((f) => ({ name: f.faculty ?? 'نامشخص', value: Number(f.value) })),
    lastBatch: lastBatch
      ? {
          id: lastBatch.id,
          fileName: lastBatch.fileName,
          status: lastBatch.status,
          createdCount: lastBatch.createdCount,
          updatedCount: lastBatch.updatedCount,
          rejectedCount: lastBatch.rejectedCount,
          createdAt: toJalaliDateTime(lastBatch.createdAt),
        }
      : null,
    lastLogins: lastLogins.map((l) => ({
      id: l.id,
      displayName: l.displayName,
      role: l.role,
      at: toJalaliDateTime(l.lastLoginAt as Date),
    })),
  };
}

export function statusLabel(status: string): string {
  return (
    (
      { ACTIVE: 'فعال', ON_LEAVE: 'مرخصی', WITHDRAWN: 'انصراف', GRADUATED: 'فارغ‌التحصیل' } as Record<
        string,
        string
      >
    )[status] ?? status
  );
}

/* ───────────── آمار عمومی برای داشبوردها ───────────── */

export async function getAdminStats() {
  const ctx = await requireRole(ROLES.SUPER_ADMIN);
  const byRole = await db
    .select({ role: users.role, value: count() })
    .from(users)
    .where(isNull(users.deletedAt))
    .groupBy(users.role);
  const [logCount] = await db.select({ value: count() }).from(auditLogs);
  const recent = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(8);

  return {
    ctx,
    byRole: byRole.map((r) => ({ role: r.role, label: roleLabel(r.role), value: Number(r.value) })),
    totalUsers: byRole.reduce((a, b) => a + Number(b.value), 0),
    totalLogs: Number(logCount?.value ?? 0),
    recent: recent.map((r) => ({
      id: r.id,
      action: r.action,
      actorRole: r.actorRole,
      entityType: r.entityType,
      createdAt: toJalaliDateTime(r.createdAt),
    })),
  };
}

export function roleLabel(role: string): string {
  return (
    (
      {
        STUDENT: 'دانشجو',
        STAFF: 'کارمند',
        VICE_STUDENT: 'معاونت دانشجویی',
        NUTRITION_MANAGER: 'مدیر تغذیه',
        CAFETERIA_OPERATOR: 'کارمند سلف',
        SUPER_ADMIN: 'مدیر ارشد',
      } as Record<string, string>
    )[role] ?? role
  );
}

/* ───────────── کاربران (مدیر ارشد) ───────────── */

export async function listAllUsers(filters: { q?: string; role?: string; page?: number; pageSize?: number }) {
  const ctx = await requireRole(ROLES.SUPER_ADMIN);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));
  const conditions: (SQL | undefined)[] = [isNull(users.deletedAt)];
  if (filters.q && filters.q.trim() !== '') {
    const q = `%${filters.q.trim()}%`;
    conditions.push(or(ilike(users.displayName, q), ilike(users.username, q)));
  }
  if (filters.role && filters.role !== 'ALL') conditions.push(eq(users.role, filters.role as never));
  const where = and(...conditions);

  const [totalRow] = await db.select({ value: count() }).from(users).where(where);
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    ctx,
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
    items: rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      roleLabel: roleLabel(u.role),
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      mobile: u.mobile,
      lastLoginAt: u.lastLoginAt ? toJalaliDateTime(u.lastLoginAt) : null,
      createdAt: toJalaliDateTime(u.createdAt),
    })),
  };
}

/* ───────────── نشست‌های من ───────────── */

export async function listMySessions() {
  const ctx = await requireRole(
    ROLES.STUDENT,
    ROLES.STAFF,
    ROLES.VICE_STUDENT,
    ROLES.NUTRITION_MANAGER,
    ROLES.CAFETERIA_OPERATOR,
    ROLES.SUPER_ADMIN,
  );
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, ctx.user.id), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.createdAt));

  return {
    ctx,
    items: rows.map((s) => ({
      id: s.id,
      ip: s.ip,
      device: (s.userAgent ?? '—').slice(0, 90),
      lastSeenAt: toJalaliDateTime(s.lastSeenAt),
      createdAt: toJalaliDateTime(s.createdAt),
      current: s.id === ctx.user.sessionId,
    })),
  };
}

export { requireRole, apiAuth };
export type { AuthContext };
export { systemSettings, importBatches, importRows, inArray };
