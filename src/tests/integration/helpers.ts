import { db, pool } from '@/db';
import {
  users, studentProfiles, foods, mealSlots, menus, menuItems, menuItemPrices,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { encryptSecret, blindIndex } from '@/lib/crypto';
import { todayTehran } from '@/lib/tehran-time';
import { recordTransactionInTx } from '@/server/services/wallet';
import type { AuditActor } from '@/lib/audit';

/** بستن pool در پایان فایل تست */
export async function closePool() {
  await pool.end();
}

export function testActor(userId: string, role = 'STUDENT'): AuditActor {
  return { id: userId, role, ip: null, userAgent: 'integration-test' };
}

/** کد ملی معتبر بر اساس رقم کنترلی */
export function makeNationalCode(seed: number): string {
  const base = String(10000000 + (seed % 89999999)).padStart(9, '0').slice(0, 9);
  const digits = base.split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (10 - i), 0);
  const rem = sum % 11;
  const check = rem < 2 ? rem : 11 - rem;
  return `${base}${check}`;
}

let studentSeq = 0;

export async function createStudent(opts: { role?: string; active?: boolean; withProfile?: boolean } = {}) {
  const seq = ++studentSeq;
  const username = `stu${String(seq).padStart(4, '0')}${Date.now() % 100000}`;
  const nationalCode = makeNationalCode(5000 + seq);
  const role = opts.role ?? 'STUDENT';
  const [u] = await db.insert(users).values({
    role: role as never,
    username,
    passwordHash: null,
    mustChangePassword: true,
    isActive: opts.active ?? true,
    displayName: `دانشجوی تست ${seq}`,
  }).returning();
  if (opts.withProfile !== false) {
    await db.insert(studentProfiles).values({
      userId: u.id,
      studentNumber: username,
      nationalCode: encryptSecret(nationalCode),
      nationalCodeHash: blindIndex(nationalCode),
      firstName: 'دانشجو',
      lastName: `تست ${seq}`,
      status: 'ACTIVE',
      customerGroup: 'STUDENT',
    });
  }
  return { userId: u.id, username, nationalCode };
}

export async function createStaffUser(role: string, opts: { active?: boolean } = {}) {
  const seq = ++studentSeq;
  const username = `staff${String(seq).padStart(4, '0')}${Date.now() % 100000}`;
  const [u] = await db.insert(users).values({
    role: role as never,
    username,
    passwordHash: null,
    mustChangePassword: false,
    isActive: opts.active ?? true,
    displayName: `کاربر ${role} ${seq}`,
  }).returning();
  return { userId: u.id, username, role };
}

let foodSeq = 0;

export async function createMenuItemWithPrice(opts: {
  priceRials?: number;
  capacity?: number;
  groups?: string[];
  dayOffset?: number;
} = {}) {
  const seq = ++foodSeq;
  const price = opts.priceRials ?? 100_000;
  const capacity = opts.capacity ?? 50;
  const groups = (opts.groups ?? ['STUDENT']) as Array<'STUDENT' | 'EMPLOYEE' | 'FACULTY' | 'CONTRACTOR'>;

  const [food] = await db.insert(foods).values({ name: `غذای تست ${seq}`, category: 'MAIN' }).returning();
  const [slot] = await db.insert(mealSlots).values({
    name: `وعده ${seq}`,
    startTime: new Date('1970-01-01T11:30:00Z'),
    endTime: new Date('1970-01-01T14:00:00Z'),
    isActive: true,
  }).returning();
  const day = new Date(todayTehran().getTime() + (opts.dayOffset ?? 1) * 24 * 3600 * 1000);
  const [menu] = await db.insert(menus).values({
    date: day,
    mealSlotId: slot.id,
    status: 'PUBLISHED',
    reservationOpensAt: new Date(Date.now() - 3600_000),
    reservationClosesAt: new Date(Date.now() + 24 * 3600_000),
  }).returning();
  const [item] = await db.insert(menuItems).values({
    menuId: menu.id,
    foodId: food.id,
    capacity,
    reservedCount: 0,
  }).returning();
  await db.insert(menuItemPrices).values(groups.map((g) => ({
    menuItemId: item.id,
    customerGroup: g,
    priceRials: price,
  })));
  return { menuId: menu.id, itemId: item.id, foodId: food.id, slotId: slot.id, priceRials: price, capacity };
}

/** شارژ کیف کاربر با جفت‌سازی دفتر کل (کاربر +، درگاه −) — برای تست ناوردایی */
export async function depositUserWallet(userId: string, amountRials: number, description = 'واریز تست') {
  const { getOrCreateWalletInTx, getSystemWalletInTx } = await import('@/server/services/wallet');
  await db.transaction(async (tx) => {
    const w = await getOrCreateWalletInTx(tx, userId);
    const clearing = await getSystemWalletInTx(tx, 'GATEWAY_CLEARING');
    await recordTransactionInTx(tx, {
      idempotencyKey: `dep:${randomUUID()}`,
      description,
      legs: [
        { walletId: w.id, amountRials: amountRials, entryType: 'DEPOSIT', description },
        { walletId: clearing.id, amountRials: -amountRials, entryType: 'DEPOSIT', description: 'تسویه درگاه تست' },
      ],
    });
  });
}

export async function getWalletBalance(userId: string): Promise<number> {
  const { wallets } = await import('@/db/schema');
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return w?.balanceRials ?? 0;
}
