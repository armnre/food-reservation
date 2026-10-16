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
 * کلید روز تهران از ورودی انعطاف‌پذیر.
 * از فاز ۱-۴ ستون menus.date نوع `date` است و مقدار آن رشتهٔ YYYY-MM-DD؛
 * این تابع هم رشته و هم Date را می‌پذیرد تا هیچ فراخوانی مجبور به تبدیل دستی نباشد.
 */
export function toDayKey(day: string | Date): string {
  if (typeof day === 'string') {
    const key = day.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`کلید روز نامعتبر: ${day}`);
    return key;
  }
  return tehranDayKey(day);
}

/** نیمه‌شب تهران برای یک روز منو (رشته یا Date) */
export function startOfMenuDay(day: string | Date): Date {
  return tehranMidnight(toDayKey(day));
}

/**
 * لحظهٔ شروع وعده — از «روز تقویمی Tehran منو» و «ساعت وعده».
 * ساعت وعده به‌صورت timestamp در روز ۱۹۷۰-۰۱-۰۱ ذخیره می‌شود؛
 * ساعت آن (نمای UTC) به‌عنوان ساعت دیواری تهران تفسیر می‌شود.
 */
export function mealInstant(day: string | Date, slot: Date): Date {
  const dayKey = toDayKey(day);
  const time = slot.toISOString().slice(11, 19);
  return new Date(`${dayKey}T${time}${TEHRAN_OFFSET}`);
}

/** لحظهٔ پایان وعده — همان قاعدهٔ mealInstant با ساعت پایان */
export function mealEndInstant(day: string | Date, slotEndTime: Date): Date {
  return mealInstant(day, slotEndTime);
}

/** فاصلهٔ روز بین دو کلید روز (مثلاً برای بازهٔ هفته) */
export function addDaysToKey(dayKey: string, days: number): string {
  const base = tehranMidnight(dayKey);
  base.setUTCDate(base.getUTCDate() + days);
  return tehranDayKey(base);
}
