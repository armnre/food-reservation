import React from 'react';
import { getReservationReport } from '@/server/dal/customer';
import { PageHeader } from '@/components/layout/app-shell';
import { ReportsClient } from '@/components/reports/reports-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const data = await getReservationReport(4);

  return (
    <div>
      <PageHeader
        title="گزارش‌های فروش و رزرو"
        description={`آمار ${toPersianDigits(4)} هفتهٔ گذشته — رزروها، درآمد و غذاهای پرطرفدار`}
      />
      <ReportsClient data={data} />
    </div>
  );
}
