import mongoose from 'mongoose';
import {
  ServerModel,
  type ServerPlanDuration,
  type ServerVmType,
} from '../../models/server.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { encrypt } from '../../utils/crypto';
import { ValidationError } from '../../utils/errors';
import type {
  ProviderMetadataImportResult,
  ProviderMetadataImportRowResult,
} from './vmInventory.types';

/**
 * One row as parsed from the import template.
 *
 * A key that is absent means "the sheet had no such column, leave the stored
 * value alone". A key present but null means "the cell was blank, clear it".
 */
export interface ImportRowInput {
  ipAddress: string;
  vmType?: string | null;
  vmSpec?: string | null;
  planDuration?: string | null;
  provider?: string | null;
  username?: string | null;
  password?: string | null;
  providerStartDate?: Date | null;
  providerEndDate?: Date | null;
}

const VALID_VM_TYPES: ServerVmType[] = ['rdp', 'ssh', 'vnc'];
const VALID_PLAN_DURATIONS: ServerPlanDuration[] = ['hourly', 'monthly', 'quarterly', 'yearly'];

/**
 * Usernames that only ever appear on Linux boxes. Provider exports frequently
 * omit the protocol column, so it is inferred from the login rather than
 * failing the row. `admin` is deliberately absent — it is used on both.
 */
const SSH_ONLY_USERNAMES = new Set([
  'root',
  'ubuntu',
  'ec2-user',
  'centos',
  'debian',
  'fedora',
  'azureuser',
  'opc',
  'alpine',
  'rocky',
  'almalinux',
]);

function inferVmType(username: string): ServerVmType {
  return SSH_ONLY_USERNAMES.has(username.trim().toLowerCase()) ? 'ssh' : 'rdp';
}

/**
 * Strict IPv4 canonicalization. The previous importer accepted any string of
 * length >= 3, which let hostnames and typos into the inventory and broke the
 * IP-based merge. Anything not a clean IPv4 is rejected with a row-level error.
 */
function canonicalIpv4(raw: string): string | null {
  const parts = raw.trim().split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets.join('.');
}

function sameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

/** A row that passed in-memory validation and is ready to be turned into writes. */
interface PreparedRow {
  index: number;
  ipAddress: string;
  vmType: ServerVmType | null;
  username: string;
  password: string;
  patch: Record<string, unknown>;
  note?: string;
}

class VmInventoryImportService {
  /**
   * Validate and optionally apply a parsed import sheet.
   *
   * `dryRun` runs the same validation and diffing as a commit but issues no
   * writes, so the preview the operator approves matches what gets applied.
   *
   * All database access is batched: two reads up front and two bulk writes at
   * the end, regardless of row count. An earlier per-row implementation issued
   * two round trips per row, which took ~35s for a 218-row sheet and tripped
   * the request timeout after having already written part of the batch.
   */
  async importRows(
    rows: ImportRowInput[],
    options: { dryRun: boolean; createdBy: mongoose.Types.ObjectId }
  ): Promise<ProviderMetadataImportResult> {
    if (rows.length === 0) throw new ValidationError('No rows to import.');
    if (rows.length > 2000) {
      throw new ValidationError('Import is capped at 2000 rows per batch.');
    }

    const results: ProviderMetadataImportRowResult[] = [];
    const failed = (index: number, ipAddress: string, error: string): void => {
      results.push({ index, ipAddress, action: 'failed', error });
    };

    // ── Phase 1: validate every row in memory, no I/O ────────────────────
    const prepared: PreparedRow[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;

      const rawIp = row.ipAddress?.trim() ?? '';
      if (!rawIp) {
        failed(i, '', 'IP address is required.');
        continue;
      }

      const ipAddress = canonicalIpv4(rawIp);
      if (!ipAddress) {
        failed(i, rawIp, `"${rawIp}" is not a valid IPv4 address.`);
        continue;
      }

      const vmTypeRaw = row.vmType?.trim().toLowerCase() ?? '';
      if (vmTypeRaw && !VALID_VM_TYPES.includes(vmTypeRaw as ServerVmType)) {
        failed(i, ipAddress, `VM type must be one of rdp, ssh, vnc (got "${vmTypeRaw}").`);
        continue;
      }

      const planRaw = row.planDuration?.trim().toLowerCase() ?? '';
      if (planRaw && !VALID_PLAN_DURATIONS.includes(planRaw as ServerPlanDuration)) {
        failed(
          i,
          ipAddress,
          `Plan duration must be one of hourly, monthly, quarterly, yearly (got "${planRaw}").`
        );
        continue;
      }

      if (
        row.providerStartDate &&
        row.providerEndDate &&
        row.providerStartDate > row.providerEndDate
      ) {
        failed(i, ipAddress, 'Provider start date is after provider end date.');
        continue;
      }

      const username = row.username?.trim() ?? '';
      const password = row.password ?? '';
      if (username && !password) {
        failed(i, ipAddress, `Username "${username}" has no password.`);
        continue;
      }

      const dupeKey = `${ipAddress}::${username.toLowerCase()}`;
      if (seen.has(dupeKey)) {
        failed(
          i,
          ipAddress,
          `Duplicate row for ${ipAddress}${username ? ` / ${username}` : ''}.`
        );
        continue;
      }
      seen.add(dupeKey);

      // Only columns the sheet actually supplied become candidate updates.
      const patch: Record<string, unknown> = {};
      if (vmTypeRaw) patch['vmType'] = vmTypeRaw;
      if (planRaw) patch['planDuration'] = planRaw;
      if (row.vmSpec !== undefined) patch['vmSpec'] = row.vmSpec?.trim() || null;
      if (row.provider !== undefined) patch['provider'] = row.provider?.trim() || null;
      if (row.providerStartDate !== undefined) {
        patch['providerStartDate'] = row.providerStartDate ?? null;
      }
      if (row.providerEndDate !== undefined) {
        patch['providerEndDate'] = row.providerEndDate ?? null;
      }

      prepared.push({
        index: i,
        ipAddress,
        vmType: (vmTypeRaw as ServerVmType) || null,
        username,
        password,
        patch,
      });
    }

    // ── Phase 2: two bulk reads for the whole batch ──────────────────────
    const ips = [...new Set(prepared.map((p) => p.ipAddress))];

    const existingServers = ips.length
      ? await ServerModel.find({ ipAddress: { $in: ips } })
          .select('_id ipAddress vmType vmSpec planDuration provider providerStartDate providerEndDate')
          .lean()
      : [];

    const serverByIp = new Map(existingServers.map((s) => [s.ipAddress, s]));

    const existingCredentials = existingServers.length
      ? await ServerCredentialModel.find({
          serverId: { $in: existingServers.map((s) => s._id) },
        })
          .select('serverId username')
          .lean()
      : [];

    const credentialKeys = new Set(
      existingCredentials.map((c) => `${c.serverId.toString()}::${c.username.toLowerCase()}`)
    );
    const credentialCounts = new Map<string, number>();
    for (const c of existingCredentials) {
      const key = c.serverId.toString();
      credentialCounts.set(key, (credentialCounts.get(key) ?? 0) + 1);
    }

    // ── Phase 3: diff each row into bulk operations ──────────────────────
    const serverInserts: Record<string, unknown>[] = [];
    const serverUpdates: Array<{ _id: mongoose.Types.ObjectId; patch: Record<string, unknown> }> =
      [];
    const credentialInserts: Record<string, unknown>[] = [];

    /** IDs for servers created earlier in this same batch. */
    const newServerIdByIp = new Map<string, mongoose.Types.ObjectId>();

    for (const row of prepared) {
      const existing = serverByIp.get(row.ipAddress);
      const pendingId = newServerIdByIp.get(row.ipAddress);

      // ── New server ────────────────────────────────────────────────────
      if (!existing && !pendingId) {
        if (!row.username) {
          failed(
            row.index,
            row.ipAddress,
            'New server needs a username and password; provide both or remove the row.'
          );
          continue;
        }

        const vmType = row.vmType ?? inferVmType(row.username);
        const serverId = new mongoose.Types.ObjectId();
        newServerIdByIp.set(row.ipAddress, serverId);

        serverInserts.push({
          _id: serverId,
          ipAddress: row.ipAddress,
          vmType,
          vmSpec: (row.patch['vmSpec'] as string | null) ?? null,
          planDuration: (row.patch['planDuration'] as string | null) ?? null,
          provider: (row.patch['provider'] as string | null) ?? null,
          providerStartDate: (row.patch['providerStartDate'] as Date | null) ?? null,
          providerEndDate: (row.patch['providerEndDate'] as Date | null) ?? null,
          inventoryLocked: false,
          createdBy: options.createdBy,
        });

        credentialInserts.push({
          serverId,
          username: row.username,
          password: encrypt(row.password),
          isPrimary: true,
          status: 'active',
        });
        credentialKeys.add(`${serverId.toString()}::${row.username.toLowerCase()}`);
        credentialCounts.set(serverId.toString(), 1);

        results.push({
          index: row.index,
          ipAddress: row.ipAddress,
          action: 'created',
          ...(row.vmType
            ? {}
            : { note: `VM type inferred as ${vmType} from username "${row.username}".` }),
        });
        continue;
      }

      // ── Existing server, or one created by an earlier row in this batch ─
      const serverId = existing?._id ?? pendingId!;
      const serverKey = serverId.toString();

      // Diff against stored values so an unchanged sheet reports "skipped"
      // rather than claiming every row was updated.
      const changed: Record<string, unknown> = {};
      if (existing) {
        for (const [field, next] of Object.entries(row.patch)) {
          const current = (existing as Record<string, unknown>)[field] ?? null;
          const isDate = next instanceof Date || current instanceof Date;
          const differs = isDate
            ? !sameDate(current as Date | null, next as Date | null)
            : (current ?? null) !== (next ?? null);
          if (differs) changed[field] = next;
        }
      }

      let credentialIsNew = false;
      if (row.username) {
        const credKey = `${serverKey}::${row.username.toLowerCase()}`;
        if (!credentialKeys.has(credKey)) {
          credentialIsNew = true;
          credentialKeys.add(credKey);
          const count = credentialCounts.get(serverKey) ?? 0;
          credentialCounts.set(serverKey, count + 1);
          credentialInserts.push({
            serverId,
            username: row.username,
            password: encrypt(row.password),
            isPrimary: count === 0,
            status: 'active',
          });
        }
      }

      if (Object.keys(changed).length === 0 && !credentialIsNew) {
        results.push({ index: row.index, ipAddress: row.ipAddress, action: 'skipped' });
        continue;
      }

      if (Object.keys(changed).length > 0) {
        serverUpdates.push({ _id: serverId, patch: changed });
      }

      results.push({
        index: row.index,
        ipAddress: row.ipAddress,
        action: credentialIsNew ? 'credential_added' : 'updated',
      });
    }

    // ── Phase 4: apply ───────────────────────────────────────────────────
    if (!options.dryRun) {
      if (serverInserts.length > 0 || serverUpdates.length > 0) {
        await ServerModel.bulkWrite(
          [
            ...serverInserts.map((doc) => ({ insertOne: { document: doc } })),
            ...serverUpdates.map((u) => ({
              updateOne: { filter: { _id: u._id }, update: { $set: u.patch } },
            })),
          ],
          { ordered: false }
        );
      }
      if (credentialInserts.length > 0) {
        await ServerCredentialModel.bulkWrite(
          credentialInserts.map((doc) => ({ insertOne: { document: doc } })),
          { ordered: false }
        );
      }
    }

    results.sort((a, b) => a.index - b.index);

    const summary = {
      total: rows.length,
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
      credentialsAdded: results.filter((r) => r.action === 'credential_added').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      failed: results.filter((r) => r.action === 'failed').length,
    };

    return { results, summary };
  }
}

export const vmInventoryImportService = new VmInventoryImportService();
