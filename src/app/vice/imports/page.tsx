import React from 'react';
import { listImportBatches } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { ImportsClient } from '@/components/students/imports-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function ImportsHistoryPage() {
  const data = await listImportBatches();

  return (
    <div>
      <PageHeader
        title="تاریخچه ایمپورت‌ها"
        description={`${toPersianDigits(data.items.length)} عملیات بارگذاری ثبت شده است`}
      />
      <ImportsClient items={data.items} />
    </div>
  );
}
