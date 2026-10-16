import { requireRole } from '@/server/dal/auth';
import { getWalletBalance } from '@/server/services/wallet';
import { getMyReservations } from '@/server/services/reservation';
import { getCustomerWeekMenu } from '@/server/dal/customer';
import { nowJalali } from '@/lib/jalali';
import { DashboardStudent } from '@/components/student/dashboard-student';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const { user } = await requireRole('STUDENT');
  const [balance, reservations, menu] = await Promise.all([
    getWalletBalance(user.id),
    getMyReservations(user.id),
    getCustomerWeekMenu(),
  ]);
  const active = reservations.filter((r) => r.status === 'CONFIRMED');
  return (
    <DashboardStudent
      firstName={user.displayName.split(' ')[0]}
      greeting={nowJalali()}
      balanceRials={balance}
      activeCount={active.length}
      activeReservations={active}
      upcomingMenus={menu.cells
        .filter((c) => c.menuId && new Date(c.date).getTime() >= new Date().setHours(0, 0, 0, 0))
        .map((c) => ({
          dateIso: c.date,
          menuId: c.menuId!,
          mealSlotName: c.mealSlotName,
          items: c.items.map((i) => ({
            id: i.id,
            foodName: i.foodName,
            foodThumb: i.thumbPath,
            priceRials: i.prices[0]?.priceRials ?? 0,
          })),
        }))}
      walletHref="/student/wallet"
      menuHref="/student/menu"
      reservationsHref="/student/reservations"
    />
  );
}
