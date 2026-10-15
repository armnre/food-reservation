import { describe, it, expect } from 'vitest';
import { getClientIp } from '../lib/client-ip';

function req(xff: string | null, socketIp = '10.0.0.1') {
  return {
    headers: { get: (n: string) => (n.toLowerCase() === 'x-forwarded-for' ? xff : null) },
    ip: null,
    socketRemoteAddress: socketIp,
  };
}

describe('تشخیص IP کلاینت', () => {
  it('با hop=0 هدر جعلی اثری ندارد و IP سوکت برمی‌گردد', () => {
    const r = req('203.0.113.9, 198.51.100.7');
    expect(getClientIp(r, 0)).toBe('10.0.0.1');
  });

  it('با hop=0 حتی هدر تکی هم خوانده نمی‌شود', () => {
    expect(getClientIp(req('1.2.3.4'), 0)).toBe('10.0.0.1');
  });

  it('با hop=1 آخرین مقدار زنجیره مبنا قرار می‌گیرد', () => {
    const r = req('203.0.113.9, 198.51.100.7');
    expect(getClientIp(r, 1)).toBe('198.51.100.7');
  });

  it('با hop=2 مقدار دوم از انتها خوانده می‌شود', () => {
    const r = req('203.0.113.9, 198.51.100.7, 192.0.2.5');
    expect(getClientIp(r, 2)).toBe('198.51.100.7');
  });

  it('اولین مقدار زنجیره (قابل جعل) هرگز انتخاب نمی‌شود', () => {
    const r = req('8.8.8.8, 203.0.113.1');
    expect(getClientIp(r, 1)).toBe('203.0.113.1');
    expect(getClientIp(r, 1)).not.toBe('8.8.8.8');
  });

  it('زنجیره کوتاه‌تر از hop مورد اعتماد ⇒ IP سوکت', () => {
    const r = req('203.0.113.9');
    expect(getClientIp(r, 3)).toBe('10.0.0.1');
  });

  it('بدون هدر ⇒ IP سوکت', () => {
    expect(getClientIp(req(null), 2)).toBe('10.0.0.1');
  });

  it('IP نوع IPv6 ماسک‌شده را نرمال می‌کند', () => {
    const r = {
      headers: { get: (n: string) => (n.toLowerCase() === 'x-forwarded-for' ? '::ffff:203.0.113.5' : null) },
      ip: null,
      socketRemoteAddress: '::ffff:10.0.0.1',
    };
    expect(getClientIp(r, 1)).toBe('203.0.113.5');
  });

  it('هدر نامعتبر نادیده گرفته می‌شود', () => {
    expect(getClientIp(req('not-an-ip'), 1)).toBe('10.0.0.1');
  });
});
