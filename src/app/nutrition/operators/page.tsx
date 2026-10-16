import React from 'react';
import { listStaff } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { StaffClient } from '@/components/students/staff-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function OperatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const page = Number.parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1;

  const data = await listStaff({ q, kind: 'CAFETERIA', page, pageSize: 20 });

  return (
    <div>
      <PageHeader title="کارکنان سلف" description={`مدیریت ${toPersianDigits(data.total)} حساب کارمند سلف`} />
      <StaffClient
        items={data.items}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        initialQuery={{ q, kind: 'CAFETERIA' }}
        canCreate
      />
    </div>
  );
}
