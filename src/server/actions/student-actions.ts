'use server';

import { db } from '@/db';
import {
  users,
  studentProfiles,
  staffProfiles,
  sessions,
  customerGroupHistory,
  importBatches,
  importRows,
} from '@/db/schema';
import { and, eq, inArray, isNull, sql, desc } from 'drizzle-orm';
import { requireRole, getCurrentUser } from '@/server/dal/auth';
import { ROLES, canManageRole } from '@/lib/permissions';
import { kvGet, kvSet, kvDel } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { audit } from '@/lib/audit';
import { encryptSecret, decryptSecret, blindIndex, maskNationalCode } from '@/lib/crypto';
import {
  normalizeNationalCode,
  normalizeStudentNumber,
  normalizePersianText,
  normalizeMobile,
  isValidNationalCode,
  parseStudentStatus,
  parseStaffKind,
  generateTemporaryPassword,
  validatePersonalPassword,
} from '@/lib/validation';
import { hash } from 'argon2';
import { ARGON2_OPTIONS } from '@/lib/argon2-gate';
import {
  readStudentWorkbook,
  validateStudentRows,
  classifyAgainstDatabase,
  commitStudentImport,
  undoLastImport,
  undoImport,
  buildStudentTemplate,
  buildErrorReportWorkbook,
  buildCredentialsWorkbook,
  readStaffWorkbook,
  commitStaffImport,
  autoMapHeaders,
  type ValidatedRow,
  type RowKind,
} from '@/server/services/student-import';

function metaFromRequest(request: Request) {
  return {
    ip: getClientIp(request as unknown as { headers: Headers; ip?: string | null }),
    userAgent: request.headers.get('user-agent'),
  };
}

async function currentActorMeta() {
  const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
  return {
    actor: {
      id: ctx.user.id,
      role: ctx.user.role,
      ip: null as string | null,
      userAgent: null as string | null,
    },
    ctx,
  };
}

/* ───────────── قالب‌ها ───────────── */

export async function downloadStudentTemplateAction(): Promise<
  { ok: true; base64: string } | { ok: false; error: string }
> {
  try {
    await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
    const buf = await buildStudentTemplate();
    return { ok: true, base64: buf.toString('base64') };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ───────────── مرحله ۱ و ۲: آپلود + نگاشت ستون ───────────── */

export interface PreviewRowDto {
  rowNumber: number;
  kind: RowKind;
  studentNumber: string;
  nationalCodeMasked: string;
  firstName: string;
  lastName: string;
  faculty: string | null;
  major: string | null;
  entryYear: number | null;
  status: string;
  mobile: string | null;
  errors: string[];
  warnings: string[];
  needsExplicitConfirm: boolean;
  existingNationalCodeMasked: string | null;
}

export interface PreviewDto {
  batchKey: string;
  headers: string[];
  suggestedMap: Record<number, string | null>;
  rows: PreviewRowDto[];
  counts: { total: number; create: number; update: number; conflict: number; error: number };
  fileName: string;
  elapsedMs: number;
}

export async function previewStudentImportAction(input: {
  fileName: string;
  base64: string;
  columnMap?: Record<number, string | null>;
}): Promise<{ ok: true; preview: PreviewDto } | { ok: false; error: string }> {
  try {
    const previewCtx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
    const started = Date.now();

    const buffer = Buffer.from(input.base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return { ok: false, error: 'حجم فایل نباید بیشتر از ۵ مگابایت باشد' };
    }

    const file = await readStudentWorkbook(buffer);
    if (file.rows.length === 0) return { ok: false, error: 'فایل اکسل هیچ ردیف داده‌ای ندارد' };
    if (file.rows.length > 10000) return { ok: false, error: 'تعداد ردیف‌ها نباید بیشتر از ۱۰٬۰۰۰ باشد' };

    const suggested = autoMapHeaders(file.headers);
    const map = (input.columnMap ?? suggested) as Record<number, never>;

    const validated = validateStudentRows(file, map);
    const classified = await classifyAgainstDatabase(validated);

    const batchKey = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await kvSet(
      `import-preview:${previewCtx.user.id}:${batchKey}`,
      encryptSecret(
        JSON.stringify({ rows: classified.rows, fileName: input.fileName, createdAt: Date.now() }),
      ),
      1800,
    );

    return {
      ok: true,
      preview: {
        batchKey,
        fileName: input.fileName,
        headers: file.headers,
        suggestedMap: suggested as Record<number, string | null>,
        rows: classified.rows.map((r) => ({
          rowNumber: r.rowNumber,
          kind: r.kind,
          studentNumber: r.data?.studentNumber ?? '',
          nationalCodeMasked: r.data
            ? maskNationalCode(r.data.nationalCode)
            : maskNationalCode(r.raw.nationalCode ?? ''),
          firstName: r.data?.firstName ?? '',
          lastName: r.data?.lastName ?? '',
          faculty: r.data?.faculty ?? null,
          major: r.data?.major ?? null,
          entryYear: r.data?.entryYear ?? null,
          status: r.data?.status ?? '',
          mobile: r.data?.mobile ?? null,
          errors: r.errors,
          warnings: r.warnings,
          needsExplicitConfirm: r.needsExplicitConfirm,
          existingNationalCodeMasked: r.existingNationalCodeMasked,
        })),
        counts: classified.counts,
        elapsedMs: Date.now() - started,
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'خواندن فایل اکسل ممکن نشد' };
  }
}

/* ───────────── مرحله ۴: ثبت ───────────── */

/**
 * نگهداری موقت نتیجه پیش‌نمایش در سمت سرور.
 * کد ملی خام هرگز به مرورگر فرستاده نمی‌شود؛ فقط در همین store می‌ماند.
 */
interface PreviewEntry {
  rows: ValidatedRow[];
  fileName: string;
  createdAt: number;
}

const previewStore = new Map<string, PreviewEntry>();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

function putPreview(key: string, entry: PreviewEntry) {
  const now = Date.now();
  for (const [k, v] of previewStore) {
    if (now - v.createdAt > PREVIEW_TTL_MS) previewStore.delete(k);
  }
  previewStore.set(key, entry);
}

export async function commitStudentImportAction(input: {
  batchKey: string;
  fileName: string;
  overrides: Record<number, boolean>;
  deactivateMissing: boolean;
}): Promise<
  | {
      ok: true;
      result: { batchId: string; created: number; updated: number; skipped: number; deactivated: number };
    }
  | { ok: false; error: string }
> {
  try {
    const { actor } = await currentActorMeta();

    const cached = await kvGet(`import-preview:${actor.id}:${input.batchKey}`);
    const entry: PreviewEntry | null = cached ? JSON.parse(decryptSecret(cached)) : null;
    if (!entry) {
      return { ok: false, error: 'پیش‌نمایش منقضی شده است؛ لطفاً فایل را دوباره بارگذاری کنید' };
    }

    const rows: ValidatedRow[] = entry.rows.map((r) => ({
      ...r,
      confirmedOverride: input.overrides[r.rowNumber] === true,
    }));

    await classifyAgainstDatabase({
      rows,
      counts: { total: rows.length, create: 0, update: 0, conflict: 0, error: 0 },
    });
    const result = await commitStudentImport({
      fileName: input.fileName || entry.fileName,
      rows,
      actor,
      deactivateMissing: input.deactivateMissing,
      allStudentNumbersInFile: rows.filter((r) => r.data).map((r) => r.data!.studentNumber),
    });

    await kvDel(`import-preview:${actor.id}:${input.batchKey}`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'ثبت اطلاعات ناموفق بود' };
  }
}

/* ───────────── گزارش خطا ───────────── */

export async function downloadErrorReportAction(
  rows: {
    rowNumber: number;
    kind: string;
    studentNumber: string;
    nationalCodeMasked: string;
    errors: string[];
    warnings: string[];
  }[],
) {
  await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
  const buf = await buildErrorReportWorkbook(
    rows.map((r) => ({
      rowNumber: r.rowNumber,
      kind: r.kind as RowKind,
      data: null,
      errors: r.errors,
      warnings: r.warnings,
      needsExplicitConfirm: false,
      confirmedOverride: false,
      existingUserId: null,
      existingNationalCodeMasked: null,
      raw: { studentNumber: r.studentNumber, nationalCode: r.nationalCodeMasked },
    })),
  );
  return { base64: buf.toString('base64') };
}

/* ───────────── Undo ───────────── */

export async function undoLastImportAction() {
  try {
    const { actor } = await currentActorMeta();
    const result = await undoLastImport(actor);
    if ('error' in result) return { ok: false as const, error: result.error };
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function undoImportAction(batchId: string) {
  try {
    const { actor } = await currentActorMeta();
    const result = await undoImport(batchId, actor);
    if ('error' in result) return { ok: false as const, error: result.error };
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ───────────── عملیات دانشجو ───────────── */

export async function revealNationalCodeAction(userId: string) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
    const rows = await db
      .select({ nc: studentProfiles.nationalCode })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId))
      .limit(1);
    if (!rows[0]) return { ok: false as const, error: 'یافت نشد' };
    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: 'student:national_code_revealed',
      entityType: 'student_profile',
      entityId: userId,
    });
    return { ok: true as const, nationalCode: decryptSecret(rows[0].nc) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function resetStudentPasswordAction(userId: string) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) return { ok: false as const, error: 'کاربر یافت نشد' };

    await db
      .update(users)
      .set({ passwordHash: null, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: 'student:reset_password',
      entityType: 'user',
      entityId: userId,
      after: { passwordHash: null, mustChangePassword: true },
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function setStudentStatusAction(userIds: string[], status: string) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
    const { setStudentStatus } = await import('@/server/services/student-status');
    return await setStudentStatus({ actor: { id: ctx.user.id, role: ctx.user.role }, userIds, status });
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export interface StudentFormValues {
  studentNumber: string;
  nationalCode: string;
  firstName: string;
  lastName: string;
  faculty: string | null;
  major: string | null;
  entryYear: number | null;
  status: string;
  mobile: string | null;
}

export async function saveStudentAction(values: StudentFormValues, userId?: string) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);

    const studentNumber = normalizeStudentNumber(values.studentNumber);
    const nationalCode = normalizeNationalCode(values.nationalCode);
    const firstName = normalizePersianText(values.firstName);
    const lastName = normalizePersianText(values.lastName);
    const status = parseStudentStatus(values.status) ?? 'ACTIVE';

    if (!studentNumber) return { ok: false as const, error: 'شماره دانشجویی الزامی است' };
    if (!isValidNationalCode(nationalCode)) return { ok: false as const, error: 'کد ملی معتبر نیست' };
    if (!firstName || !lastName) return { ok: false as const, error: 'نام و نام خانوادگی الزامی است' };

    const ncHash = blindIndex(nationalCode);

    const dupNc = await db
      .select({ studentNumber: studentProfiles.studentNumber })
      .from(studentProfiles)
      .where(and(eq(studentProfiles.nationalCodeHash, ncHash), isNull(studentProfiles.deletedAt)));
    if (dupNc[0] && dupNc[0].studentNumber !== studentNumber) {
      return {
        ok: false as const,
        error: `کد ملی قبلاً برای شماره دانشجویی ${dupNc[0].studentNumber} ثبت شده است`,
      };
    }

    const actor = {
      id: ctx.user.id,
      role: ctx.user.role,
      ip: null as string | null,
      userAgent: null as string | null,
    };

    if (userId) {
      const before = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, userId))
        .limit(1);
      await db
        .update(studentProfiles)
        .set({
          studentNumber,
          nationalCode: encryptSecret(nationalCode),
          nationalCodeHash: ncHash,
          firstName,
          lastName,
          faculty: values.faculty ?? null,
          major: values.major ?? null,
          entryYear: values.entryYear,
          status,
          updatedAt: new Date(),
        })
        .where(eq(studentProfiles.userId, userId));
      await db
        .update(users)
        .set({
          displayName: `${firstName} ${lastName}`,
          mobile: values.mobile ? (normalizeMobile(values.mobile) ?? null) : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await audit({
        actor,
        action: 'student:updated',
        entityType: 'student_profile',
        entityId: userId,
        before: before[0] ?? null,
        after: { studentNumber, status },
      });
      return { ok: true as const };
    }

    const exists = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, studentNumber), isNull(users.deletedAt)));
    if (exists[0]) return { ok: false as const, error: 'شماره دانشجویی قبلاً ثبت شده است' };

    const [user] = await db
      .insert(users)
      .values({
        role: 'STUDENT',
        username: studentNumber,
        passwordHash: null,
        mustChangePassword: true,
        isActive: status === 'ACTIVE',
        displayName: `${firstName} ${lastName}`,
        mobile: values.mobile ? (normalizeMobile(values.mobile) ?? null) : null,
        createdBy: ctx.user.id,
      })
      .returning();

    await db.insert(studentProfiles).values({
      userId: user.id,
      studentNumber,
      nationalCode: encryptSecret(nationalCode),
      nationalCodeHash: ncHash,
      firstName,
      lastName,
      faculty: values.faculty ?? null,
      major: values.major ?? null,
      entryYear: values.entryYear,
      status,
      customerGroup: 'STUDENT',
    });

    await audit({
      actor,
      action: 'student:created',
      entityType: 'user',
      entityId: user.id,
      after: { studentNumber, status },
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ───────────── کارکنان ───────────── */

export interface StaffFormValues {
  username: string;
  firstName: string;
  lastName: string;
  kind: string;
  department: string | null;
  nationalCode: string | null;
  mobile: string | null;
  employerNote: string | null;
}

export async function createStaffAction(values: StaffFormValues) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
    // سلسله‌مراتب: NUTRITION_MANAGER فقط CAFETERIA
    const kind = parseStaffKind(values.kind);
    if (!kind) return { ok: false as const, error: 'نوع کارمند نامعتبر است' };
    if (ctx.user.role === ROLES.VICE_STUDENT && kind === 'CAFETERIA')
      return { ok: false as const, error: 'ساخت کارمند سلف در اختیار مدیر تغذیه است' };
    if (ctx.user.role === ROLES.NUTRITION_MANAGER && kind !== 'CAFETERIA') {
      return { ok: false as const, error: 'شما فقط مجاز به ساخت کارمند سلف هستید' };
    }

    const username = values.username.trim();
    if (!username) return { ok: false as const, error: 'نام کاربری الزامی است' };
    const firstName = normalizePersianText(values.firstName);
    const lastName = normalizePersianText(values.lastName);
    if (!firstName || !lastName) return { ok: false as const, error: 'نام و نام خانوادگی الزامی است' };

    const nc = values.nationalCode ? normalizeNationalCode(values.nationalCode) : null;
    if (nc && !isValidNationalCode(nc)) return { ok: false as const, error: 'کد ملی معتبر نیست' };

    const exists = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), isNull(users.deletedAt)));
    if (exists[0]) return { ok: false as const, error: 'نام کاربری قبلاً ثبت شده است' };

    const temporary = generateTemporaryPassword(10);
    const actor = {
      id: ctx.user.id,
      role: ctx.user.role,
      ip: null as string | null,
      userAgent: null as string | null,
    };

    const [user] = await db
      .insert(users)
      .values({
        role: kind === 'CAFETERIA' ? 'CAFETERIA_OPERATOR' : 'STAFF',
        username,
        passwordHash: await hash(temporary, ARGON2_OPTIONS),
        mustChangePassword: true,
        isActive: true,
        displayName: `${firstName} ${lastName}`,
        mobile: values.mobile ? (normalizeMobile(values.mobile) ?? null) : null,
        createdBy: ctx.user.id,
      })
      .returning();

    await db.insert(staffProfiles).values({
      userId: user.id,
      kind,
      nationalCode: nc ? encryptSecret(nc) : null,
      nationalCodeHash: nc ? blindIndex(nc) : null,
      department: values.department ?? null,
      employerNote: values.employerNote ?? null,
    });

    await audit({
      actor,
      action: 'staff:created',
      entityType: 'user',
      entityId: user.id,
      after: { username, kind },
    });

    return { ok: true as const, temporary, username };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateStaffAction(userId: string, values: Partial<StaffFormValues>) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
    const [targetUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!targetUser || !canManageRole(ctx.user.role, targetUser.role))
      return { ok: false as const, error: 'شما مجوز مدیریت این حساب را ندارید' };
    const before = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);
    const kind = values.kind ? parseStaffKind(values.kind) : null;
    if (ctx.user.role === ROLES.NUTRITION_MANAGER && kind && kind !== 'CAFETERIA') {
      return { ok: false as const, error: 'شما فقط مجاز به ویرایش کارمند سلف هستید' };
    }

    await db
      .update(staffProfiles)
      .set({
        ...(kind ? { kind } : {}),
        department: values.department ?? undefined,
        employerNote: values.employerNote ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(staffProfiles.userId, userId));

    if (values.firstName || values.lastName || values.mobile !== undefined) {
      const cur = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const displayName =
        values.firstName || values.lastName
          ? `${normalizePersianText(values.firstName ?? cur[0].displayName.split(' ')[0] ?? '')} ${normalizePersianText(values.lastName ?? cur[0].displayName.split(' ').slice(1).join(' '))}`.trim()
          : cur[0].displayName;
      await db
        .update(users)
        .set({
          displayName,
          mobile:
            values.mobile === undefined
              ? undefined
              : values.mobile
                ? (normalizeMobile(values.mobile) ?? null)
                : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: 'staff:updated',
      entityType: 'staff_profile',
      entityId: userId,
      before: before[0] ?? null,
      after: values as never,
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function toggleUserActiveAction(userId: string, active: boolean) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
    const [targetUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!targetUser || !canManageRole(ctx.user.role, targetUser.role))
      return { ok: false as const, error: 'شما مجوز مدیریت این حساب را ندارید' };
    const before = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!before[0]) return { ok: false as const, error: 'کاربر یافت نشد' };

    // سلسله‌مراتب: هیچ نقشی حساب هم‌سطح یا بالاتر را مدیریت نمی‌کند
    const rank: Record<string, number> = {
      STUDENT: 1,
      STAFF: 1,
      CAFETERIA_OPERATOR: 2,
      NUTRITION_MANAGER: 3,
      VICE_STUDENT: 3,
      SUPER_ADMIN: 4,
    };
    if ((rank[before[0].role] ?? 0) >= (rank[ctx.user.role] ?? 0) && ctx.user.role !== ROLES.SUPER_ADMIN) {
      return { ok: false as const, error: 'شما مجاز به تغییر این حساب نیستید' };
    }

    await db.update(users).set({ isActive: active, updatedAt: new Date() }).where(eq(users.id, userId));
    if (!active) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    }

    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: active ? 'user:activated' : 'user:deactivated',
      entityType: 'user',
      entityId: userId,
      before: { isActive: before[0].isActive },
      after: { isActive: active },
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function resetStaffPasswordAction(userId: string) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
    const [targetUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!targetUser || !canManageRole(ctx.user.role, targetUser.role))
      return { ok: false as const, error: 'شما مجوز مدیریت این حساب را ندارید' };
    const temporary = generateTemporaryPassword(10);
    await db
      .update(users)
      .set({
        passwordHash: await hash(temporary, ARGON2_OPTIONS),
        mustChangePassword: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: 'auth:password_reset',
      entityType: 'user',
      entityId: userId,
    });
    return { ok: true as const, temporary };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateCustomerGroupAction(userId: string, group: string) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
    const allowed = ['STUDENT', 'EMPLOYEE', 'FACULTY', 'CONTRACTOR'];
    if (!allowed.includes(group)) return { ok: false as const, error: 'گروه نامعتبر است' };

    const before = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
    await db
      .update(studentProfiles)
      .set({ customerGroup: group as never, updatedAt: new Date() })
      .where(eq(studentProfiles.userId, userId));
    await db.insert(customerGroupHistory).values({
      userId,
      before: before[0]?.customerGroup ?? null,
      after: group,
      changedBy: ctx.user.id,
    });
    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: 'customer_group:updated',
      entityType: 'student_profile',
      entityId: userId,
      before: { customerGroup: before[0]?.customerGroup ?? null },
      after: { customerGroup: group },
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ───────────── ایمپورت کارکنان ───────────── */

export async function importStaffAction(input: { fileName: string; base64: string }) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.SUPER_ADMIN);
    const buffer = Buffer.from(input.base64, 'base64');
    if (buffer.length > 2 * 1024 * 1024)
      return { ok: false as const, error: 'حجم فایل نباید بیشتر از ۲ مگابایت باشد' };

    const parsed = await readStaffWorkbook(buffer);
    if (parsed.rows.length === 0) return { ok: false as const, error: 'فایل هیچ ردیفی ندارد' };
    if (parsed.rows.length > 300) return { ok: false as const, error: 'حداکثر ۳۰۰ ردیف مجاز است' };

    const result = await commitStaffImport({
      fileName: input.fileName,
      rows: parsed.rows,
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      kindMap: (raw) => parseStaffKind(raw),
    });

    if ('error' in result) {
      return {
        ok: false as const,
        error: result.error,
        invalidRows: result.rows.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
      };
    }

    const wb = await buildCredentialsWorkbook(result.credentials);
    return { ok: true as const, created: result.created, credentialsBase64: wb.toString('base64') };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function exportCredentialsAction(userIds: string[]) {
  try {
    const ctx = await requireRole(ROLES.VICE_STUDENT, ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
    // رمزها ذخیره نمی‌شوند؛ فقط ریست می‌کنیم و همان لحظه خروجی می‌گیریم
    const credentials: { username: string; password: string }[] = [];
    for (const userId of userIds) {
      const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = rows[0];
      if (!user) continue;
      const temporary = generateTemporaryPassword(10);
      await db
        .update(users)
        .set({
          passwordHash: await hash(temporary, ARGON2_OPTIONS),
          mustChangePassword: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
      credentials.push({ username: user.username, password: temporary });
    }
    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: 'staff:credentials_exported',
      entityType: 'user',
      entityId: null,
      after: { count: credentials.length },
    });
    const wb = await buildCredentialsWorkbook(credentials);
    return { ok: true as const, base64: wb.toString('base64') };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function revokeMySessionAction(sessionId: string) {
  try {
    const ctx = await requireRole(
      ROLES.STUDENT,
      ROLES.STAFF,
      ROLES.VICE_STUDENT,
      ROLES.NUTRITION_MANAGER,
      ROLES.CAFETERIA_OPERATOR,
      ROLES.SUPER_ADMIN,
    );
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, ctx.user.id)));
    await audit({
      actor: { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      action: 'auth:session_revoked',
      entityType: 'session',
      entityId: sessionId,
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function setInitialPasswordAction(newPassword: string) {
  const ctx = await getCurrentUser();
  if (!ctx.user.mustChangePassword)
    return { ok: false as const, error: 'برای تغییر رمز فعلی از پروفایل استفاده کنید.' };
  const { setInitialPassword } = await import('@/server/services/auth');
  // سرویس خودش همهٔ نشست‌های دیگر را باطل می‌کند (نشست جاری زنده می‌ماند)
  return setInitialPassword(
    ctx.user.id,
    newPassword,
    { id: ctx.user.id, role: ctx.user.role },
    ctx.user.sessionId,
  );
}

export async function changePasswordAction(currentPassword: string, newPassword: string) {
  try {
    const ctx = await requireRole(
      ROLES.STUDENT,
      ROLES.STAFF,
      ROLES.VICE_STUDENT,
      ROLES.NUTRITION_MANAGER,
      ROLES.CAFETERIA_OPERATOR,
      ROLES.SUPER_ADMIN,
    );
    // منطق واحد در سرویس auth — بدون کد تکراری؛ نشست‌های دیگر باطل می‌شوند
    const { changeOwnPassword } = await import('@/server/services/auth');
    return await changeOwnPassword(
      ctx.user.id,
      currentPassword,
      newPassword,
      { id: ctx.user.id, role: ctx.user.role, ip: null, userAgent: null },
      ctx.user.sessionId,
    );
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
