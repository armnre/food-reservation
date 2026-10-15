import ExcelJS from 'exceljs';
import { db } from '@/db';
import {
  users, studentProfiles, staffProfiles, sessions,
  importBatches, importRows,
} from '@/db/schema';
import { and, eq, inArray, isNull, isNotNull, ne, sql } from 'drizzle-orm';
import { encryptSecret, decryptSecret, blindIndex, maskNationalCode } from '@/lib/crypto';
import {
  normalizeNationalCode, normalizeStudentNumber, normalizePersianText,
  normalizeMobile, isValidNationalCode, parseStudentStatus, toLatinDigits,
  type StudentStatus,
} from '@/lib/validation';
import { hash } from 'argon2';
import { audit, type AuditActor } from '@/lib/audit';

/* ───────────── انواع ───────────── */

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_STAFF_IMPORT_ROWS = 300;

export type RowKind = 'NEW' | 'UPDATE' | 'CONFLICT' | 'ERROR';

export interface RawRow {
  rowNumber: number;
  cells: Record<string, string>;
}

export interface NormalizedStudent {
  studentNumber: string;
  nationalCode: string;
  nationalCodeHash: string;
  firstName: string;
  lastName: string;
  faculty: string | null;
  major: string | null;
  entryYear: number | null;
  status: StudentStatus;
  mobile: string | null;
}

export interface ValidatedRow {
  rowNumber: number;
  kind: RowKind;
  data: NormalizedStudent | null;
  errors: string[];
  warnings: string[];
  /** برای تعارض کد ملی — اعمال فقط با تأیید صریح */
  needsExplicitConfirm: boolean;
  confirmedOverride: boolean;
  existingUserId: string | null;
  existingNationalCodeMasked: string | null;
  raw: Record<string, string>;
}

export interface PreviewResult {
  rows: ValidatedRow[];
  counts: { total: number; create: number; update: number; conflict: number; error: number };
}

/* ───────────── هدرها و نگاشت ───────────── */

export const STUDENT_TEMPLATE_HEADERS = [
  'شماره دانشجویی',
  'کد ملی',
  'نام',
  'نام خانوادگی',
  'دانشکده',
  'رشته',
  'سال ورود',
  'وضعیت',
  'موبایل',
] as const;

export type StudentField =
  | 'studentNumber' | 'nationalCode' | 'firstName' | 'lastName'
  | 'faculty' | 'major' | 'entryYear' | 'status' | 'mobile';

const HEADER_ALIASES: Record<string, StudentField> = {
  'شماره دانشجویی': 'studentNumber',
  'شماره‌دانشجویی': 'studentNumber',
  'شماره دانشجويي': 'studentNumber',
  'studentnumber': 'studentNumber',
  'student_number': 'studentNumber',
  'کد ملی': 'nationalCode',
  'کدملي': 'nationalCode',
  'کد ملي': 'nationalCode',
  'nationalcode': 'nationalCode',
  'national_code': 'nationalCode',
  'نام': 'firstName',
  'first name': 'firstName',
  'firstname': 'firstName',
  'first_name': 'firstName',
  'نام خانوادگی': 'lastName',
  'نام خانوادگي': 'lastName',
  'نام‌خانوادگی': 'lastName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'last_name': 'lastName',
  'خانوادگی': 'lastName',
  'دانشکده': 'faculty',
  'دانشگاه': 'faculty',
  'faculty': 'faculty',
  'رشته': 'major',
  'major': 'major',
  'سال ورود': 'entryYear',
  'ورود': 'entryYear',
  'entry year': 'entryYear',
  'entryyear': 'entryYear',
  'entry_year': 'entryYear',
  'وضعیت': 'status',
  'status': 'status',
  'موبایل': 'mobile',
  'تلفن همراه': 'mobile',
  'mobile': 'mobile',
};

export function autoMapHeaders(headers: string[]): Record<number, StudentField | null> {
  const map: Record<number, StudentField | null> = {};
  headers.forEach((h, i) => {
    const key = normalizePersianText(toLatinDigits(h ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();
    map[i] = HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s/g, '')] ?? null;
  });
  return map;
}

/* ───────────── خواندن اکسل ───────────── */

export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
}

export async function readStudentWorkbook(buffer: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('فایل اکسل هیچ برگه‌ای ندارد');

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  const lastCol = Math.max(ws.columnCount, 1);
  for (let c = 1; c <= lastCol; c++) {
    const v = headerRow.getCell(c).value;
    headers.push(String(v ?? '').trim());
  }

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: Record<string, string> = {};
    let hasValue = false;
    for (let c = 1; c <= lastCol; c++) {
      const raw = row.getCell(c).value;
      const text = cellToString(raw);
      if (text !== '') hasValue = true;
      cells[String(c - 1)] = text;
    }
    if (hasValue) rows.push({ rowNumber: r, cells });
    if (rows.length > MAX_IMPORT_ROWS) throw new Error('حداکثر ۱۰٬۰۰۰ ردیف پذیرفته می‌شود');
  }

  return { headers, rows };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const o = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof o.text === 'string') return o.text.trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    if (Array.isArray(o.richText)) return o.richText.map((x) => x.text).join('').trim();
    return '';
  }
  return String(value).trim();
}

/* ───────────── اعتبارسنجی ردیف‌ها ───────────── */

export function validateStudentRows(
  file: ParsedFile,
  columnMap: Record<number, StudentField | null>,
  opts?: { overrides?: Record<number, boolean> },
): PreviewResult {
  const seenStudentNumbers = new Map<string, number>();
  const seenNationalCodes = new Map<string, number>();
  const rows: ValidatedRow[] = [];

  for (const raw of file.rows) {
    const picked: Record<string, string> = {};
    for (const [idxStr, field] of Object.entries(columnMap)) {
      if (!field) continue;
      picked[field] = raw.cells[idxStr] ?? '';
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const studentNumber = normalizeStudentNumber(picked.studentNumber ?? '');
    if (!/^[0-9]+$/.test(toLatinDigits(picked.studentNumber ?? '').trim())) errors.push('شماره دانشجویی باید فقط رقم باشد');
    if (!studentNumber) errors.push('شماره دانشجویی الزامی است');
    else if (studentNumber.length < 3) errors.push('شماره دانشجویی نامعتبر است');

    const nationalCode = normalizeNationalCode(picked.nationalCode ?? '');
    if (!nationalCode) errors.push('کد ملی الزامی است');
    else if (!isValidNationalCode(nationalCode)) errors.push('کد ملی معتبر نیست (الگوریتم رقم کنترلی)');

    const firstName = normalizePersianText(picked.firstName ?? '');
    if (!firstName) errors.push('نام الزامی است');

    const lastName = normalizePersianText(picked.lastName ?? '');
    if (!lastName) errors.push('نام خانوادگی الزامی است');

    const faculty = picked.faculty ? normalizePersianText(picked.faculty) : null;
    const major = picked.major ? normalizePersianText(picked.major) : null;

    let entryYear: number | null = null;
    const entryRaw = toLatinDigits(picked.entryYear ?? '').replace(/\D/g, '');
    if (entryRaw) {
      entryYear = Number.parseInt(entryRaw, 10);
      if (!Number.isFinite(entryYear) || entryYear < 1300 || entryYear > 1500) {
        errors.push('سال ورود نامعتبر است');
      }
    }

    const status = parseStudentStatus(picked.status ?? '');
    if (!status) errors.push('وضعیت نامعتبر است (فعال، مرخصی، انصراف، فارغ‌التحصیل)');

    const mobile = picked.mobile ? normalizeMobile(picked.mobile) : null;
    if (picked.mobile && !mobile) warnings.push('شماره موبایل نامعتبر است و نادیده گرفته شد');

    // تکراری داخل فایل
    if (studentNumber) {
      const prev = seenStudentNumbers.get(studentNumber);
      if (prev !== undefined) errors.push(`تکراری در فایل: شماره دانشجویی ${studentNumber} در ردیف ${prev} هم آمده است`);
      else seenStudentNumbers.set(studentNumber, raw.rowNumber);
    }

    const ncHash = nationalCode ? blindIndex(nationalCode) : '';
    if (ncHash) {
      const prevNc = seenNationalCodes.get(ncHash);
      if (prevNc !== undefined) errors.push(`تکراری در فایل: کد ملی در ردیف ${prevNc} هم آمده است`);
      else seenNationalCodes.set(ncHash, raw.rowNumber);
    }

    const data: NormalizedStudent | null = errors.length === 0 && status
      ? {
          studentNumber,
          nationalCode,
          nationalCodeHash: ncHash,
          firstName,
          lastName,
          faculty,
          major,
          entryYear,
          status,
          mobile: mobile ?? null,
        }
      : null;

    rows.push({
      rowNumber: raw.rowNumber,
      kind: errors.length > 0 ? 'ERROR' : 'NEW', // نوع نهایی بعد از تطبیق با دیتابیس
      data,
      errors,
      warnings,
      needsExplicitConfirm: false,
      confirmedOverride: opts?.overrides?.[raw.rowNumber] === true,
      existingUserId: null,
      existingNationalCodeMasked: null,
      raw: picked,
    });
  }

  return {
    rows,
    counts: {
      total: rows.length,
      create: 0, update: 0, conflict: 0,
      error: rows.filter((r) => r.kind === 'ERROR').length,
    },
  };
}

/** تطبیق با دیتابیس: تعیین NEW / UPDATE / CONFLICT */
export async function classifyAgainstDatabase(preview: PreviewResult): Promise<PreviewResult> {
  const studentNumbers = preview.rows
    .filter((r) => r.data)
    .map((r) => (r.data as NormalizedStudent).studentNumber);

  const ncHashes = preview.rows
    .filter((r) => r.data)
    .map((r) => (r.data as NormalizedStudent).nationalCodeHash);

  const existingByNumber = new Map<string, { userId: string; ncHash: string; studentNumber: string }>();
  if (studentNumbers.length > 0) {
    const found = await db
      .select({
        userId: studentProfiles.userId,
        ncHash: studentProfiles.nationalCodeHash,
        studentNumber: studentProfiles.studentNumber,
      })
      .from(studentProfiles)
      .where(inArray(studentProfiles.studentNumber, studentNumbers));
    for (const f of found) existingByNumber.set(f.studentNumber, f);
  }

  const ncHashOwner = new Map<string, string>();
  if (ncHashes.length > 0) {
    const found = await db
      .select({ ncHash: studentProfiles.nationalCodeHash, studentNumber: studentProfiles.studentNumber })
      .from(studentProfiles)
      .where(inArray(studentProfiles.nationalCodeHash, ncHashes));
    for (const f of found) ncHashOwner.set(f.ncHash, f.studentNumber);
  }

  const counts = { total: preview.rows.length, create: 0, update: 0, conflict: 0, error: 0 };

  for (const row of preview.rows) {
    if (!row.data) {
      row.kind = 'ERROR';
      counts.error++;
      continue;
    }
    const d = row.data;
    const existing = existingByNumber.get(d.studentNumber);

    if (!existing) {
      // دانشجوی جدید — ولی کد ملی متعلق به شماره دیگری؟
      const owner = ncHashOwner.get(d.nationalCodeHash);
      if (owner && owner !== d.studentNumber) {
        row.kind = 'ERROR';
        row.errors.push(`کد ملی تکراری است و قبلاً برای شماره دانشجویی ${owner} ثبت شده است`);
        counts.error++;
        continue;
      }
      row.kind = 'NEW';
      counts.create++;
      continue;
    }

    row.existingUserId = existing.userId;

    if (existing.ncHash !== d.nationalCodeHash) {
      // تعارض کد ملی — فقط با تأیید صریح
      row.kind = 'CONFLICT';
      row.needsExplicitConfirm = true;
      try {
        const enc = await db.select({ nc: studentProfiles.nationalCode })
          .from(studentProfiles).where(eq(studentProfiles.studentNumber, d.studentNumber)).limit(1);
        if (enc[0]) row.existingNationalCodeMasked = maskNationalCode(decryptSecret(enc[0].nc));
      } catch {
        row.existingNationalCodeMasked = '****';
      }
      if (!row.confirmedOverride) {
        row.warnings.push('کد ملی با رکورد موجود متفاوت است؛ برای اعمال، تأیید صریح لازم است');
      }
      counts.conflict++;
      continue;
    }

    row.kind = 'UPDATE';
    counts.update++;
  }

  preview.counts = counts;
  return preview;
}

/* ───────────── ثبت (upsert تراکنشی) ───────────── */

export interface CommitResult {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  deactivated: number;
}

export async function commitStudentImport(input: {
  fileName: string;
  rows: ValidatedRow[];
  actor: AuditActor;
  deactivateMissing: boolean;
  allStudentNumbersInFile: string[];
}): Promise<CommitResult> {
  const applicable = input.rows.filter((r) => r.data && (r.kind === 'NEW' || r.kind === 'UPDATE' || (r.kind === 'CONFLICT' && r.confirmedOverride)));
  const errorRows = input.rows.filter((r) => r.kind === 'ERROR' || (r.kind === 'CONFLICT' && !r.confirmedOverride));

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.insert(importBatches).values({
      kind: 'STUDENT',
      fileName: input.fileName,
      status: 'PROCESSING',
      recordCount: input.rows.length,
      importedBy: input.actor.id,
    }).returning();

    let created = 0;
    let updated = 0;
    let deactivated = 0;
    const createdUserIds: string[] = [];
    const updatedNonActive: string[] = [];

    for (const row of applicable) {
      const d = row.data as NormalizedStudent;
      const encryptedNc = encryptSecret(d.nationalCode);

      if (row.kind === 'NEW') {
        const [user] = await tx.insert(users).values({
          role: 'STUDENT',
          username: d.studentNumber,
          passwordHash: null,
          mustChangePassword: true,
          isActive: true,
          displayName: `${d.firstName} ${d.lastName}`,
          mobile: d.mobile,
          createdBy: input.actor.id,
        }).returning();

        await tx.insert(studentProfiles).values({
          userId: user.id,
          studentNumber: d.studentNumber,
          nationalCode: encryptedNc,
          nationalCodeHash: d.nationalCodeHash,
          firstName: d.firstName,
          lastName: d.lastName,
          faculty: d.faculty,
          major: d.major,
          entryYear: d.entryYear,
          status: d.status,
          customerGroup: 'STUDENT',
        });

        createdUserIds.push(user.id);
        created++;
        await tx.insert(importRows).values({
          batchId: batch.id,
          rowNumber: row.rowNumber,
          payload: {studentNumber:d.studentNumber,firstName:d.firstName,lastName:d.lastName,nationalCode:maskNationalCode(d.nationalCode),status:d.status} as never,
          status: 'CREATED',
          userId: user.id,
        });
      } else {
        const userId = row.existingUserId as string;
        const isReset = row.kind === 'CONFLICT';

        await tx.update(studentProfiles).set({
          nationalCode: encryptedNc,
          nationalCodeHash: d.nationalCodeHash,
          firstName: d.firstName,
          lastName: d.lastName,
          faculty: d.faculty,
          major: d.major,
          entryYear: d.entryYear,
          status: d.status,
          updatedAt: new Date(),
        }).where(eq(studentProfiles.userId, userId));

        await tx.update(users).set({
          displayName: `${d.firstName} ${d.lastName}`,
          mobile: d.mobile,
          ...(isReset ? { passwordHash: null, mustChangePassword: true } : {}),
          updatedAt: new Date(),
        }).where(eq(users.id, userId));

        if (isReset) {
          await tx.update(sessions).set({ revokedAt: new Date() })
            .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
        }

        if (d.status !== 'ACTIVE') updatedNonActive.push(userId);

        updated++;
        await tx.insert(importRows).values({
          batchId: batch.id,
          rowNumber: row.rowNumber,
          payload: {studentNumber:d.studentNumber,firstName:d.firstName,lastName:d.lastName,nationalCode:maskNationalCode(d.nationalCode),status:d.status} as never,
          status: row.kind === 'CONFLICT' ? 'CONFLICT' : 'UPDATED',
          userId,
        });
      }
    }

    for (const row of errorRows) {
      await tx.insert(importRows).values({
        batchId: batch.id,
        rowNumber: row.rowNumber,
        payload: {...row.raw,nationalCode:maskNationalCode(row.raw.nationalCode??'')} as never,
        status: 'ERROR',
        errors: row.errors as never,
      });
    }

    deactivated = 0;
    if (input.deactivateMissing) {
      const inFile = input.allStudentNumbersInFile;
      if (inFile.length > 0) {
        const affected = await tx
          .select({ userId: studentProfiles.userId })
          .from(studentProfiles)
          .where(and(
            isNull(studentProfiles.deletedAt),
            eq(studentProfiles.status, 'ACTIVE'),
            sql`${studentProfiles.studentNumber} NOT IN (${sql.join(inFile.map((s) => sql`${s}`), sql`, `)})`,
          ));
        const ids = affected.map((a) => a.userId);
        if (ids.length > 0) {
          await tx.update(studentProfiles).set({ status: 'ON_LEAVE', updatedAt: new Date() })
            .where(inArray(studentProfiles.userId, ids));
          await tx.update(users).set({ isActive: false, updatedAt: new Date() })
            .where(inArray(users.id, ids));
          await tx.update(sessions).set({ revokedAt: new Date() })
            .where(and(inArray(sessions.userId, ids), isNull(sessions.revokedAt)));
          deactivated = ids.length;
        }
      }
    }

    // غیرفعال‌سازی نشست دانشجویانی که وضعیت‌شان غیرفعال شد
    if (updatedNonActive.length > 0) {
      await tx.update(sessions).set({ revokedAt: new Date() })
        .where(and(inArray(sessions.userId, updatedNonActive), isNull(sessions.revokedAt)));
      await tx.update(users).set({ isActive: false, updatedAt: new Date() })
        .where(inArray(users.id, updatedNonActive));
    }

    await tx.update(importBatches).set({
      status: 'COMPLETED',
      createdCount: created,
      updatedCount: updated,
      rejectedCount: errorRows.length,
      deactivatedCount: deactivated,
      updatedAt: new Date(),
    }).where(eq(importBatches.id, batch.id));

    return {
      batchId: batch.id,
      created,
      updated,
      skipped: errorRows.length,
      errors: errorRows.length,
      deactivated,
    };
  });

  await audit({
    actor: input.actor,
    action: 'import:committed',
    entityType: 'import_batch',
    entityId: result.batchId,
    after: {
      fileName: input.fileName,
      ...result,
      deactivateMissing: input.deactivateMissing,
    },
  });

  return result;
}

/* ───────────── بازگردانی ───────────── */

export interface UndoResult {
  batchId: string;
  undone: number;
  skipped: number;
  skippedReasons: string[];
}

export async function undoLastImport(actor: AuditActor): Promise<UndoResult | { error: string }> {
  const batches = await db.select().from(importBatches)
    .where(and(eq(importBatches.status, 'COMPLETED'), isNull(importBatches.undoneAt)))
    .orderBy(sql`${importBatches.createdAt} DESC`)
    .limit(1);

  const batch = batches[0];
  if (!batch) return { error: 'هیچ batch قابل بازگردانی وجود ندارد' };

  return undoImport(batch.id, actor);
}

export async function undoImport(batchId: string, actor: AuditActor): Promise<UndoResult | { error: string }> {
  const [last] = await db.select({id:importBatches.id}).from(importBatches).where(eq(importBatches.status,'COMPLETED')).orderBy(sql`${importBatches.createdAt} DESC`).limit(1);
  if(last?.id!==batchId)return {error:'فقط آخرین ایمپورت تکمیل‌شده قابل بازگردانی است'};
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  const createdRows = rows.filter((r) => r.status === 'CREATED' && r.userId);

  const result = await db.transaction(async (tx) => {
    let undone = 0;
    const skippedReasons: string[] = [];

    for (const row of createdRows) {
      const userId = row.userId as string;
      const sessionCount = await tx.select({ c: sql<number>`count(*)` })
        .from(sessions).where(eq(sessions.userId, userId));
      const userRow = await tx.select({ lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, userId)).limit(1);
      const hasActivity = (Number(sessionCount[0]?.c ?? 0) > 0) || userRow[0]?.lastLoginAt != null;

      if (hasActivity) {
        skippedReasons.push(`ردیف ${row.rowNumber}: کاربر ورود/فعالیت داشته و بازگردانی نشد`);
        continue;
      }

      await tx.update(studentProfiles).set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(studentProfiles.userId, userId));
      await tx.update(users).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(eq(users.id, userId));
      await tx.update(importRows).set({ status: 'UNDONE' }).where(eq(importRows.id, row.id));
      undone++;
    }

    await tx.update(importBatches).set({
      status: 'UNDONE',
      undoneAt: new Date(),
      undoneBy: actor.id,
      updatedAt: new Date(),
    }).where(eq(importBatches.id, batchId));

    return { batchId, undone, skipped: skippedReasons.length, skippedReasons };
  });

  await audit({
    actor,
    action: 'import:undone',
    entityType: 'import_batch',
    entityId: batchId,
    after: result,
  });

  return result;
}

/* ───────────── قالب نمونه ───────────── */

export async function buildStudentTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('دانشجویان');
  ws.columns = STUDENT_TEMPLATE_HEADERS.map((h) => ({ header: h, key: h, width: 20 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow({
    'شماره دانشجویی': '40123456',
    'کد ملی': '0012345678',
    'نام': 'علی',
    'نام خانوادگی': 'رضایی',
    'دانشکده': 'مهندسی',
    'رشته': 'نرم‌افزار',
    'سال ورود': '1401',
    'وضعیت': 'فعال',
    'موبایل': '09121234567',
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/* ───────────── ایمپورت کارکنان (ب-۵) ───────────── */

export const STAFF_TEMPLATE_HEADERS = [
  'نام کاربری', 'نام', 'نام خانوادگی', 'نوع', 'واحد', 'کد ملی', 'موبایل',
] as const;

export interface StaffRow {
  rowNumber: number;
  username: string;
  firstName: string;
  lastName: string;
  kind: string;
  department: string | null;
  nationalCode: string | null;
  mobile: string | null;
  errors: string[];
}

export async function readStaffWorkbook(buffer: Buffer): Promise<{ headers: string[]; rows: StaffRow[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('فایل اکسل هیچ برگه‌ای ندارد');

  const rows: StaffRow[] = [];
  for (let r = 2; r <= ws.rowCount && rows.length < MAX_STAFF_IMPORT_ROWS; r++) {
    const row = ws.getRow(r);
    const cells = [1, 2, 3, 4, 5, 6, 7].map((c) => cellToString(row.getCell(c).value));
    if (cells.every((c) => c === '')) continue;

    const errors: string[] = [];
    const username = cells[0].trim();
    const firstName = normalizePersianText(cells[1]);
    const lastName = normalizePersianText(cells[2]);
    const kindRaw = cells[3];
    const department = cells[4] ? normalizePersianText(cells[4]) : null;
    const nationalCode = cells[5] ? normalizeNationalCode(cells[5]) : null;
    const mobile = cells[6] ? normalizeMobile(cells[6]) : null;

    if (!username) errors.push('نام کاربری الزامی است');
    if (!firstName) errors.push('نام الزامی است');
    if (!lastName) errors.push('نام خانوادگی الزامی است');
    if (!kindRaw) errors.push('نوع کارمند الزامی است');
    if (nationalCode && !isValidNationalCode(nationalCode)) errors.push('کد ملی معتبر نیست');

    rows.push({
      rowNumber: r,
      username, firstName, lastName,
      kind: kindRaw,
      department,
      nationalCode: nationalCode ?? null,
      mobile: mobile ?? null,
      errors,
    });
  }
  return { headers: [...STAFF_TEMPLATE_HEADERS], rows };
}

export interface StaffCommitResult {
  batchId: string;
  created: number;
  rejected: number;
  credentials: { username: string; password: string }[];
}

export async function commitStaffImport(input: {
  fileName: string;
  rows: StaffRow[];
  actor: AuditActor;
  kindMap: (raw: string) => string | null;
}): Promise<StaffCommitResult | { error: string; rows: StaffRow[] }> {
  const invalid = input.rows.filter((r) => r.errors.length > 0 || !input.kindMap(r.kind));
  for (const r of input.rows) {
    const k = input.kindMap(r.kind);
    if ((!k || k === 'CAFETERIA') && !r.errors.includes('نوع کارمند نامعتبر است')) r.errors.push('نوع کارمند نامعتبر است');
  }
  const bad = input.rows.filter((r) => r.errors.length > 0);
  if (bad.length > 0) return { error: 'برخی ردیف‌ها نامعتبرند', rows: bad };

  // یکتایی نام کاربری داخل فایل
  const seen = new Set<string>();
  for (const r of input.rows) {
    if (seen.has(r.username)) {
      r.errors.push('نام کاربری تکراری در فایل');
    }
    seen.add(r.username);
  }
  const dup = input.rows.filter((r) => r.errors.length > 0);
  if (dup.length > 0) return { error: 'برخی ردیف‌ها نامعتبرند', rows: dup };

  const existing = await db.select({ username: users.username })
    .from(users).where(inArray(users.username, input.rows.map((r) => r.username)));
  const existingSet = new Set(existing.map((e) => e.username));
  for (const r of input.rows) {
    if (existingSet.has(r.username)) r.errors.push('نام کاربری قبلاً ثبت شده است');
  }
  const conflicts = input.rows.filter((r) => r.errors.length > 0);
  if (conflicts.length > 0) return { error: 'برخی ردیف‌ها نامعتبرند', rows: conflicts };

  const credentials: { username: string; password: string }[] = [];

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.insert(importBatches).values({
      kind: 'STAFF',
      fileName: input.fileName,
      status: 'PROCESSING',
      recordCount: input.rows.length,
      importedBy: input.actor.id,
    }).returning();

    let created = 0;
    for (const row of input.rows) {
      const temporary = generateTempPassword();
      const kind = input.kindMap(row.kind) as 'EMPLOYEE' | 'FACULTY' | 'CONTRACTOR' | 'CAFETERIA';

      const [user] = await tx.insert(users).values({
        role: kind === 'CAFETERIA' ? 'CAFETERIA_OPERATOR' : 'STAFF',
        username: row.username,
        passwordHash: await hash(temporary, { type: 2, memoryCost: 65536, timeCost: 3 }),
        mustChangePassword: true,
        isActive: true,
        displayName: `${row.firstName} ${row.lastName}`,
        mobile: row.mobile,
        createdBy: input.actor.id,
      }).returning();

      await tx.insert(staffProfiles).values({
        userId: user.id,
        kind,
        nationalCode: row.nationalCode ? encryptSecret(row.nationalCode) : null,
        nationalCodeHash: row.nationalCode ? blindIndex(row.nationalCode) : null,
        department: row.department,
      });

      await tx.insert(importRows).values({
        batchId: batch.id,
        rowNumber: row.rowNumber,
        payload: { username: row.username, kind } as never,
        status: 'CREATED',
        userId: user.id,
      });

      credentials.push({ username: row.username, password: temporary });
      created++;
    }

    await tx.update(importBatches).set({
      status: 'COMPLETED',
      createdCount: created,
      updatedAt: new Date(),
    }).where(eq(importBatches.id, batch.id));

    return { batchId: batch.id, created };
  });

  await audit({
    actor: input.actor,
    action: 'import:committed',
    entityType: 'import_batch',
    entityId: result.batchId,
    after: { kind: 'STAFF', fileName: input.fileName, created: result.created },
  });

  return { batchId: result.batchId, created: result.created, rejected: 0, credentials };
}

function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  require('node:crypto').randomFillSync(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function buildCredentialsWorkbook(
  credentials: { username: string; password: string }[],
  extra?: { displayName?: string }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('اعتبارنامه‌ها');
  ws.columns = [
    { header: 'نام کاربری', key: 'username', width: 24 },
    { header: 'رمز موقت', key: 'password', width: 24 },
    ...(extra ? [{ header: 'نام', key: 'displayName', width: 24 }] : []),
  ];
  ws.getRow(1).font = { bold: true };
  credentials.forEach((c, i) => {
    ws.addRow({ username: c.username, password: c.password, displayName: extra?.[i]?.displayName });
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export async function buildErrorReportWorkbook(rows: ValidatedRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('گزارش خطا');
  ws.columns = [
    { header: 'ردیف', key: 'row', width: 10 },
    { header: 'نوع', key: 'kind', width: 16 },
    { header: 'شماره دانشجویی', key: 'sn', width: 20 },
    { header: 'کد ملی (ماسک)', key: 'nc', width: 20 },
    { header: 'خطاها', key: 'errors', width: 60 },
    { header: 'هشدارها', key: 'warnings', width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      row: r.rowNumber,
      kind: r.kind,
      sn: r.data?.studentNumber ?? r.raw.studentNumber ?? '',
      nc: r.data ? maskNationalCode(r.data.nationalCode) : maskNationalCode(r.raw.nationalCode ?? ''),
      errors: r.errors.join(' | '),
      warnings: r.warnings.join(' | '),
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export { maskNationalCode, decryptSecret };
