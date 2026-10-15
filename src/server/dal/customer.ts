import { db } from '@/db';
import { requireRole } from './auth';
import { ROLES } from '@/lib/permissions';
import { reservations, menus, wallets, ledgerEntries, menuItems, foods } from '@/db/schema';
import { and, eq, isNull, sql, desc, gte, lte, inArray, count } from 'drizzle-orm';
import { getWeekMenuForGroup } from '@/server/services/menu';
import { getUserCustomerGroup, getMyReservations, qrDataUrl } from '@/server/services/reservation';
import { getOrCreateWallet, getWalletBalance } from '@/server/services/wallet';
import { getWalletLedger, getMyPayments } from '@/server/services/payment';
import { GROUP_LABELS, type CustomerGroup } from '@/server/services/menu';
import { toJalaliDateTime, toJalali } from '@/lib/jalali';

/** دسترسی به جداول برای دانشجو و کارمند */
export async function requireCustomer() {
  return requireRole(ROLES.STUDENT, ROLES.STAFF);
}

export async function getCustomerWeekMenu() {
  const ctx = await requireCustomer();
  const group = (await getUserCustomerGroup(ctx.user.id)) as CustomerGroup;

  const ref = new Date();
  const dayOfWeek = (ref.getDay() + 1) % 7;
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);

  const data = await getWeekMenuForGroup(group, weekStart);

  // موجودی کیف پول + رزروهای کاربر
  const balance = await getWalletBalance(ctx.user.id);
  const myReservations = await db.select().from(reservations)
    .where(and(eq(reservations.userId, ctx.user.id), isNull(reservations.deletedAt)));
  const myReservedItemIds = new Set(
    myReservations.filter((r) => r.status === 'CONFIRMED').map((r) => r.menuItemId),
  );

  // window per menu
  const menuIds = data.cells.map((c) => c.menuId).filter((x): x is string => Boolean(x));
  const menuRows = menuIds.length > 0
    ? await db.select().from(menus).where(inArray(menus.id, menuIds))
    : [];
  const menuById = new Map(menuRows.map((m) => [m.id, m]));

  return {
    ctx,
    group,
    groupLabel: GROUP_LABELS[group],
    days: data.days,
    slots: data.slots.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime.toISOString() })),
    cells: data.cells.map((c) => {
      const menu = c.menuId ? menuById.get(c.menuId) : undefined;
      return {
        ...c,
        reservationOpensAt: menu?.reservationOpensAt?.toISOString() ?? null,
        reservationClosesAt: menu?.reservationClosesAt?.toISOString() ?? null,
      };
    }),
    walletBalanceRials: balance,
    myReservedItemIds: [...myReservedItemIds],
  };
}

export async function getCustomerReservationsPage() {
  const ctx = await requireCustomer();
  const items = await getMyReservations(ctx.user.id);

  // QR برای رزروهای CONFIRMED
  const withQr = await Promise.all(
    items.map(async (item) => ({
      ...item,
      qrDataUrl: item.status === 'CONFIRMED' ? await qrDataUrl(item.qrToken) : null,
    })),
  );

  const balance = await getWalletBalance(ctx.user.id);

  return {
    ctx,
    items: withQr,
    walletBalanceRials: balance,
  };
}

export async function getCustomerWalletPage() {
  const ctx = await requireCustomer();
  const [ledger, payments, wallet] = await Promise.all([
    getWalletLedger(ctx.user.id, 50),
    getMyPayments(ctx.user.id, 20),
    getOrCreateWallet(ctx.user.id),
  ]);

  return {
    ctx,
    balanceRials: wallet.balanceRials,
    ledger: ledger.entries,
    payments,
  };
}

/* ───────────── همکاری — اسکن سلف ───────────── */

export async function requireCafeteria() {
  return requireRole(ROLES.CAFETERIA_OPERATOR);
}

export async function getCafeteriaPage() {
  const ctx = await requireCafeteria();
  const { getTodayReservations } = await import('@/server/services/reservation');
  const items = await getTodayReservations();

  return {
    ctx,
    items,
    counts: {
      total: items.length,
      confirmed: items.filter((i) => i.status === 'CONFIRMED').length,
      used: items.filter((i) => i.status === 'USED').length,
      cancelled: items.filter((i) => i.status === 'CANCELLED').length,
    },
  };
}

/* ───────────── گزارش‌ها — مدیر تغذیه / مدیر ارشد ───────────── */

export async function requireReporter() {
  return requireRole(ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN, ROLES.VICE_STUDENT);
}

export async function getReservationReport(weeks = 4) {
  await requireReporter();

  const ref = new Date();
  ref.setHours(0, 0, 0, 0);
  const start = new Date(ref);
  start.setDate(start.getDate() - weeks * 7);

  // رزروها در بازه
  const allReservations = await db.select().from(reservations)
    .where(and(gte(reservations.createdAt, start), isNull(reservations.deletedAt)));

  const itemIds = [...new Set(allReservations.map((r) => r.menuItemId))];
  const items = itemIds.length > 0
    ? await db.select().from(menuItems).where(inArray(menuItems.id, itemIds))
    : [];
  const menuIds = [...new Set(items.map((i) => i.menuId))];
  const menuRows = menuIds.length > 0
    ? await db.select().from(menus).where(inArray(menus.id, menuIds))
    : [];
  const foodIds = [...new Set(items.map((i) => i.foodId))];
  const foodRows = foodIds.length > 0
    ? await db.select().from(foods).where(inArray(foods.id, foodIds))
    : [];

  const itemById = new Map(items.map((i) => [i.id, i]));
  const menuById = new Map(menuRows.map((m) => [m.id, m]));
  const foodById = new Map(foodRows.map((f) => [f.id, f]));

  // تجمیع روزانه
  const byDay = new Map<string, { date: string; count: number; revenue: number }>();
  const byStatus = new Map<string, number>();
  const byFood = new Map<string, { name: string; count: number; revenue: number }>();

  for (const r of allReservations) {
    const item = itemById.get(r.menuItemId);
    const menu = item ? menuById.get(item.menuId) : undefined;
    const food = item ? foodById.get(item.foodId) : undefined;
    const dayKey = menu ? toJalali(menu.date) : toJalali(r.createdAt);

    const dayEntry = byDay.get(dayKey) ?? { date: dayKey, count: 0, revenue: 0 };
    dayEntry.count++;
    if (r.status === 'CONFIRMED' || r.status === 'USED') {
      dayEntry.revenue += r.priceSnapshotRials;
    }
    byDay.set(dayKey, dayEntry);

    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

    if (food) {
      const f = byFood.get(food.id) ?? { name: food.name, count: 0, revenue: 0 };
      f.count++;
      if (r.status === 'CONFIRMED' || r.status === 'USED') f.revenue += r.priceSnapshotRials;
      byFood.set(food.id, f);
    }
  }

  // خلاصه
  const total = allReservations.length;
  const confirmed = allReservations.filter((r) => r.status === 'CONFIRMED' || r.status === 'USED').length;
  const used = allReservations.filter((r) => r.status === 'USED').length;
  const cancelled = allReservations.filter((r) => r.status === 'CANCELLED').length;
  const revenue = allReservations
    .filter((r) => r.status === 'CONFIRMED' || r.status === 'USED')
    .reduce((a, r) => a + r.priceSnapshotRials, 0);

  const topFoods = [...byFood.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    summary: { total, confirmed, used, cancelled, revenueRials: revenue },
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byStatus: [...byStatus.entries()].map(([status, value]) => ({ status, value })),
    topFoods,
  };
}

// import foods lazily to avoid circular issues
import { foods as foodsTable } from '@/db/schema';

export { GROUP_LABELS };
export { toJalaliDateTime };
