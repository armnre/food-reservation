import React from 'react';
import { getMealSlotsForManage } from '@/server/dal/menu';
import { PageHeader } from '@/components/layout/app-shell';
import { SlotsClient } from '@/components/menu/slots-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function MealSlotsPage() {
  const slots = await getMealSlotsForManage();

  return (
    <div>
      <PageHeader
        title="وعده‌های غذا"
        description={`${toPersianDigits(slots.length)} وعده تعریف شده — منطقه زمانی Asia/Tehran`}
      />
      <SlotsClient slots={slots} />
    </div>
  );
}
