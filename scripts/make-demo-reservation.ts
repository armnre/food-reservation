/**
 * ساخت یک رزرو نمایشی برای دانشجوی نمونه — فقط برای دمو.
 * از سرویس واقعی برنامه استفاده می‌کند تا تمام ناورداها (کیف پول، دفتر کل، بلیط) رعایت شوند.
 *   npx tsx scripts/make-demo-reservation.ts
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db/index';
import { users, menus, menuItems, mealSlots } from '../src/db/schema';
import { eq, and, gte, isNull } from 'drizzle-orm';
import { createReservation } from '../src/server/services/reservation';

async function main() {
  const [student] = await db.select().from(users).where(eq(users.username, '40123000')).limit(1);
  if (!student) {
    console.log('دانشجوی 40123000 یافت نشد؛ ابتدا seed را اجرا کنید');
    process.exit(1);
  }

  // اولین وعدهٔ آینده که رزروش باز است
  const now = new Date();
  const rows = await db
    .select({ itemId: menuItems.id, date: menus.date, slot: mealSlots.name, closesAt: menus.reservationClosesAt })
    .from(menuItems)
    .innerJoin(menus, eq(menus.id, menuItems.menuId))
    .innerJoin(mealSlots, eq(mealSlots.id, menus.mealSlotId))
    .where(gte(menus.date, new Date(now.getFullYear(), now.getMonth(), now.getDate())))
    .orderBy(menus.date)
    .limit(20);

  const target = rows.find((r) => !r.closesAt || new Date(r.closesAt).getTime() > now.getTime());
  if (!target) {
    console.log('منوی باز برای رزرو یافت نشد؛ ابتدا make-demo-menu را اجرا کنید');
    process.exit(1);
  }

  const res = await createReservation({
    userId: student.id,
    menuItemId: target.itemId,
    idempotencyKey: randomUUID(),
    actor: { id: student.id, role: student.role, ip: null, userAgent: 'demo-seed' },
  });

  if (res.ok) {
    console.log(`✔ رزرو نمایشی ساخته شد (${target.slot} — ${new Date(target.date).toLocaleDateString('fa-IR')})`);
  } else {
    console.log('✗ رزرو نمایشی ناموفق:', res.error);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
