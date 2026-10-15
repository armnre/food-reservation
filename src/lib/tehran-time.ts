/**
 * زمان تهران — تنها مرجع محاسبات زمانی تقویمی سامانه (فاز ۱-۵).
 *
 * قاعده: هر «روز منو» یک روز تقویمی تهران است، مستقل از TZ سرور.
 * ایران از ۱۴۰۱ (۲۰۲۲) ساعت تابستانی ندارد؛ افست ثابت +03:30 معتبر است.
 * اگر روزی DST بازگردد، این ماژول تنها نقطهٔ اصلاح است.
 */

export const TEHRAN = 'Asia/Tehran';
export const TEHRAN_OFFSET = '+03:30';

/** کلید روز تقویمی تهران به شکل YYYY-MM-DD — مستقل از TZ سرور */
export function tehranDayKey(date: Date): string {
  // en-CA قالب YYYY-MM-DD می‌دهد
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** لحظهٔ نیمه‌شبِ تهران برای یک کلید روز YYYY-MM-DD */
export function tehranMidnight(dayKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error(`کلید روز نامعتبر: ${dayKey}`);
  return new Date(`${dayKey}T00:00:00${TEHRAN_OFFSET}`);
}

/** ابتدای روز تهران برای یک لحظه */
export function startOfTehranDay(date: Date): Date {
  return tehranMidnight(tehranDayKey(date));
}

/** آیا دو لحظه در یک روز تقویمی تهران هستند؟ */
export function isSameTehranDay(a: Date, b: Date): boolean {
  return tehranDayKey(a) === tehranDayKey(b);
}

/** امروزِ تهران */
export function todayTehran(): Date {
  return startOfTehranDay(new Date());
}

/**
 * لحظهٔ شروع وعده — از «روز تقویمی Tehran منو» و «ساعت وعده».
 * ساعت وعده به‌صورت timestamp در روز ۱۹۷۰-۰۱-۰۱ ذخیره می‌شود؛
 * ساعت آن (نمای UTC) به‌عنوان ساعت دیواری تهران تفسیر می‌شود.
 */
export function mealInstant(day: Date, slot: Date): Date {
  const dayKey = tehranDayKey(day);
  const time = slot.toISOString().slice(11, 19);
  return new Date(`${dayKey}T${time}${TEHRAN_OFFSET}`);
}
