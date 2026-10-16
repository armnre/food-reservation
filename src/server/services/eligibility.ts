import { studentProfiles, users } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { BizError } from './wallet';
import type { db } from '@/db';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * بررسی «اعتبار نشست و وضعیت کاربر» برای عملیات مالی و رزرو (فاز ۱-۶).
 *
 * چرا داخل تراکنش: پیش از این، فعال‌بودن کاربر بیرون از تراکنش خوانده می‌شد.
 * در فاصلهٔ بین آن خواندن و ثبت تراکنش، مدیر می‌توانست کاربر را غیرفعال کند
 * (یا وضعیت دانشجو را به ON_LEAVE/WITHDRAWN/GRADUATED تغییر دهد) و عملیات مالی
 * همچنان با موفقیت ثبت می‌شد. این تابع همان چک را *داخل* تراکنش و زیر قفل
 * ردیف کاربر انجام می‌دهد تا خواندن و نوشتن روی یک وضعیتِ سازگار باشد.
 *
 * قواعد:
 *  ۱. کاربر باید وجود داشته باشد و حذف نرم نشده باشد.
 *  ۲. `users.is_active` باید true باشد.
 *  ۳. اگر نقش کاربر STUDENT است، `student_profiles.status` باید دقیقاً ACTIVE باشد.
 *     (غیرفعال‌سازی دانشجو هر دو را با هم تغییر می‌دهد، ولی برای اطمینان هر دو
 *     بررسی می‌شوند — هیچ‌کدام به تنهایی کافی نیست.)
 *
 * @throws BizError با پیام فارسی مناسبِ عملیات
 */
export async function assertUserEligibleInTx(
  tx: Tx,
  userId: string,
  purpose: 'reserve' | 'topup' | 'withdraw' | 'charge',
): Promise<void> {
  // قفل فقط روی ردیف users — PostgreSQL اجازه نمی‌دهد FOR UPDATE روی سمتِ
  // nullable یک outer join اعمال شود، پس پروفایل دانشجو در پرس‌وجوی جدا خوانده
  // می‌شود. ترتیب مهم است: اول قفل کاربر (تا غیرفعال‌سازی هم‌زمان منتظر بماند)،
  // بعد خواندن وضعیت دانشجو.
  const rows = await tx
    .select({
      id: users.id,
      role: users.role,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .for('update')
    .limit(1);

  const user = rows[0];
  if (!user) {
    throw new BizError('کاربر یافت نشد');
  }

  let studentStatus: string | null = null;
  if (user.role === 'STUDENT') {
    const profile = await tx
      .select({ status: studentProfiles.status })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId))
      .limit(1);
    studentStatus = profile[0]?.status ?? null;
  }
  if (!user.isActive) {
    throw new BizError(
      purpose === 'withdraw'
        ? 'حساب شما غیرفعال است؛ برای برداشت با معاونت دانشجویی تماس بگیرید'
        : 'حساب شما غیرفعال است؛ امکان این عملیات وجود ندارد',
    );
  }
  if (user.role === 'STUDENT' && studentStatus !== null && studentStatus !== 'ACTIVE') {
    const label = STUDENT_STATUS_LABELS[studentStatus] ?? studentStatus;
    throw new BizError(`وضعیت تحصیلی شما «${label}» است؛ امکان این عملیات وجود ندارد`);
  }
}

/** برچسب فارسی وضعیت دانشجو — برای پیام خطای خوانا */
export const STUDENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'فعال',
  ON_LEAVE: 'مرخصی تحصیلی',
  WITHDRAWN: 'انصرافی',
  GRADUATED: 'فارغ‌التحصیل',
};
