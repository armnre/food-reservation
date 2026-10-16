import React from 'react';
import { CreateManager } from '@/components/admin/create-account';
import { listAllUsers } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { UsersClient } from '@/components/admin/users-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function AllUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const role = typeof sp.role === 'string' ? sp.role : 'ALL';
  const page = Number.parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1;

  const data = await listAllUsers({ q, role, page, pageSize: 20 });

  return (
    <div>
      <PageHeader
        title="همه کاربران"
        actions={<CreateManager />}
        description={`مدیریت ${toPersianDigits(data.total)} حساب در سامانه`}
      />
      <UsersClient
        items={data.items}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        initialQuery={{ q, role }}
      />
    </div>
  );
}
