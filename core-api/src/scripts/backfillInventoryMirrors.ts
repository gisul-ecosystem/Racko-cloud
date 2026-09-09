/**
 * Publish existing super-admin inventory grants to the end-user portals.
 *
 * Assignments made before the mirror existed live only in
 * `credential_assignments`, which no tenant- or user-facing endpoint reads, so
 * those users log in and see nothing. This walks every active grant and runs the
 * same idempotent sync the assign flow now performs, in batches.
 *
 * Run: npx ts-node src/scripts/backfillInventoryMirrors.ts
 *   or: npm run backfill:inventory-mirrors
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { CredentialAssignmentModel } from '../models/credentialAssignment.model';
import { inventoryExternalVmMirrorService } from '../modules/vmInventory/inventoryExternalVmMirror.service';

const BATCH_SIZE = 50;

async function backfillInventoryMirrors(): Promise<void> {
  console.log('Publishing inventory grants to the portals...');
  await connectDatabase();

  const assignments = await CredentialAssignmentModel.find({ status: 'active' })
    .select('_id')
    .lean();
  console.log(`Active grants found: ${assignments.length}`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
    const batch = assignments.slice(i, i + BATCH_SIZE).map((a) => a._id);
    try {
      await inventoryExternalVmMirrorService.syncAssignments(batch);
      done += batch.length;
    } catch (error: unknown) {
      // One bad grant must not stop the rest — the batch is retried per row.
      for (const id of batch) {
        try {
          await inventoryExternalVmMirrorService.syncAssignments([id]);
          done += 1;
        } catch (rowError: unknown) {
          failed += 1;
          console.error(
            `  failed ${id.toString()}: ${rowError instanceof Error ? rowError.message : String(rowError)}`
          );
        }
      }
    }
    console.log(`  ${Math.min(i + BATCH_SIZE, assignments.length)}/${assignments.length}`);
  }

  console.log(`Published: ${done}`);
  if (failed > 0) console.warn(`WARNING: ${failed} grant(s) could not be published.`);

  await disconnectDatabase();
  console.log('Done.');
}

backfillInventoryMirrors().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Backfill failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
