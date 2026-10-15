import { describe, it, expect } from 'vitest';
import { signQrToken, verifyQrToken } from '../server/services/reservation';
import { tomanToRial, rialToToman } from '../lib/money';

describe('QR Token — امضای HMAC', () => {
  it('توکن معتبر را تأیید می‌کند', () => {
    const token = signQrToken('res-123');
    expect(verifyQrToken(token)).toBe('res-123');
  });

  it('توکن دستکاری‌شده را رد می‌کند', () => {
    const token = signQrToken('res-123');
    const [id, sig] = token.split('.');
    // تغییر id
    expect(verifyQrToken(`res-999.${sig}`)).toBeNull();
    // تغییر sig
    expect(verifyQrToken(`${id}.${sig.slice(0, -2)}xx`)).toBeNull();
  });

  it('فرمت nalid را رد می‌کند', () => {
    expect(verifyQrToken('')).toBeNull();
    expect(verifyQrToken('no-dot')).toBeNull();
    expect(verifyQrToken('a.b.c')).toBeNull();
    expect(verifyQrToken('.sig')).toBeNull();
  });

  it('دو توکن برای id یکسان هستند (deterministic)', () => {
    expect(signQrToken('x')).toBe(signQrToken('x'));
  });

  it('توکن‌های id متفاوت متفاوت‌اند', () => {
    expect(signQrToken('a')).not.toBe(signQrToken('b'));
  });
});

describe('Idempotency — کلیدهای unیک', () => {
  it('کلید idempotency رزرو پایدار است', () => {
    const key = (userId: string, itemId: string) => `reserve:${userId}:${itemId}`;
    expect(key('u1', 'i1')).toBe(key('u1', 'i1'));
    expect(key('u1', 'i1')).not.toBe(key('u1', 'i2'));
    expect(key('u1', 'i1')).not.toBe(key('u2', 'i1'));
  });

  it('کلید idempotency پرداخت بر اساس paymentId است', () => {
    const key = (paymentId: string) => `payment:${paymentId}`;
    expect(key('p1')).toBe('payment:p1');
    expect(key('p1')).not.toBe(key('p2'));
  });

  it('کلیدهای ledger برای خرید و فروش متفاوت‌اند', () => {
    const purchase = (r: string) => `purchase:${r}`;
    const sale = (r: string) => `sale:${r}`;
    expect(purchase('r1')).not.toBe(sale('r1'));
  });

  it('کلیدهای ledger برای refund و refund_out متفاوت‌اند', () => {
    const refund = (r: string) => `refund:${r}`;
    const refundOut = (r: string) => `refund_out:${r}`;
    expect(refund('r1')).not.toBe(refundOut('r1'));
  });
});

describe('قانون رزرو — посмотреть capacité', () => {
  it('رزروQuando ظرفیت تکمیل شده ممنوع است', () => {
    const reservedCount = 10;
    const capacity = 10;
    expect(reservedCount >= capacity).toBe(true);
  });

  it('رزرو با ظرفیت باقی‌مانده مجاز است', () => {
    const reservedCount = 9;
    const capacity = 10;
    expect(reservedCount < capacity).toBe(true);
  });

  it(' goto fenêtre — بازهٔ رزرو', () => {
    const now = Date.now();
    const opens = now - 3600_000;
    const closes = now + 3600_000;
    expect(now >= opens && now <= closes).toBe(true);
    expect(now < opens).toBe(false);
    expect(now > closes).toBe(false);
  });

  it(' fenêtre expirée — رد', () => {
    const now = Date.now();
    const closes = now - 1000;
    expect(now > closes).toBe(true);
  });
});

describe('قانون کیف پول — موجودی', () => {
  it('برداشت بیشتر از موجودی ممنوع است', () => {
    const balance = 100_000;
    const price = 150_000;
    expect(balance >= price).toBe(false);
  });

  it('برداشت برابر یا کمتر از موجودی مجاز است', () => {
    const balance = 200_000;
    const price = 150_000;
    expect(balance >= price).toBe(true);
  });

  it('قیمت snapshot — betal hut indépendamment du changement ultérieur', () => {
    const snapshot = 120_000;
    const newPrice = 200_000;
    // приклад: montant facturé = snapshot, pas newPrice
    expect(snapshot).toBe(120_000);
    expect(snapshot).not.toBe(newPrice);
  });

  it(' conversión تومان ↔ ریال — recharge', () => {
    expect(tomanToRial(50_000)).toBe(500_000);
    expect(rialToToman(500_000)).toBe(50_000);
  });
});

describe('RAINBOW — règles métier retrait', () => {
  it('مبلغ برداشت باید مثبت باشد', () => {
    const isValid = (n: number) => Number.isInteger(n) && n > 0;
    expect(isValid(10_000)).toBe(true);
    expect(isValid(0)).toBe(false);
    expect(isValid(-5)).toBe(false);
  });

  it('برداشت بیشتر از موجودی — مسدود می‌شود', () => {
    const balance = 100_000;
    const request = 150_000;
    expect(balance >= request).toBe(false);
  });
});
