import React from 'react';
import { getCustomerWalletPage } from '@/server/dal/customer';
import { PageHeader } from '@/components/layout/app-shell';
import { WalletStudent } from '@/components/customer/wallet-student';

export const dynamic = 'force-dynamic';

export default async function StaffWalletPage() {
  const data = await getCustomerWalletPage();

  return (
    <div>
      <PageHeader title="کیف پول من" description="موجودی، شارژ، درخواست برداشت و تاریخچهٔ تراکنش‌ها" />
      <WalletStudent
        balanceRials={data.balanceRials}
        ledger={data.ledger}
        payments={data.payments}
        menuHref="/staff/menu"
      />
    </div>
  );
}
