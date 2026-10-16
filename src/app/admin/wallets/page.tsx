import React from 'react';
import { requireRole } from '@/server/dal/auth';
import { ROLES } from '@/lib/permissions';
import { getSystemWalletBalances, getRecentLedgerEntries } from '@/server/services/payment';
import { PageHeader } from '@/components/layout/app-shell';
import { WalletsOverviewClient } from '@/components/admin/wallets-overview-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function WalletsOverviewPage() {
  await requireRole(ROLES.SUPER_ADMIN, ROLES.NUTRITION_MANAGER);
  const [balances, ledger] = await Promise.all([getSystemWalletBalances(), getRecentLedgerEntries(50)]);

  return (
    <div>
      <PageHeader
        title="نمای کیف پول‌ها و دفتر کل"
        description={`مجموع موجودی کاربران: ${toPersianDigits(balances.totalUserBalances.toLocaleString('en-US'))} ریال`}
      />
      <WalletsOverviewClient
        system={balances.system}
        totalUserBalances={balances.totalUserBalances}
        ledger={ledger}
      />
    </div>
  );
}
