import { requireRole } from './auth';
import { ROLES } from '@/lib/permissions';
import {
  listFoods, listMealSlots, getWeekPlanner, getWeekMenuForGroup,
  getNutritionStats, buildPublishChecklist, CATEGORY_LABELS, GROUP_LABELS,
  STATUS_LABELS, type CustomerGroup, type MenuStatus,
} from '@/server/services/menu';
import { db } from '@/db';
import { menus, menuItems, menuItemPrices, foods, mealSlots } from '@/db/schema';
import { eq, inArray, isNull, and, asc } from 'drizzle-orm';
import { toJalaliDateTime, mealInstant } from '@/lib/jalali';

/** مدیریت کامل: مدیر تغذیه و مدیر ارشد */
export async function requireMenuManage() {
  return requireRole(ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
}

/** فقط‌خواندنی: معاونت هم می‌تواند ببیند */
export async function requireMenuRead() {
  return requireRole(ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN, ROLES.VICE_STUDENT);
}

export async function getFoodsForManage(q?: string, category?: string, includeInactive = true) {
  await requireMenuManage();
  const rows = await listFoods({ q, category, includeInactive });
  return {
    items: rows.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      category: f.category,
      categoryLabel: CATEGORY_LABELS[f.category as keyof typeof CATEGORY_LABELS] ?? f.category,
      calories: f.calories,
      tags: (f.tags ?? []) as string[],
      thumbPath: f.thumbPath,
      imagePath: f.imagePath,
      isActive: f.isActive,
      createdAt: toJalaliDateTime(f.createdAt),
    })),
  };
}

export async function getMealSlotsForManage() {
  await requireMenuRead();
  const rows = await listMealSlots();
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
    isActive: s.isActive,
  }));
}

export async function getWeekPlannerForManage(weekStart: Date) {
  const ctx = await requireMenuRead();
  const data = await getWeekPlanner(weekStart);

  // checklist هر منو
  const menuIds = data.cells.filter((c) => c.menuId).map((c) => c.menuId as string);
  const menuRows = menuIds.length > 0
    ? await db.select().from(menus).where(inArray(menus.id, menuIds))
    : [];
  const itemRows = menuIds.length > 0
    ? await db.select().from(menuItems).where(inArray(menuItems.menuId, menuIds))
    : [];
  const itemIds = itemRows.map((i) => i.id);
  const priceRows = itemIds.length > 0
    ? await db.select().from(menuItemPrices).where(inArray(menuItemPrices.menuItemId, itemIds))
    : [];
  const slotRows = await db.select().from(mealSlots).where(isNull(mealSlots.deletedAt));

  const priceCount = new Map<string, number>();
  for (const p of priceRows) priceCount.set(p.menuItemId, (priceCount.get(p.menuItemId) ?? 0) + 1);
  const itemsByMenu = new Map<string, { capacity: number; prices: number }[]>();
  for (const i of itemRows) {
    const list = itemsByMenu.get(i.menuId) ?? [];
    list.push({ capacity: i.capacity, prices: priceCount.get(i.id) ?? 0 });
    itemsByMenu.set(i.menuId, list);
  }

  const checklistByMenu = new Map<string, ReturnType<typeof buildPublishChecklist>>();
  for (const m of menuRows) {
    const slot = slotRows.find((s) => s.id === m.mealSlotId);
    checklistByMenu.set(
      m.id,
      buildPublishChecklist(
        {
          status: m.status as MenuStatus,
          reservationOpensAt: m.reservationOpensAt,
          reservationClosesAt: m.reservationClosesAt,
          date: m.date,
          mealStart: slot ? mealInstant(m.date,slot.startTime) : m.date,
        },
        itemsByMenu.get(m.id) ?? [],
      ),
    );
  }

  return {
    canManage: ctx.user.role === ROLES.NUTRITION_MANAGER || ctx.user.role === ROLES.SUPER_ADMIN,
    days: data.days,
    slots: data.slots.map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
    })),
    cells: data.cells.map((c) => ({
      ...c,
      reservationOpensAt: c.reservationOpensAt,
      reservationClosesAt: c.reservationClosesAt,
      checklist: c.menuId ? (checklistByMenu.get(c.menuId) ?? []) : [],
    })),
  };
}

export async function getWeekMenuForUser() {
  const ctx = await requireRole(
    ROLES.STUDENT, ROLES.STAFF, ROLES.VICE_STUDENT,
    ROLES.NUTRITION_MANAGER, ROLES.CAFETERIA_OPERATOR, ROLES.SUPER_ADMIN,
  );

  // گروه مشتری کاربر
  let group: CustomerGroup = 'STUDENT';
  if (ctx.user.role === 'STAFF' || ctx.user.role === 'CAFETERIA_OPERATOR') group = 'EMPLOYEE';
  if (ctx.user.role !== 'STUDENT') {
    const { studentProfiles, staffProfiles } = await import('@/db/schema');
    const sp = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, ctx.user.id)).limit(1);
    if (sp[0]) group = sp[0].customerGroup as CustomerGroup;
    else {
      const st = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, ctx.user.id)).limit(1);
      if (st[0]) {
        group = st[0].kind === 'FACULTY' ? 'FACULTY'
          : st[0].kind === 'CONTRACTOR' ? 'CONTRACTOR'
          : 'EMPLOYEE';
      }
    }
  }

  const ref = new Date();
  const dayOfWeek = (ref.getDay() + 1) % 7;
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - dayOfWeek);

  const data = await getWeekMenuForGroup(group, weekStart);
  return {
    group,
    groupLabel: GROUP_LABELS[group],
    days: data.days,
    slots: data.slots.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime.toISOString() })),
    cells: data.cells,
  };
}

export async function getNutritionDashboard() {
  await requireMenuManage();
  const stats = await getNutritionStats(new Date());
  return {
    ...stats,
    statusLabels: STATUS_LABELS,
    groupLabels: GROUP_LABELS,
    categoryLabels: CATEGORY_LABELS,
  };
}

export async function getFoodsForCombobox() {
  await requireMenuManage();
  const rows = await db.select().from(foods)
    .where(and(isNull(foods.deletedAt), eq(foods.isActive, true)))
    .orderBy(asc(foods.name));
  return rows.map((f) => ({ id: f.id, name: f.name, category: f.category }));
}
