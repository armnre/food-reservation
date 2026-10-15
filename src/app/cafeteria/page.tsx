import React from 'react';
import { getCafeteriaPage } from '@/server/dal/customer';
import { PageHeader } from '@/components/layout/app-shell';
import { CafeteriaScanClient } from '@/components/cafeteria/scan-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function CafeteriaPage() {
  const data = await getCafeteriaPage();

  return (
    <div>
      <PageHeader
        title="ایستگاه سلف — اسکن بلیط"
        description={`امروز ${toPersianDigits(data.counts.total)} رزرو — ${toPersianDigits(data.counts.used)} تحویل‌شده`}
      />
      <CafeteriaScanClient
        initialItems={data.items}
        counts={data.counts}
      />
    </div>
  );
}
