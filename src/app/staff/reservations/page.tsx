import React from 'react';
import { getCustomerReservationsPage } from '@/server/dal/customer';
import { PageHeader } from '@/components/layout/app-shell';
import { MyReservationsStudent } from '@/components/customer/my-reservations-student';

export const dynamic = 'force-dynamic';

export default async function StaffReservationsPage() {
  const data = await getCustomerReservationsPage();

  return (
    <div>
      <PageHeader
        title="بلیطهای من"
        description="رزروهای فعال با QR، تاریخچه و امکان لغو"
      />
      <MyReservationsStudent
        items={data.items}
        walletBalanceRials={data.walletBalanceRials}
        walletHref="/staff/wallet"
      />
    </div>
  );
}