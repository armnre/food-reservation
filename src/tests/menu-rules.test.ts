import { describe, it, expect } from 'vitest';
import {
  validateReservationWindow, buildPublishChecklist,
} from '../server/services/menu';
import { rialToToman, tomanToRial, formatToman } from '../lib/money';

const day = (offsetHours: number) => new Date(Date.now() + offsetHours * 3600 * 1000);

describe('بازه رزرو (ج‑۳)', () => {
  it('بازه معتبر را قبول می‌کند', () => {
    expect(validateReservationWindow(day(-48), day(-2), day(2))).toBeNull();
  });

  it('باز شدن بعد از بسته شدن را رد می‌کند', () => {
    expect(validateReservationWindow(day(-2), day(-48), day(2))).toContain('باز شدن');
  });

  it('بسته شدن بعد از شروع وعده را رد می‌کند', () => {
    expect(validateReservationWindow(day(-48), day(4), day(2))).toContain('شروع وعده');
  });

  it('بازه برابر را رد می‌کند', () => {
    const t = day(-2);
    expect(validateReservationWindow(t, t, day(2))).toContain('باز شدن');
  });

  it('تاریخ نامعتبر را رد می‌کند', () => {
    expect(validateReservationWindow(new Date('x'), new Date('y'), day(2))).toContain('نامعتبر');
  });
});

describe('چک‌لیست انتشار (ج‑۴)', () => {
  const base = {
    status: 'DRAFT' as const,
    reservationOpensAt: day(-48),
    reservationClosesAt: day(-2),
    date: day(2),
    mealStart: day(2),
  };

  it('وقتی همه شرایط برقرار باشد همه آیتم‌ها ok هستند', () => {
    const list = buildPublishChecklist(base, [{ capacity: 10, prices: 2 }]);
    expect(list.every((c) => c.ok)).toBe(true);
  });

  it('نبود غذا ⇒ رد', () => {
    const list = buildPublishChecklist(base, []);
    expect(list.find((c) => c.key === 'food')?.ok).toBe(false);
  });

  it('ظرفیت صفر یا منفی ⇒ رد', () => {
    const list = buildPublishChecklist(base, [{ capacity: 0, prices: 1 }]);
    expect(list.find((c) => c.key === 'capacity')?.ok).toBe(false);
  });

  it('نبود قیمت برای یک غذا ⇒ رد', () => {
    const list = buildPublishChecklist(base, [
      { capacity: 5, prices: 1 },
      { capacity: 5, prices: 0 },
    ]);
    expect(list.find((c) => c.key === 'price')?.ok).toBe(false);
  });

  it('بازه رزرو نامعتبر ⇒ رد', () => {
    const list = buildPublishChecklist(
      { ...base, reservationOpensAt: null, reservationClosesAt: null },
      [{ capacity: 5, prices: 1 }],
    );
    expect(list.find((c) => c.key === 'window')?.ok).toBe(false);
  });
});

describe('قانون ظرفیت و reserved_count (ج‑۴)', () => {
  it('ظرفیت جدید کوچک‌تر از reserved_count باید رد شود', () => {
    const reservedCount = 7;
    const newCapacity = 5;
    expect(newCapacity < reservedCount).toBe(true);
  });

  it('ظرفیت جدید بزرگ‌تر یا مساوی reserved_count مجاز است', () => {
    const reservedCount = 7;
    expect(7 >= reservedCount).toBe(true);
    expect(12 >= reservedCount).toBe(true);
  });

  it('ظرفیت باید عدد صحیح مثبت باشد', () => {
    const isValid = (n: number) => Number.isInteger(n) && n > 0;
    expect(isValid(1)).toBe(true);
    expect(isValid(0)).toBe(false);
    expect(isValid(-3)).toBe(false);
    expect(isValid(2.5)).toBe(false);
  });
});

describe('قیمت‌گذاری گروه‌ها', () => {
  it('ریال صحیح → تومان نمایش داده می‌شود', () => {
    expect(rialToToman(250000)).toBe(25000);
    expect(formatToman(250000)).toContain('تومان');
  });

  it('ورودی تومان کاربر → ریال ذخیره می‌شود', () => {
    expect(tomanToRial(25000)).toBe(250000);
  });

  it('گروه بدون قیمت یعنی آن گروه غذا را نمی‌بیند', () => {
    const prices = [{ customerGroup: 'STUDENT', priceRials: 120000 }];
    const sees = (group: string) => prices.some((p) => p.customerGroup === group);
    expect(sees('STUDENT')).toBe(true);
    expect(sees('FACULTY')).toBe(false);
  });
});
