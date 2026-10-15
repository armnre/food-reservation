import React from 'react';
import { listStaff } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { StaffClient } from '@/components/students/staff-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const kind = typeof sp.kind === 'string' ? sp.kind : 'ALL';
  const page = Number.parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1;

  const data = await listStaff({ q, kind, page, pageSize: 20 });

  return (
    <div>
      <PageHeader
        title="کارکنان دانشگاه"
        description={`مدیریت ${toPersianDigits(data.total)} حساب کارمندی، هیئت‌علمی و پیمانکار`}
      />
      <StaffClient
        items={data.items}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        initialQuery={{ q, kind }}
        canCreate={data.ctx.user.role !== 'NUTRITION_MANAGER'}
      />
    </div>
  );
}
