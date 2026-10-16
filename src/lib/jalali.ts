import { format, parse } from 'date-fns-jalali';
import { toLatinDigits } from './validation';
import { TEHRAN, tehranDayKey } from './tehran-time';

export { TEHRAN, tehranDayKey, mealInstant, mealEndInstant, toDayKey, addDaysToKey } from './tehran-time';
export {
  startOfTehranDay,
  isSameTehranDay,
  todayTehran,
  tehranMidnight,
  startOfMenuDay,
} from './tehran-time';

/**
 * تاریخ شمسی یک «روز منو» (کلید روز YYYY-MM-DD).
 * از فاز ۱-۴ ستون menus.date نوع `date` است؛ نیمه‌شب تهرانِ همان روز
 * به تاریخ شمسی تبدیل می‌شود تا نمایش‌ها دقیقاً روز تقویمی تهران باشند.
 */
export function menuDayToJalali(dayKey: string | Date): string {
  const key = typeof dayKey === 'string' ? dayKey.slice(0, 10) : tehranDayKey(dayKey);
  return toJalali(new Date(`${key}T00:00:00+03:30`));
}

/** نام بلند روز (شنبه، ۱۲ آبان ۱۴۰۴) برای یک روز منو */
export function menuDayToJalaliLong(dayKey: string | Date): string {
  const key = typeof dayKey === 'string' ? dayKey.slice(0, 10) : tehranDayKey(dayKey);
  return toJalaliLong(new Date(`${key}T00:00:00+03:30`));
}

/** تاریخ شمسی YYYY/MM/DD به وقت تهران — مستقل از TZ سرور */
export function toJalali(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}/${get('month')}/${get('day')}`;
}
export function toJalaliLong(date: Date) {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
export function toJalaliDateTime(date: Date) {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** تاریخ شمسی → لحظهٔ نیمه‌شب تهران همان روز (مستقل از TZ سرور) */
export function fromJalali(date: string): Date {
  const d = parse(toLatinDigits(date), 'yyyy/MM/dd', new Date());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${day}T00:00:00${'+03:30'}`);
}

/** تاریخ و ساعت شمسی → لحظهٔ متناظر به وقت تهران (مستقل از TZ سرور) */
export function fromJalaliDateTime(date: string, time: string): Date {
  const d = fromJalali(date);
  const [hh, mm] = toLatinDigits(time).split(':').map(Number);
  const dayKey = tehranDayKey(d);
  return new Date(`${dayKey}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:30`);
}

export function nowJalali() {
  return toJalaliLong(new Date());
}
export function isPast(date: Date) {
  return date.getTime() < Date.now();
}
export function jalaliWeekdayIndex(date: Date) {
  return (date.getDay() + 1) % 7;
}
export const PERSIAN_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const;
export function persianDay(date: string | Date) {
  return {
    day: new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN, day: 'numeric' }).format(new Date(date)),
    month: new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN, month: 'long' }).format(new Date(date)),
    weekday: new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN, weekday: 'long' }).format(new Date(date)),
  };
}
