import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/db';
import { users, studentProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { setStudentStatus } from '@/server/services/student-status';
import { createStudent, createStaffUser, closePool } from './helpers';

/**
 * فاز ۱-۳ — ارتقای دسترسی در تغییر وضعیت ممنوع است.
 */

describe('کنترل دسترسی تغییر وضعیت دانشجو', () => {
  it('معاونت نمی‌تواند مدیر ارشد یا کارمند سلف را تغییر دهد', async () => {
    const vice = await createStaffUser('VICE_STUDENT');
    const admin = await createStaffUser('SUPER_ADMIN', { active: true });
    const cafeteria = await createStaffUser('CAFETERIA_OPERATOR', { active: true });
    const student = await createStudent();

    // تلاش برای غیرفعال‌کردن مدیر ارشد و کارمند سلف توسط معاونت
    const res = await setStudentStatus({
      actor: { id: vice.userId, role: 'VICE_STUDENT' },
      userIds: [admin.userId, cafeteria.userId, student.userId],
      status: 'ON_LEAVE',
    });

    // فقط دانشجو تغییر کرده است — مدیر و کارمند سلف اصلاً پروفایل دانشجو ندارند
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.updated).toBe(1);
      expect(res.skipped).toBe(0); // اهداف غیر دانشجو از اساس در نتایج نیستند
    }

    // مدیر ارشد و کارمند سلف هنوز فعال‌اند
    const [adminRow] = await db.select().from(users).where(eq(users.id, admin.userId));
    expect(adminRow.isActive).toBe(true);
    const [cafeRow] = await db.select().from(users).where(eq(users.id, cafeteria.userId));
    expect(cafeRow.isActive).toBe(true);

    // دانشجو غیرفعال شده
    const [studentRow] = await db.select().from(users).where(eq(users.id, student.userId));
    expect(studentRow.isActive).toBe(false);
    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, student.userId));
    expect(profile.status).toBe('ON_LEAVE');
  });

  it('کاربری با نقش غیر دانشجویی حتی با پروفایل دانشجو، هدف مجاز نیست', async () => {
    const vice = await createStaffUser('VICE_STUDENT');
    // کاربر با نقش SUPER_ADMIN که پروفایل دانشجو دارد (حالت خرابکارانه)
    const { userId } = await createStudent({ role: 'SUPER_ADMIN' });

    const res = await setStudentStatus({
      actor: { id: vice.userId, role: 'VICE_STUDENT' },
      userIds: [userId],
      status: 'WITHDRAWN',
    });

    expect(res.ok).toBe(false); // هیچ هدف مجازی نبود
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.isActive).toBe(true);
  });

  it('مدیر ارشد می‌تواند دانشجو را تغییر دهد', async () => {
    const admin = await createStaffUser('SUPER_ADMIN');
    const student = await createStudent();

    const res = await setStudentStatus({
      actor: { id: admin.userId, role: 'SUPER_ADMIN' },
      userIds: [student.userId],
      status: 'GRADUATED',
    });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, student.userId));
    expect(row.isActive).toBe(false);
  });

  it('فهرست بیش از ۵۰۰ هدف رد می‌شود', async () => {
    const vice = await createStaffUser('VICE_STUDENT');
    const fake = Array.from(
      { length: 501 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const res = await setStudentStatus({
      actor: { id: vice.userId, role: 'VICE_STUDENT' },
      userIds: fake,
      status: 'ACTIVE',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('۵۰۰');
  });
});

afterAll(async () => {
  await closePool();
});
