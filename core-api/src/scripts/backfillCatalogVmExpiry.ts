/**
 * Give manually fulfilled catalog VMs the provider term they never recorded.
 *
 * `expiresAt` used to be written only for auto-provisioned cloud VMs, so every
 * Webyne (and manual Azure) VM has no end date and nothing could warn before
 * its paid term lapsed. The term is reconstructed from what we do know: the
 * billing period it was bought on, counted from the day it was attached.
 *
 * Hourly plans are skipped — they bill continuously until the VM is terminated,
 * so they have no term to lapse and inventing one would only misfire an alert.
 *
 * Dry-run by default — it prints what it would write and changes nothing.
 *
 * Run: npx ts-node src/scripts/backfillCatalogVmExpiry.ts
 *      npx ts-node src/scripts/backfillCatalogVmExpiry.ts --commit
 *   or: npm run backfill:catalog-vm-expiry
 *       npm run backfill:catalog-vm-expiry -- --commit
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { CatalogVmModel } from '../models/catalogVm.model';
import {
  computeExpiresFrom,
  hasFixedProviderTerm,
  resolveDurationDays,
} from '../modules/vmCatalog/catalogVmSerializer';

const commit = process.argv.includes('--commit');

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function backfillCatalogVmExpiry(): Promise<void> {
  console.log(
    commit
      ? 'Backfilling provider terms for manual catalog VMs (COMMIT)...'
      : 'Backfilling provider terms for manual catalog VMs (dry run — pass --commit to write)...'
  );
  await connectDatabase();

  // Only VMs that are live and manually fulfilled: auto-provisioned ones
  // already get a deadline at purchase, and dead rows need no warning.
  const docs = await CatalogVmModel.find({
    autoProvisioned: false,
    status: 'active',
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }],
  })
    .select('_id planName provider billing attachedAt createdAt ipAddress')
    .lean();

  console.log(`Active manual VMs without a term: ${docs.length}`);
  if (docs.length === 0) {
    await disconnectDatabase();
    console.log('Nothing to do.');
    return;
  }

  const now = Date.now();
  const updates: Array<{ id: mongoose.Types.ObjectId; expiresAt: Date }> = [];
  let alreadyLapsed = 0;
  let skippedHourly = 0;

  for (const doc of docs) {
    // Hourly plans bill continuously until terminated, so there is no term to
    // reconstruct. Giving them one would only produce a false expiry alert.
    if (!hasFixedProviderTerm(doc.billing)) {
      skippedHourly += 1;
      continue;
    }

    const start = doc.attachedAt ?? doc.createdAt;
    const days = resolveDurationDays(doc.billing);
    const expiresAt = computeExpiresFrom(start, days);
    if (expiresAt.getTime() <= now) alreadyLapsed += 1;

    updates.push({ id: doc._id, expiresAt });
    console.log(
      `  ${doc.planName} (${doc.provider}, ${doc.billing}, ${days}d)` +
        `${doc.ipAddress ? ` ${doc.ipAddress}` : ''}` +
        ` — starts ${isoDay(start)} → ends ${isoDay(expiresAt)}` +
        `${expiresAt.getTime() <= now ? '  [ALREADY PAST]' : ''}`
    );
  }

  if (skippedHourly > 0) {
    console.log(
      `\nSkipped ${skippedHourly} hourly VM(s) — they bill continuously and have no term to expire.`
    );
  }

  if (updates.length === 0) {
    console.log('\nNo fixed-term VMs need a date.');
    await disconnectDatabase();
    return;
  }

  if (alreadyLapsed > 0) {
    console.warn(
      `\nWARNING: ${alreadyLapsed} VM(s) work out to a term that already ended. ` +
        'They will alert on the next scheduler tick — extend the date on any you have quietly renewed.'
    );
  }

  if (!commit) {
    console.log(`\nDry run: ${updates.length} VM(s) would be updated. Re-run with --commit.`);
    await disconnectDatabase();
    return;
  }

  const result = await CatalogVmModel.bulkWrite(
    updates.map((u) => ({
      updateOne: {
        filter: { _id: u.id },
        update: { $set: { expiresAt: u.expiresAt, updatedAt: new Date() } },
      },
    }))
  );

  console.log(`\nUpdated: ${result.modifiedCount}`);

  await disconnectDatabase();
  console.log('Done.');
}

backfillCatalogVmExpiry().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Backfill failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
