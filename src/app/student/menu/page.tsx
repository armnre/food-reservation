import React from 'react';
import { getCustomerWeekMenu } from '@/server/dal/customer';
import { PageHeader } from '@/components/layout/app-shell';
import { WeekMenuStudent } from '@/components/menu/week-menu-student';
import { Badge } from '@/components/ui/data';

export const dynamic = 'force-dynamic';

export default async function StudentMenuPage() {
  const data = await getCustomerWeekMenu();

  return (
    <div>
      <PageHeader
        title="منوی هفته"
        description={`قیمت‌ها برای گروه «${data.groupLabel}» — رزرو آسان، بدون صف`}
        actions={<Badge variant="accent">{data.groupLabel}</Badge>}
      />
      <WeekMenuStudent
        days={data.days}
        slots={data.slots}
        cells={data.cells}
        groupLabel={data.groupLabel}
        walletBalanceRials={data.walletBalanceRials}
        myReservedItemIds={data.myReservedItemIds}
        walletHref="/student/wallet"
        topUpHref="/student/wallet"
      />
    </div>
  );
}
