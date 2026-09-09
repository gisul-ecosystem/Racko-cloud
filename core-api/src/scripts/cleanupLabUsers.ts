/**
 * Delete lab users orphaned by an earlier unassign.
 *
 * Unassign used to remove a user only when the grant was flagged as having
 * created them, which no grant made before that flag existed ever was. Those
 * runs released the login but left the numbered user behind, so re-running the
 * same email series fails with "already exists". Unassign now always removes an
 * idle user; this cleans up what the old behavior stranded, applying the same
 * guards: nothing that holds a grant, a VM or an elastic server is touched, and
 * neither are admins or console operators.
 *
 * Reports without deleting unless --apply is passed.
 *
 * Run: npx ts-node src/scripts/cleanupLabUsers.ts --series traininguser@gmail.com
 *      npx ts-node src/scripts/cleanupLabUsers.ts --series traininguser@gmail.com --apply
 *      npx ts-node src/scripts/cleanupLabUsers.ts --emails a@x.com,b@x.com --apply
 *   or: npm run cleanup:lab-users -- --series traininguser@gmail.com
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { CredentialAssignmentModel } from '../models/credentialAssignment.model';
import { ExternalVmTenantAssignmentModel } from '../models/externalVmTenantAssignment.model';
import { ExternalVmUserAssignmentModel } from '../models/externalVmUserAssignment.model';
import { TenantUser } from '../models/tenantUser.model';
import { User } from '../models/user.model';
import { VM } from '../modules/vm/vm.model';

interface Args {
  series?: string;
  emails?: string[];
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: argv.includes('--apply') };
  const read = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const series = read('--series');
  if (series) args.series = series.trim().toLowerCase();

  const emails = read('--emails');
  if (emails) {
    args.emails = emails
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return args;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * "traininguser@gmail.com" → /^traininguser\d+@gmail\.com$/, matching the series
 * the assign flow generates. The base address itself is deliberately excluded:
 * numbering starts at 1, so an unnumbered account was created by someone else.
 */
function seriesPattern(base: string): RegExp {
  const at = base.lastIndexOf('@');
  if (at <= 0) throw new Error(`--series must be an email address, got "${base}"`);
  const local = escapeRegex(base.slice(0, at));
  const domain = escapeRegex(base.slice(at));
  return new RegExp(`^${local}\\d+${domain}$`);
}

/** Why a user cannot be removed, or null when they are safe to delete. */
async function blockedReason(
  id: mongoose.Types.ObjectId,
  kind: 'platform' | 'tenant'
): Promise<string | null> {
  const grants = await CredentialAssignmentModel.countDocuments({
    assigneeId: id,
    status: 'active',
  });
  if (grants > 0) return `holds ${grants} inventory grant(s)`;

  if (kind === 'tenant') {
    const [vms, elastic] = await Promise.all([
      VM.countDocuments({ assignedTenantUserId: id }),
      ExternalVmTenantAssignmentModel.countDocuments({ tenantUserId: id }),
    ]);
    if (vms > 0) return `holds ${vms} VM(s)`;
    if (elastic > 0) return `holds ${elastic} elastic server(s)`;
    return null;
  }

  const [vms, elastic] = await Promise.all([
    VM.countDocuments({ assignedTo: id }),
    ExternalVmUserAssignmentModel.countDocuments({ userId: id }),
  ]);
  if (vms > 0) return `holds ${vms} VM(s)`;
  if (elastic > 0) return `holds ${elastic} elastic server(s)`;
  return null;
}

async function cleanupLabUsers(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.series && !args.emails?.length) {
    throw new Error('Pass --series <base email> or --emails <a@x.com,b@x.com>.');
  }

  const match = args.series
    ? { email: seriesPattern(args.series) }
    : { email: { $in: args.emails } };

  console.log(
    args.series
      ? `Looking for the ${args.series} series...`
      : `Looking for ${args.emails!.length} address(es)...`
  );
  if (!args.apply) console.log('DRY RUN — nothing will be deleted. Re-run with --apply.');
  console.log(
    'Any idle account matching the pattern is included, so read the list before applying.'
  );

  await connectDatabase();

  // Both identity systems can hold a lab user, and a series may have been run
  // against either, so both are checked.
  const platformUsers = await User.find({ ...match, role: 'user' })
    .select('_id email')
    .lean();
  const tenantUsers = await TenantUser.find({ ...match, role: 'tenant_user' })
    .select('_id email tenantId isConsoleOperator')
    .lean();

  console.log(
    `Found ${platformUsers.length} platform user(s) and ${tenantUsers.length} tenant user(s).`
  );

  let deleted = 0;
  let kept = 0;

  for (const user of platformUsers) {
    const reason = await blockedReason(user._id, 'platform');
    if (reason) {
      kept += 1;
      console.log(`  keep   ${user.email} — ${reason}`);
      continue;
    }
    if (args.apply) await User.deleteOne({ _id: user._id });
    deleted += 1;
    console.log(`  ${args.apply ? 'delete' : 'would'} ${user.email}`);
  }

  for (const user of tenantUsers) {
    if (user.isConsoleOperator) {
      kept += 1;
      console.log(`  keep   ${user.email} — console operator`);
      continue;
    }
    const reason = await blockedReason(user._id, 'tenant');
    if (reason) {
      kept += 1;
      console.log(`  keep   ${user.email} — ${reason}`);
      continue;
    }
    if (args.apply) await TenantUser.deleteOne({ _id: user._id });
    deleted += 1;
    console.log(`  ${args.apply ? 'delete' : 'would'} ${user.email}`);
  }

  console.log(
    args.apply ? `Deleted ${deleted}, kept ${kept}.` : `Would delete ${deleted}, keep ${kept}.`
  );

  await disconnectDatabase();
  console.log('Done.');
}

cleanupLabUsers().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Cleanup failed:', message);
  mongoose.disconnect().finally(() => process.exit(1));
});
