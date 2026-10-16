import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { db } from '@/db';
import { foods, mealSlots, menus, menuItems, menuItemPrices } from '@/db/schema';
import { and, asc, eq, gte, inArray, isNull, lte, sql, count } from 'drizzle-orm';
import { env } from '@/lib/env';
import { mealInstant, startOfMenuDay } from '@/lib/jalali';
import { tehranDayKey } from '@/lib/tehran-time';
import { audit, type AuditActor } from '@/lib/audit';
import { BizError } from './wallet';

/* ───────────── ثابت‌ها ───────────── */

export const FOOD_CATEGORIES = ['MAIN', 'SIDE', 'SALAD', 'DESSERT', 'DRINK', 'OTHER'] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  MAIN: 'غذای اصلی',
  SIDE: 'میان‌وعده',
  SALAD: 'سالاد',
  DESSERT: 'دسر',
  DRINK: 'نوشیدنی',
  OTHER: 'سایر',
};

export const CUSTOMER_GROUPS = ['STUDENT', 'EMPLOYEE', 'FACULTY', 'CONTRACTOR'] as const;
export type CustomerGroup = (typeof CUSTOMER_GROUPS)[number];

export const GROUP_LABELS: Record<CustomerGroup, string> = {
  STUDENT: 'دانشجو',
  EMPLOYEE: 'کارمند',
  FACULTY: 'هیئت‌علمی',
  CONTRACTOR: 'پیمانکار',
};

export const MENU_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];

export const STATUS_LABELS: Record<MenuStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  CLOSED: 'بسته‌شده',
};

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/* ───────────── کتابخانه غذا ───────────── */

export interface FoodInput {
  name: string;
  description?: string | null;
  category: FoodCategory;
  calories?: number | null;
  tags?: string[];
}

export async function createFood(
  input: FoodInput,
  actor: AuditActor,
  image?: { buffer: Buffer; mime: string },
) {
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: 'نام غذا الزامی است' };

  let imagePath: string | null = null;
  let thumbPath: string | null = null;
  if (image) {
    const saved = await saveFoodImage(image.buffer, image.mime);
    if (!saved.ok) return saved;
    imagePath = saved.imagePath;
    thumbPath = saved.thumbPath;
  }

  const [row] = await db
    .insert(foods)
    .values({
      name,
      description: input.description ?? null,
      category: input.category,
      calories: input.calories ?? null,
      tags: input.tags ?? [],
      imagePath,
      thumbPath,
      isActive: true,
    })
    .returning();

  await audit({
    actor,
    action: 'food:created',
    entityType: 'food',
    entityId: row.id,
    after: { name, category: input.category },
  });
  return { ok: true as const, id: row.id };
}

export async function updateFood(
  id: string,
  input: Partial<FoodInput>,
  actor: AuditActor,
  image?: { buffer: Buffer; mime: string },
) {
  const before = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
  if (!before[0]) return { ok: false as const, error: 'غذا یافت نشد' };

  let imagePath = before[0].imagePath;
  let thumbPath = before[0].thumbPath;
  if (image) {
    const saved = await saveFoodImage(image.buffer, image.mime);
    if (!saved.ok) return saved;
    imagePath = saved.imagePath;
    thumbPath = saved.thumbPath;
  }

  await db
    .update(foods)
    .set({
      name: input.name?.trim() ?? before[0].name,
      description: input.description ?? before[0].description,
      category: input.category ?? before[0].category,
      calories: input.calories ?? before[0].calories,
      tags: input.tags ?? before[0].tags,
      imagePath,
      thumbPath,
      updatedAt: new Date(),
    })
    .where(eq(foods.id, id));

  await audit({
    actor,
    action: 'food:updated',
    entityType: 'food',
    entityId: id,
    before: before[0],
    after: input as never,
  });
  return { ok: true as const };
}

/** غیرفعال‌سازی — حذف فیزیکی ممنوع؛ غذای غیرفعال در منوهای گذشته سالم می‌ماند */
export async function toggleFood(id: string, active: boolean, actor: AuditActor) {
  const before = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
  if (!before[0]) return { ok: false as const, error: 'غذا یافت نشد' };

  await db.update(foods).set({ isActive: active, updatedAt: new Date() }).where(eq(foods.id, id));
  await audit({
    actor,
    action: active ? 'food:activated' : 'food:deactivated',
    entityType: 'food',
    entityId: id,
    before: { isActive: before[0].isActive },
    after: { isActive: active },
  });
  return { ok: true as const };
}

/* ───────────── تصویر غذا (ج‑۱) ───────────── */

async function saveFoodImage(
  buffer: Buffer,
  mime: string,
): Promise<{ ok: true; imagePath: string; thumbPath: string } | { ok: false; error: string }> {
  // اعتبارسنجی با magic bytes — نه فقط MIME اعلام‌شده
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer.length > 12 && buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    return { ok: false, error: 'فقط تصویر jpg، png یا webp پذیرفته می‌شود' };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'حجم تصویر نباید بیشتر از ۲ مگابایت باشد' };
  }

  const dir = path.join(env.uploadDir, 'foods');
  await fs.mkdir(dir, { recursive: true });

  const key = `${Date.now()}-${randomBytes(6).toString('hex')}`;
  const imagePath = path.join('foods', `${key}.webp`);
  const thumbPath = path.join('foods', `${key}-thumb.webp`);

  await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(env.uploadDir, imagePath));
  await sharp(buffer)
    .resize(200, 200, { fit: 'cover' })
    .webp({ quality: 78 })
    .toFile(path.join(env.uploadDir, thumbPath));

  void mime;
  return { ok: true, imagePath, thumbPath };
}

/* ───────────── وعده‌ها ───────────── */

export async function upsertMealSlot(
  input: {
    id?: string;
    name: string;
    startTime: string;
    endTime: string;
    isActive?: boolean;
  },
  actor: AuditActor,
) {
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: 'نام وعده الزامی است' };

  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (!(start.getTime() < end.getTime())) {
    return { ok: false as const, error: 'ساعت شروع باید قبل از ساعت پایان باشد' };
  }

  if (input.id) {
    const before = await db.select().from(mealSlots).where(eq(mealSlots.id, input.id)).limit(1);
    await db
      .update(mealSlots)
      .set({
        name,
        startTime: start,
        endTime: end,
        isActive: input.isActive ?? before[0]?.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(eq(mealSlots.id, input.id));
    await audit({
      actor,
      action: 'meal_slot:updated',
      entityType: 'meal_slot',
      entityId: input.id,
      before: before[0] ?? null,
      after: { name },
    });
    return { ok: true as const, id: input.id };
  }

  const [row] = await db
    .insert(mealSlots)
    .values({
      name,
      startTime: start,
      endTime: end,
      isActive: input.isActive ?? true,
    })
    .returning();
  await audit({
    actor,
    action: 'meal_slot:created',
    entityType: 'meal_slot',
    entityId: row.id,
    after: { name },
  });
  return { ok: true as const, id: row.id };
}

/* ───────────── برنامه‌ریز منو (ج‑۳) ───────────── */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function getOrCreateMenu(date: Date, mealSlotId: string) {
  // فاز ۱-۴: ستون date نوع `date` است — کلید روز تهران ذخیره می‌شود
  const day = tehranDayKey(startOfDay(date));
  const existing = await db
    .select()
    .from(menus)
    .where(and(eq(menus.date, day), eq(menus.mealSlotId, mealSlotId), isNull(menus.deletedAt)))
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(menus)
    .values({
      date: day,
      mealSlotId,
      status: 'DRAFT',
    })
    .returning();
  return row;
}

export interface MenuItemPriceInput {
  customerGroup: CustomerGroup;
  priceRials: number;
}

export async function upsertMenuItem(
  input: {
    menuId: string;
    foodId: string;
    capacity: number;
    prices: MenuItemPriceInput[];
    itemId?: string;
  },
  actor: AuditActor,
) {
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    return { ok: false as const, error: 'ظرفیت باید عدد صحیح بزرگ‌تر از صفر باشد' };
  }
  if (input.prices.length === 0) {
    return { ok: false as const, error: 'حداقل برای یک گروه قیمت تعیین کنید' };
  }
  for (const p of input.prices) {
    if (!Number.isInteger(p.priceRials) || p.priceRials < 0) {
      return { ok: false as const, error: 'قیمت باید عدد صحیح غیرمنفی (ریال) باشد' };
    }
  }

  const menuRows = await db.select().from(menus).where(eq(menus.id, input.menuId)).limit(1);
  const menu = menuRows[0];
  if (!menu) return { ok: false as const, error: 'منو یافت نشد' };
  if (menu.status === 'CLOSED') return { ok: false as const, error: 'منوی بسته‌شده قابل ویرایش نیست' };

  if (input.itemId) {
    // ویرایش اتمیک زیر قفل ردیف — حذف و درج قیمت‌ها و چک ظرفیت در یک تراکنش
    let before: typeof menuItems.$inferSelect | undefined;
    try {
      await db.transaction(async (tx) => {
        const locked = await tx
          .select()
          .from(menuItems)
          .where(eq(menuItems.id, input.itemId as string))
          .for('update');
        const item = locked[0];
        if (!item) throw new BizError('آیتم یافت نشد');

        // ج-۴: بعد از انتشار نمی‌توان ظرفیت را کمتر از reserved_count کرد — زیر قفل
        if (menu.status === 'PUBLISHED' && input.capacity < item.reservedCount) {
          throw new BizError(`ظرفیت نمی‌تواند کمتر از تعداد رزروشده (${item.reservedCount}) باشد`);
        }

        await tx
          .update(menuItems)
          .set({
            capacity: input.capacity,
            updatedAt: new Date(),
          })
          .where(eq(menuItems.id, input.itemId as string));

        await tx.delete(menuItemPrices).where(eq(menuItemPrices.menuItemId, input.itemId as string));
        await tx.insert(menuItemPrices).values(
          input.prices.map((p) => ({
            menuItemId: input.itemId as string,
            customerGroup: p.customerGroup,
            priceRials: p.priceRials,
          })),
        );

        before = item;
      });
    } catch (e) {
      if (e instanceof BizError) return { ok: false as const, error: e.message };
      throw e;
    }

    await audit({
      actor,
      action: 'menu_item:updated',
      entityType: 'menu_item',
      entityId: input.itemId,
      before,
      after: { capacity: input.capacity, prices: input.prices },
    });
    return { ok: true as const, id: input.itemId };
  }

  const dup = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.menuId, input.menuId), eq(menuItems.foodId, input.foodId)))
    .limit(1);
  if (dup[0]) return { ok: false as const, error: 'این غذا قبلاً به این وعده اضافه شده است' };

  const [item] = await db
    .insert(menuItems)
    .values({
      menuId: input.menuId,
      foodId: input.foodId,
      capacity: input.capacity,
      reservedCount: 0,
    })
    .returning();

  await db.insert(menuItemPrices).values(
    input.prices.map((p) => ({
      menuItemId: item.id,
      customerGroup: p.customerGroup,
      priceRials: p.priceRials,
    })),
  );

  await audit({
    actor,
    action: 'menu_item:created',
    entityType: 'menu_item',
    entityId: item.id,
    after: { menuId: input.menuId, foodId: input.foodId, capacity: input.capacity, prices: input.prices },
  });
  return { ok: true as const, id: item.id };
}

export async function removeMenuItem(itemId: string, actor: AuditActor) {
  const rows = await db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
  const item = rows[0];
  if (!item) return { ok: false as const, error: 'آیتم یافت نشد' };

  const menuRows = await db.select().from(menus).where(eq(menus.id, item.menuId)).limit(1);
  const menu = menuRows[0];

  // ج‑۴: غذای رزروشده را نمی‌توان برداشت
  if (item.reservedCount > 0) {
    return { ok: false as const, error: `این غذا ${item.reservedCount} رزرو دارد و قابل حذف نیست` };
  }
  if (menu && menu.status === 'PUBLISHED') {
    return {
      ok: false as const,
      error: 'منوی منتشرشده قابل حذف آیتم نیست؛ ابتدا آن را به پیش‌نویس برگردانید',
    };
  }

  await db.delete(menuItemPrices).where(eq(menuItemPrices.menuItemId, itemId));
  await db.delete(menuItems).where(eq(menuItems.id, itemId));
  await audit({
    actor,
    action: 'menu_item:removed',
    entityType: 'menu_item',
    entityId: itemId,
    before: item,
  });
  return { ok: true as const };
}

/* ───────────── چک‌لیست انتشار (ج‑۴) ───────────── */

export interface PublishChecklistItem {
  key: string;
  label: string;
  ok: boolean;
}

export function buildPublishChecklist(
  menu: {
    status: MenuStatus;
    reservationOpensAt: Date | null;
    reservationClosesAt: Date | null;
    date: Date;
    mealStart: Date;
  },
  items: { capacity: number; prices: number }[],
): PublishChecklistItem[] {
  const hasFood = items.length > 0;
  const allCapacity = items.every((i) => i.capacity > 0);
  const allPriced = items.every((i) => i.prices > 0);

  const opens = menu.reservationOpensAt;
  const closes = menu.reservationClosesAt;
  const windowOk =
    opens !== null &&
    closes !== null &&
    opens.getTime() < closes.getTime() &&
    closes.getTime() < menu.mealStart.getTime();

  return [
    { key: 'food', label: 'حداقل یک غذا در وعده ثبت شده باشد', ok: hasFood },
    { key: 'capacity', label: 'ظرفیت همه غذاها بزرگ‌تر از صفر باشد', ok: allCapacity },
    { key: 'price', label: 'برای هر غذا حداقل یک قیمت ثبت شده باشد', ok: allPriced },
    {
      key: 'window',
      label: 'بازه رزرو معتبر باشد (باز شدن < بسته شدن < شروع وعده)',
      ok: windowOk,
    },
  ];
}

export async function publishMenu(menuId: string, actor: AuditActor) {
  const rows = await db.select().from(menus).where(eq(menus.id, menuId)).limit(1);
  const menu = rows[0];
  if (!menu) return { ok: false as const, error: 'منو یافت نشد' };

  const slotRows = await db.select().from(mealSlots).where(eq(mealSlots.id, menu.mealSlotId)).limit(1);
  const slot = slotRows[0];
  if (!slot) return { ok: false as const, error: 'وعده یافت نشد' };

  const itemRows = await db.select().from(menuItems).where(eq(menuItems.menuId, menuId));
  const itemIds = itemRows.map((i) => i.id);
  const priceRows =
    itemIds.length > 0
      ? await db.select().from(menuItemPrices).where(inArray(menuItemPrices.menuItemId, itemIds))
      : [];
  const pricesByItem = new Map<string, number>();
  for (const p of priceRows) pricesByItem.set(p.menuItemId, (pricesByItem.get(p.menuItemId) ?? 0) + 1);

  const checklist = buildPublishChecklist(
    {
      status: menu.status as MenuStatus,
      reservationOpensAt: menu.reservationOpensAt,
      reservationClosesAt: menu.reservationClosesAt,
      date: startOfMenuDay(menu.date),
      mealStart: mealInstant(menu.date, slot.startTime),
    },
    itemRows.map((i) => ({ capacity: i.capacity, prices: pricesByItem.get(i.id) ?? 0 })),
  );

  const failed = checklist.filter((c) => !c.ok);
  if (failed.length > 0) {
    return {
      ok: false as const,
      error: `پیش از انتشار باید رفع شود: ${failed.map((f) => f.label).join('؛ ')}`,
      checklist,
    };
  }

  await db.update(menus).set({ status: 'PUBLISHED', updatedAt: new Date() }).where(eq(menus.id, menuId));
  await audit({
    actor,
    action: 'menu:published',
    entityType: 'menu',
    entityId: menuId,
    before: { status: menu.status },
    after: { status: 'PUBLISHED', items: itemRows.length },
  });
  return { ok: true as const, checklist };
}

export async function closeMenu(menuId: string, actor: AuditActor) {
  const rows = await db.select().from(menus).where(eq(menus.id, menuId)).limit(1);
  const menu = rows[0];
  if (!menu) return { ok: false as const, error: 'منو یافت نشد' };

  await db.update(menus).set({ status: 'CLOSED', updatedAt: new Date() }).where(eq(menus.id, menuId));
  await audit({
    actor,
    action: 'menu:closed',
    entityType: 'menu',
    entityId: menuId,
    before: { status: menu.status },
    after: { status: 'CLOSED' },
  });
  return { ok: true as const };
}

/** بازگرداندن به پیش‌نویس فقط وقتی هیچ رزروی نیست */
export async function revertMenuToDraft(menuId: string, actor: AuditActor) {
  const rows = await db.select().from(menus).where(eq(menus.id, menuId)).limit(1);
  const menu = rows[0];
  if (!menu) return { ok: false as const, error: 'منو یافت نشد' };

  const itemRows = await db.select().from(menuItems).where(eq(menuItems.menuId, menuId));
  const totalReserved = itemRows.reduce((a, b) => a + b.reservedCount, 0);
  if (totalReserved > 0) {
    return { ok: false as const, error: 'به دلیل وجود رزرو، امکان بازگشت به پیش‌نویس نیست' };
  }

  await db.update(menus).set({ status: 'DRAFT', updatedAt: new Date() }).where(eq(menus.id, menuId));
  await audit({
    actor,
    action: 'menu:reverted',
    entityType: 'menu',
    entityId: menuId,
    before: { status: menu.status },
    after: { status: 'DRAFT' },
  });
  return { ok: true as const };
}

export async function setReservationWindow(
  input: {
    menuId: string;
    opensAt: string;
    closesAt: string;
  },
  actor: AuditActor,
) {
  const rows = await db.select().from(menus).where(eq(menus.id, input.menuId)).limit(1);
  const menu = rows[0];
  if (!menu) return { ok: false as const, error: 'منو یافت نشد' };

  const slotRows = await db.select().from(mealSlots).where(eq(mealSlots.id, menu.mealSlotId)).limit(1);
  const slot = slotRows[0];
  if (!slot) return { ok: false as const, error: 'وعده یافت نشد' };

  const opens = new Date(input.opensAt);
  const closes = new Date(input.closesAt);

  const problem = validateReservationWindow(opens, closes, mealInstant(menu.date, slot.startTime));
  if (problem) return { ok: false as const, error: problem };

  await db
    .update(menus)
    .set({
      reservationOpensAt: opens,
      reservationClosesAt: closes,
      updatedAt: new Date(),
    })
    .where(eq(menus.id, input.menuId));

  await audit({
    actor,
    action: 'menu:window_updated',
    entityType: 'menu',
    entityId: input.menuId,
    before: { opensAt: menu.reservationOpensAt, closesAt: menu.reservationClosesAt },
    after: { opensAt: opens, closesAt: closes },
  });
  return { ok: true as const };
}

export function validateReservationWindow(opens: Date, closes: Date, mealStart: Date): string | null {
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) {
    return 'تاریخ بازه رزرو نامعتبر است';
  }
  if (!(opens.getTime() < closes.getTime())) {
    return 'زمان باز شدن رزرو باید قبل از بسته شدن آن باشد';
  }
  if (!(closes.getTime() < mealStart.getTime())) {
    return 'بسته شدن رزرو باید قبل از شروع وعده غذایی باشد';
  }
  return null;
}

/* ───────────── کپی (ج‑۳) ───────────── */

export async function copyMenu(
  sourceMenuId: string,
  targetDate: Date,
  targetSlotId: string,
  actor: AuditActor,
) {
  const srcItems = await db.select().from(menuItems).where(eq(menuItems.menuId, sourceMenuId));
  if (srcItems.length === 0) return { ok: false as const, error: 'منوی مبدأ خالی است' };

  const target = await getOrCreateMenu(targetDate, targetSlotId);
  if (target.status === 'CLOSED') return { ok: false as const, error: 'منوی مقصد بسته است' };

  let copied = 0;
  for (const item of srcItems) {
    const dup = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.menuId, target.id), eq(menuItems.foodId, item.foodId)))
      .limit(1);
    if (dup[0]) continue;

    const [newItem] = await db
      .insert(menuItems)
      .values({
        menuId: target.id,
        foodId: item.foodId,
        capacity: item.capacity,
        reservedCount: 0,
      })
      .returning();

    const priceRows = await db.select().from(menuItemPrices).where(eq(menuItemPrices.menuItemId, item.id));
    if (priceRows.length > 0) {
      await db.insert(menuItemPrices).values(
        priceRows.map((p) => ({
          menuItemId: newItem.id,
          customerGroup: p.customerGroup,
          priceRials: p.priceRials,
        })),
      );
    }
    copied++;
  }

  await audit({
    actor,
    action: 'menu:copied',
    entityType: 'menu',
    entityId: target.id,
    after: { from: sourceMenuId, copied },
  });
  return { ok: true as const, copied, targetMenuId: target.id };
}

/** کپی کل هفته قبل به هفته جاری */
export async function copyPreviousWeek(referenceDate: Date, actor: AuditActor) {
  const ref = startOfDay(referenceDate);
  const dayOfWeek = (ref.getDay() + 1) % 7; // شنبه = ۰
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - dayOfWeek);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(weekStart.getDate() - 7);

  let totalCopied = 0;
  const createdMenus: string[] = [];

  for (let d = 0; d < 7; d++) {
    const srcDay = new Date(prevWeekStart);
    srcDay.setDate(prevWeekStart.getDate() + d);
    const dstDay = new Date(weekStart);
    dstDay.setDate(weekStart.getDate() + d);

    const srcMenus = await db
      .select()
      .from(menus)
      .where(and(eq(menus.date, tehranDayKey(startOfDay(srcDay))), isNull(menus.deletedAt)));

    for (const sm of srcMenus) {
      const res = await copyMenu(sm.id, dstDay, sm.mealSlotId, actor);
      if (res.ok) {
        totalCopied += res.copied;
        createdMenus.push(res.targetMenuId);
      }
    }
  }

  await audit({
    actor,
    action: 'menu:copied',
    entityType: 'menu',
    entityId: null,
    after: { kind: 'previous_week', totalCopied, menus: createdMenus.length },
  });
  return { ok: true as const, totalCopied, menus: createdMenus.length };
}

/* ───────────── نماها ───────────── */

export interface MenuCellItem {
  id: string;
  foodId: string;
  foodName: string;
  category: FoodCategory;
  calories: number | null;
  tags: string[];
  thumbPath: string | null;
  imagePath: string | null;
  capacity: number;
  reservedCount: number;
  prices: { customerGroup: CustomerGroup; priceRials: number }[];
}

export interface MenuCell {
  menuId: string | null;
  date: string;
  mealSlotId: string;
  mealSlotName: string;
  status: MenuStatus | null;
  reservationOpensAt: string | null;
  reservationClosesAt: string | null;
  items: MenuCellItem[];
}

export async function getWeekPlanner(weekStartDate: Date) {
  const start = startOfDay(weekStartDate);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  const slots = await db
    .select()
    .from(mealSlots)
    .where(and(isNull(mealSlots.deletedAt), eq(mealSlots.isActive, true)))
    .orderBy(asc(mealSlots.startTime));

  const menuRows = await db
    .select()
    .from(menus)
    .where(
      and(
        isNull(menus.deletedAt),
        gte(menus.date, tehranDayKey(days[0])),
        lte(menus.date, tehranDayKey(days[6])),
      ),
    );

  const menuIds = menuRows.map((m) => m.id);
  const itemRows =
    menuIds.length > 0 ? await db.select().from(menuItems).where(inArray(menuItems.menuId, menuIds)) : [];
  const foodRows = await db.select().from(foods).where(isNull(foods.deletedAt));
  const itemIds = itemRows.map((i) => i.id);
  const priceRows =
    itemIds.length > 0
      ? await db.select().from(menuItemPrices).where(inArray(menuItemPrices.menuItemId, itemIds))
      : [];

  const foodById = new Map(foodRows.map((f) => [f.id, f]));
  const pricesByItem = new Map<string, { customerGroup: CustomerGroup; priceRials: number }[]>();
  for (const p of priceRows) {
    const list = pricesByItem.get(p.menuItemId) ?? [];
    list.push({ customerGroup: p.customerGroup as CustomerGroup, priceRials: p.priceRials });
    pricesByItem.set(p.menuItemId, list);
  }
  const itemsByMenu = new Map<string, MenuCellItem[]>();
  for (const i of itemRows) {
    const f = foodById.get(i.foodId);
    const list = itemsByMenu.get(i.menuId) ?? [];
    list.push({
      id: i.id,
      foodId: i.foodId,
      foodName: f?.name ?? '—',
      category: (f?.category ?? 'MAIN') as FoodCategory,
      calories: f?.calories ?? null,
      tags: (f?.tags ?? []) as string[],
      thumbPath: f?.thumbPath ?? null,
      imagePath: f?.imagePath ?? null,
      capacity: i.capacity,
      reservedCount: i.reservedCount,
      prices: pricesByItem.get(i.id) ?? [],
    });
    itemsByMenu.set(i.menuId, list);
  }

  const cells: MenuCell[] = [];
  for (const day of days) {
    for (const slot of slots) {
      const menu = menuRows.find((m) => m.date === tehranDayKey(day) && m.mealSlotId === slot.id);
      cells.push({
        menuId: menu?.id ?? null,
        date: day.toISOString(),
        mealSlotId: slot.id,
        mealSlotName: slot.name,
        status: (menu?.status as MenuStatus) ?? null,
        reservationOpensAt: menu?.reservationOpensAt?.toISOString() ?? null,
        reservationClosesAt: menu?.reservationClosesAt?.toISOString() ?? null,
        items: menu ? (itemsByMenu.get(menu.id) ?? []) : [],
      });
    }
  }

  return { days: days.map((d) => d.toISOString()), slots, cells };
}

/** نمای دانشجو/کارمند — فقط آیتم‌های گروه خودشان */
export async function getWeekMenuForGroup(group: CustomerGroup, weekStartDate: Date) {
  const data = await getWeekPlanner(weekStartDate);

  const visibleCells = data.cells
    .filter((c) => c.status === 'PUBLISHED')
    .map((c) => ({
      ...c,
      items: c.items
        .filter((i) => i.prices.some((p) => p.customerGroup === group))
        .map((i) => ({
          ...i,
          prices: i.prices.filter((p) => p.customerGroup === group),
        })),
    }))
    .filter((c) => c.items.length > 0);

  return { days: data.days, slots: data.slots, cells: visibleCells };
}

/* ───────────── داشبورد مدیر تغذیه ───────────── */

export async function getNutritionStats(referenceDate: Date) {
  const ref = startOfDay(referenceDate);
  const dayOfWeek = (ref.getDay() + 1) % 7;
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(weekStart.getDate() + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

  const [published] = await db
    .select({ value: count() })
    .from(menus)
    .where(
      and(
        eq(menus.status, 'PUBLISHED'),
        gte(menus.date, tehranDayKey(weekStart)),
        lte(menus.date, tehranDayKey(weekEnd)),
        isNull(menus.deletedAt),
      ),
    );

  const [drafts] = await db
    .select({ value: count() })
    .from(menus)
    .where(
      and(
        eq(menus.status, 'DRAFT'),
        gte(menus.date, tehranDayKey(weekStart)),
        lte(menus.date, tehranDayKey(weekEnd)),
        isNull(menus.deletedAt),
      ),
    );

  const [activeFoods] = await db
    .select({ value: count() })
    .from(foods)
    .where(and(eq(foods.isActive, true), isNull(foods.deletedAt)));

  const [nextWeekMenus] = await db
    .select({ value: count() })
    .from(menus)
    .where(
      and(
        eq(menus.status, 'PUBLISHED'),
        gte(menus.date, tehranDayKey(nextWeekStart)),
        lte(menus.date, tehranDayKey(nextWeekEnd)),
        isNull(menus.deletedAt),
      ),
    );

  return {
    publishedThisWeek: Number(published?.value ?? 0),
    draftsThisWeek: Number(drafts?.value ?? 0),
    activeFoods: Number(activeFoods?.value ?? 0),
    nextWeekReady: Number(nextWeekMenus?.value ?? 0) > 0,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}

export async function listFoods(filters: { q?: string; category?: string; includeInactive?: boolean }) {
  const conditions = [isNull(foods.deletedAt)];
  if (!filters.includeInactive) conditions.push(eq(foods.isActive, true));
  if (filters.category && filters.category !== 'ALL') {
    conditions.push(eq(foods.category, filters.category as never));
  }
  if (filters.q && filters.q.trim() !== '') {
    conditions.push(sql`${foods.name} ILIKE ${'%' + filters.q.trim() + '%'}`);
  }
  return db
    .select()
    .from(foods)
    .where(and(...conditions))
    .orderBy(asc(foods.name));
}

export async function listMealSlots() {
  return db.select().from(mealSlots).where(isNull(mealSlots.deletedAt)).orderBy(asc(mealSlots.startTime));
}

export { CUSTOMER_GROUPS as GROUPS };
