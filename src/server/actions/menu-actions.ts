'use server';

import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import {
  createFood,
  updateFood,
  toggleFood,
  upsertMealSlot,
  getOrCreateMenu,
  upsertMenuItem,
  removeMenuItem,
  publishMenu,
  closeMenu,
  revertMenuToDraft,
  setReservationWindow,
  copyMenu,
  copyPreviousWeek,
  type FoodCategory,
  type MenuItemPriceInput,
} from '@/server/services/menu';
import { db } from '@/db';
import { menuItems, menuItemPrices, foods } from '@/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { toJalaliDateTime } from '@/lib/jalali';
import { audit } from '@/lib/audit';

async function actor() {
  const ctx = await requireRole(ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN);
  return {
    actor: {
      id: ctx.user.id,
      role: ctx.user.role,
      ip: null as string | null,
      userAgent: null as string | null,
    },
    ctx,
  };
}

/* ───────────── غذا ───────────── */

export async function createFoodAction(input: {
  name: string;
  description: string | null;
  category: string;
  calories: number | null;
  tags: string[];
  imageBase64?: string | null;
  imageMime?: string | null;
}) {
  try {
    const { actor: a } = await actor();
    const image = input.imageBase64
      ? { buffer: Buffer.from(input.imageBase64, 'base64'), mime: input.imageMime ?? 'image/jpeg' }
      : undefined;
    const res = await createFood(
      {
        name: input.name,
        description: input.description,
        category: input.category as FoodCategory,
        calories: input.calories,
        tags: input.tags,
      },
      a,
      image,
    );
    return res.ok ? { ok: true as const, id: res.id } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateFoodAction(input: {
  id: string;
  name: string;
  description: string | null;
  category: string;
  calories: number | null;
  tags: string[];
  imageBase64?: string | null;
  imageMime?: string | null;
}) {
  try {
    const { actor: a } = await actor();
    const image = input.imageBase64
      ? { buffer: Buffer.from(input.imageBase64, 'base64'), mime: input.imageMime ?? 'image/jpeg' }
      : undefined;
    const res = await updateFood(
      input.id,
      {
        name: input.name,
        description: input.description,
        category: input.category as FoodCategory,
        calories: input.calories,
        tags: input.tags,
      },
      a,
      image,
    );
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function toggleFoodAction(id: string, active: boolean) {
  try {
    const { actor: a } = await actor();
    const res = await toggleFood(id, active, a);
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ───────────── وعده ───────────── */

export async function upsertMealSlotAction(input: {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
}) {
  try {
    const { actor: a } = await actor();
    const res = await upsertMealSlot(input, a);
    return res.ok ? { ok: true as const, id: res.id } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ───────────── منو ───────────── */

export async function openMenuCellAction(dateIso: string, mealSlotId: string) {
  try {
    await actor();
    const menu = await getOrCreateMenu(new Date(dateIso), mealSlotId);
    return { ok: true as const, menuId: menu.id, status: menu.status };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function getMenuItemDetailAction(menuId: string) {
  try {
    await actor();
    const items = await db.select().from(menuItems).where(eq(menuItems.menuId, menuId));
    const ids = items.map((i) => i.id);
    const prices =
      ids.length > 0
        ? await db.select().from(menuItemPrices).where(inArray(menuItemPrices.menuItemId, ids))
        : [];
    const foodRows = await db.select().from(foods).where(isNull(foods.deletedAt));
    const foodById = new Map(foodRows.map((f) => [f.id, f]));

    return {
      ok: true as const,
      items: items.map((i) => {
        const f = foodById.get(i.foodId);
        return {
          id: i.id,
          foodId: i.foodId,
          foodName: f?.name ?? '—',
          category: f?.category ?? 'MAIN',
          capacity: i.capacity,
          reservedCount: i.reservedCount,
          prices: prices
            .filter((p) => p.menuItemId === i.id)
            .map((p) => ({
              customerGroup: p.customerGroup,
              priceRials: p.priceRials,
            })),
        };
      }),
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function upsertMenuItemAction(input: {
  menuId: string;
  foodId: string;
  capacity: number;
  prices: MenuItemPriceInput[];
  itemId?: string;
}) {
  try {
    const { actor: a } = await actor();
    const res = await upsertMenuItem(input, a);
    return res.ok ? { ok: true as const, id: res.id } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function removeMenuItemAction(itemId: string) {
  try {
    const { actor: a } = await actor();
    const res = await removeMenuItem(itemId, a);
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function setReservationWindowAction(input: {
  menuId: string;
  opensAt: string;
  closesAt: string;
}) {
  try {
    const { actor: a } = await actor();
    const res = await setReservationWindow(input, a);
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function publishMenuAction(menuId: string) {
  try {
    const { actor: a } = await actor();
    const res = await publishMenu(menuId, a);
    return res.ok
      ? { ok: true as const, checklist: res.checklist }
      : { ok: false as const, error: res.error, checklist: res.checklist ?? [] };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function closeMenuAction(menuId: string) {
  try {
    const { actor: a } = await actor();
    const res = await closeMenu(menuId, a);
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function revertMenuAction(menuId: string) {
  try {
    const { actor: a } = await actor();
    const res = await revertMenuToDraft(menuId, a);
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function copyMenuAction(input: {
  sourceMenuId: string;
  targetDate: string;
  targetSlotId: string;
}) {
  try {
    const { actor: a } = await actor();
    const res = await copyMenu(input.sourceMenuId, new Date(input.targetDate), input.targetSlotId, a);
    return res.ok
      ? { ok: true as const, copied: res.copied, targetMenuId: res.targetMenuId }
      : { ok: false as const, error: res.error };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function copyPreviousWeekAction() {
  try {
    const { actor: a } = await actor();
    const res = await copyPreviousWeek(new Date(), a);
    return { ok: true as const, totalCopied: res.totalCopied, menus: res.menus };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
