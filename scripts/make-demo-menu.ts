/**
 * ساخت منوی نمایشی برای هفته جاری — فقط برای دمو.
 *   npx tsx scripts/make-demo-menu.ts
 */
import 'dotenv/config';
import { db } from '../src/db/index';
import { menus, menuItems, menuItemPrices, mealSlots, foods } from '../src/db/schema';
import { eq, isNull } from 'drizzle-orm';

async function main() {
  const slots = await db.select().from(mealSlots).where(isNull(mealSlots.deletedAt));
  const foodRows = await db.select().from(foods).where(isNull(foods.deletedAt));
  if (slots.length === 0 || foodRows.length === 0) {
    console.log('ابتدا npm run db:seed را اجرا کنید');
    return;
  }

  for (let d = 0; d < 7; d++) {
    const day = new Date();
    const dow = (day.getDay() + 1) % 7;
    day.setDate(day.getDate() - dow + d);
    day.setHours(0, 0, 0, 0);
    if (day.getTime() < new Date().setHours(0, 0, 0, 0)) continue;

    for (const slot of slots) {
      const existing = await db.select().from(menus).where(eq(menus.date, day));
      let menuId = existing.find((m) => m.mealSlotId === slot.id)?.id;
      if (!menuId) {
        const [m] = await db.insert(menus).values({
          date: day,
          mealSlotId: slot.id,
          status: 'PUBLISHED',
          reservationOpensAt: new Date(day.getTime() - 2 * 86400000),
          reservationClosesAt: new Date(day.getTime() + (slot.name === 'ناهار' ? 10 : 15) * 3600000),
        }).returning();
        menuId = m.id;
      } else {
        continue;
      }

      const picks = foodRows.slice(0, 3);
      for (let i = 0; i < picks.length; i++) {
        const [item] = await db.insert(menuItems).values({
          menuId,
          foodId: picks[i].id,
          capacity: 40,
          reservedCount: 0,
        }).returning();
        await db.insert(menuItemPrices).values([
          { menuItemId: item.id, customerGroup: 'STUDENT', priceRials: 120000 + i * 40000 },
          { menuItemId: item.id, customerGroup: 'EMPLOYEE', priceRials: 250000 + i * 40000 },
          { menuItemId: item.id, customerGroup: 'FACULTY', priceRials: 200000 + i * 40000 },
        ]);
      }
    }
  }
  console.log('✔ منوی نمایشی هفته جاری ساخته شد');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
