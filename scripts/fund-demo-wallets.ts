/**
 * شارژ نمایشی همهٔ کیف‌ها از طریق دفتر دوطرفه — فقط دمو.
 *   npx tsx scripts/fund-demo-wallets.ts
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: 'secrets.env', quiet: true });
import { db, pool } from '../src/db/index';
import { users } from '../src/db/schema';
import {
  getOrCreateWalletInTx,
  getSystemWalletInTx,
  recordTransactionInTx,
} from '../src/server/services/wallet';

async function main() {
  const all = await db.select().from(users);
  for (const u of all) {
    await db.transaction(async (tx) => {
      const w = await getOrCreateWalletInTx(tx, u.id);
      const adjustment = await getSystemWalletInTx(tx, 'ADJUSTMENT');
      await recordTransactionInTx(tx, {
        idempotencyKey: `demo-fund:${u.id}`,
        description: 'اعتبار اولیه نمایشی',
        legs: [
          {
            walletId: w.id,
            amountRials: 2_000_000,
            entryType: 'DEPOSIT',
            description: 'اعتبار اولیه نمایشی',
          },
          {
            walletId: adjustment.id,
            amountRials: -2_000_000,
            entryType: 'ADJUSTMENT',
            description: 'اعتبار نمایشی دانشگاه',
          },
        ],
      });
    });
  }
  console.log(`✔ ${all.length} کیف با ۲۰۰٬۰۰۰ تومان شارژ شد (متوازن)`);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
