import React from 'react';
import { listAuditLogs } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { AuditLogsClient } from '@/components/admin/audit-logs-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const action = typeof sp.action === 'string' ? sp.action : 'ALL';
  const entityType = typeof sp.entityType === 'string' ? sp.entityType : 'ALL';
  const page = Number.parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1;

  const data = await listAuditLogs({ action, entityType, page, pageSize: 25 });

  return (
    <div>
      <PageHeader
        title="لاگ رویدادهای سامانه"
        description={`${toPersianDigits(data.total)} رویداد ثبت شده — این جدول append-only است`}
      />
      <AuditLogsClient
        items={data.items}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        initialQuery={{ action, entityType }}
      />
    </div>
  );
}
