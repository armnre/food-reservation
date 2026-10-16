import React from 'react';
import { getWeekPlannerForManage, getFoodsForCombobox } from '@/server/dal/menu';
import { PageHeader } from '@/components/layout/app-shell';
import { MenuPlannerClient } from '@/components/menu/menu-planner-client';

export const dynamic = 'force-dynamic';

export default async function MenuPlannerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const offset = Number.parseInt(typeof sp.w === 'string' ? sp.w : '0', 10) || 0;

  const ref = new Date();
  const dayOfWeek = (ref.getDay() + 1) % 7;
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - dayOfWeek + offset * 7);
  weekStart.setHours(0, 0, 0, 0);

  const [data, foods] = await Promise.all([getWeekPlannerForManage(weekStart), getFoodsForCombobox()]);

  return (
    <div>
      <PageHeader
        title="برنامه‌ریز منوی هفتگی"
        description="روی هر خانه کلیک کنید تا منوی آن وعده را بچینید، قیمت‌گذاری کنید و منتشر کنید"
      />
      <MenuPlannerClient
        days={data.days}
        slots={data.slots}
        cells={data.cells}
        foods={foods}
        canManage={data.canManage}
        weekOffset={offset}
      />
    </div>
  );
}
