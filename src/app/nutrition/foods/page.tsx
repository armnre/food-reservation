import React from 'react';
import { getFoodsForManage } from '@/server/dal/menu';
import { PageHeader } from '@/components/layout/app-shell';
import { FoodsClient } from '@/components/menu/foods-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function FoodsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const category = typeof sp.category === 'string' ? sp.category : 'ALL';

  const data = await getFoodsForManage(q, category, true);

  return (
    <div>
      <PageHeader
        title="کتابخانه غذا"
        description={`${toPersianDigits(data.items.length)} غذا ثبت شده — حذف فیزیکی ممنوع است`}
      />
      <FoodsClient items={data.items} initialQuery={{ q, category }} />
    </div>
  );
}
