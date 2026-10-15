import React from 'react';
import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { listWithdrawalRequests } from '@/server/services/payment';
import { PageHeader } from '@/components/layout/app-shell';
import { WithdrawalsClient } from '@/components/admin/withdrawals-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function WithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(ROLES.SUPER_ADMIN, ROLES.NUTRITION_MANAGER);
  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? sp.status : 'ALL';
  const items = await listWithdrawalRequests({ status });

  return (
    <div>
      <PageHeader
        title="درخواست‌های برداشت"
        description={`${toPersianDigits(items.length)} درخواست — تأیید یا رد`}
      />
      <WithdrawalsClient items={items} initialStatus={status} />
    </div>
  );
}
