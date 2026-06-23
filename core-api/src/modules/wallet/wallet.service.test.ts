/**
 * Phase 2 wallet verification (requires MongoDB).
 * Run: npx ts-node --transpile-only src/modules/wallet/wallet.service.test.ts
 */
import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from '../../config';
import { walletService } from './wallet.service';

if (config.MONGODB_DNS_SERVERS?.length) {
  dns.setServers(config.MONGODB_DNS_SERVERS);
}

async function main(): Promise<void> {
  const tenantId = new mongoose.Types.ObjectId().toString();

  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB_NAME });

  const initial = await walletService.getOrCreateWallet(tenantId);
  if (initial.balance !== 0) throw new Error('Expected zero initial balance');

  await walletService.creditWallet(tenantId, 100, 'test_credit');
  const afterCredit = await walletService.getBalance(tenantId);
  if (afterCredit !== 100) throw new Error(`Expected balance 100, got ${afterCredit}`);

  await walletService.debitWallet(tenantId, 40, 'test_debit');
  const afterDebit = await walletService.getBalance(tenantId);
  if (afterDebit !== 60) throw new Error(`Expected balance 60, got ${afterDebit}`);

  let insufficient = false;
  try {
    await walletService.debitWallet(tenantId, 1000, 'should_fail');
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
      insufficient = true;
    }
  }
  if (!insufficient) throw new Error('Expected INSUFFICIENT_BALANCE');

  const finalBalance = await walletService.getBalance(tenantId);
  if (finalBalance !== 60) throw new Error(`Balance went negative or changed: ${finalBalance}`);

  const ledger = await walletService.listTransactions(tenantId);
  if (ledger.total !== 2) throw new Error(`Expected 2 ledger entries, got ${ledger.total}`);

  await mongoose.disconnect();
  console.log('PASS: Phase 2 wallet credit/debit/ledger checks');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
