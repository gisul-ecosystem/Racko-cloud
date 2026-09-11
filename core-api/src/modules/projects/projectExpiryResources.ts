import mongoose from 'mongoose';
import { ADMIN_SERVICE_LABELS, type AdminServiceKey } from '../../constants/adminServiceCatalog';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { CredentialAssignmentModel } from '../../models/credentialAssignment.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { ServerCredentialModel } from '../../models/serverCredential.model';
import { ServerModel } from '../../models/server.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { VM } from '../vm/vm.model';
import type { IProject } from '../../models/project.model';
import { decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';

/** Client-facing: service names + login credentials only (no IPs or infra). */
export interface ProjectExpiryClientAccessRow {
  serviceLabel: string;
  username: string;
  password: string;
}

export interface ProjectExpiryClientServiceGroup {
  serviceLabel: string;
  loginCount: number;
}

export interface ProjectExpiryClientSummary {
  serviceGroups: ProjectExpiryClientServiceGroup[];
  accessRows: ProjectExpiryClientAccessRow[];
}

function buildClientServiceGroups(
  enabled: AdminServiceKey[],
  accessRows: ProjectExpiryClientAccessRow[]
): ProjectExpiryClientServiceGroup[] {
  const countByLabel = new Map<string, number>();
  for (const row of accessRows) {
    countByLabel.set(row.serviceLabel, (countByLabel.get(row.serviceLabel) ?? 0) + 1);
  }

  const groups: ProjectExpiryClientServiceGroup[] = [];
  const seen = new Set<string>();

  for (const key of enabled) {
    const label = serviceLabel(key);
    seen.add(label);
    groups.push({ serviceLabel: label, loginCount: countByLabel.get(label) ?? 0 });
  }

  for (const [label, loginCount] of countByLabel) {
    if (!seen.has(label)) {
      groups.push({ serviceLabel: label, loginCount });
    }
  }

  return groups;
}

/** Support agent: full resource inventory with connection details. */
export interface ProjectExpiryAgentResourceRow {
  serviceLabel: string;
  name: string;
  ipAddress?: string;
  hostname?: string;
  username?: string;
  password?: string;
  protocol?: string;
  port?: number;
  status?: string;
}

export interface ProjectExpiryAgentSummary {
  services: { key: string; label: string; count: number }[];
  resources: ProjectExpiryAgentResourceRow[];
}

function serviceLabel(key: string): string {
  return ADMIN_SERVICE_LABELS[key as AdminServiceKey] ?? key;
}

function tryDecryptPassword(encrypted?: string | null): string | undefined {
  if (!encrypted?.trim()) return undefined;
  try {
    return decrypt(encrypted);
  } catch (err) {
    logger.warn('[ProjectExpiry] Failed to decrypt credential for email', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function pushClientAccess(
  rows: ProjectExpiryClientAccessRow[],
  serviceLabelValue: string,
  username?: string | null,
  password?: string | null
): void {
  const user = username?.trim();
  const pass = password?.trim();
  if (!user || !pass) return;
  rows.push({ serviceLabel: serviceLabelValue, username: user, password: pass });
}

function pushAgentResource(
  rows: ProjectExpiryAgentResourceRow[],
  row: ProjectExpiryAgentResourceRow
): void {
  rows.push(row);
}

export async function summarizeProjectExpiryForClient(
  project: IProject
): Promise<ProjectExpiryClientSummary> {
  const projectId = project._id;
  const enabled = project.enabledServices ?? [];
  const accessRows: ProjectExpiryClientAccessRow[] = [];

  if (enabled.includes('create-vm')) {
    const label = serviceLabel('create-vm');
    const rows = await CatalogVmModel.find({ projectId })
      .select('username password status')
      .lean();
    for (const row of rows) {
      if (row.status !== 'active' && row.status !== 'ready_to_attach') continue;
      const password = tryDecryptPassword(row.password);
      pushClientAccess(accessRows, label, row.username, password);
    }
  }

  if (enabled.includes('dedicated-server')) {
    const label = serviceLabel('dedicated-server');
    const rows = await DedicatedServerRequestModel.find({ projectId, status: 'active' })
      .select('username password')
      .lean();
    for (const row of rows) {
      const password = tryDecryptPassword(row.password);
      pushClientAccess(accessRows, label, row.username, password);
    }
  }

  if (enabled.includes('vm-management')) {
    const label = serviceLabel('vm-management');
    const rows = await VM.find({ projectId })
      .select('consoleUsername consolePassword consoleReady status')
      .lean();
    for (const row of rows) {
      if (!row.consoleReady) continue;
      const password = tryDecryptPassword(row.consolePassword);
      pushClientAccess(accessRows, label, row.consoleUsername, password);
    }
  }

  if (enabled.includes('elastic-servers')) {
    const label = serviceLabel('elastic-servers');
    const rows = await ExternalVMModel.find({ projectId }).select('username password').lean();
    for (const row of rows) {
      const password = tryDecryptPassword(row.password);
      pushClientAccess(accessRows, label, row.username, password);
    }
  }

  const inventoryAssignments = await CredentialAssignmentModel.find({
    projectId,
    status: 'active',
  })
    .select('credentialId')
    .lean();

  if (inventoryAssignments.length > 0) {
    const label = 'VM Inventory';
    const credentialIds = inventoryAssignments.map((row) => row.credentialId);
    const credentials = await ServerCredentialModel.find({
      _id: { $in: credentialIds },
      status: 'active',
    })
      .select('username password')
      .lean();

    for (const cred of credentials) {
      const password = tryDecryptPassword(cred.password);
      pushClientAccess(accessRows, label, cred.username, password);
    }
  }

  return {
    serviceGroups: buildClientServiceGroups(enabled, accessRows),
    accessRows,
  };
}

export async function summarizeProjectExpiryForAgent(
  project: IProject
): Promise<ProjectExpiryAgentSummary> {
  const projectId = project._id;
  const enabled = project.enabledServices ?? [];
  const resources: ProjectExpiryAgentResourceRow[] = [];
  const countByService: Record<string, number> = {};

  if (enabled.includes('create-vm')) {
    const label = serviceLabel('create-vm');
    const rows = await CatalogVmModel.find({ projectId })
      .select('planName hostname ipAddress username password status protocol')
      .lean();
    countByService['create-vm'] = rows.length;
    for (const row of rows) {
      const password = tryDecryptPassword(row.password);
      pushAgentResource(resources, {
        serviceLabel: label,
        name: row.planName || row.hostname || 'Catalog VM',
        ipAddress: row.ipAddress || undefined,
        hostname: row.hostname || undefined,
        username: row.username || undefined,
        password,
        protocol: row.protocol ? String(row.protocol).toUpperCase() : undefined,
        status: row.status || undefined,
      });
    }
  }

  if (enabled.includes('dedicated-server')) {
    const label = serviceLabel('dedicated-server');
    const rows = await DedicatedServerRequestModel.find({ projectId })
      .select('hostname ipAddress username password protocol planName status')
      .lean();
    countByService['dedicated-server'] = rows.length;
    for (const row of rows) {
      const password = tryDecryptPassword(row.password);
      pushAgentResource(resources, {
        serviceLabel: label,
        name: row.hostname || row.planName || 'Dedicated server',
        ipAddress: row.ipAddress || undefined,
        hostname: row.hostname || undefined,
        username: row.username || undefined,
        password,
        protocol: row.protocol ? String(row.protocol).toUpperCase() : undefined,
        status: row.status || undefined,
      });
    }
  }

  if (enabled.includes('vm-management')) {
    const label = serviceLabel('vm-management');
    const rows = await VM.find({ projectId })
      .select('name ipAddress consoleUsername consolePassword consoleProtocol consoleReady status')
      .lean();
    countByService['vm-management'] = rows.length;
    for (const row of rows) {
      const password = row.consoleReady ? tryDecryptPassword(row.consolePassword) : undefined;
      pushAgentResource(resources, {
        serviceLabel: label,
        name: row.name,
        ipAddress: row.ipAddress || undefined,
        username: row.consoleUsername || undefined,
        password,
        protocol: row.consoleProtocol ? String(row.consoleProtocol).toUpperCase() : undefined,
        status: row.status || undefined,
      });
    }
  }

  if (enabled.includes('elastic-servers')) {
    const label = serviceLabel('elastic-servers');
    const rows = await ExternalVMModel.find({ projectId })
      .select('name ipAddress username password protocol port')
      .lean();
    countByService['elastic-servers'] = rows.length;
    for (const row of rows) {
      const password = tryDecryptPassword(row.password);
      pushAgentResource(resources, {
        serviceLabel: label,
        name: row.name,
        ipAddress: row.ipAddress,
        username: row.username,
        password,
        protocol: String(row.protocol).toUpperCase(),
        port: row.port,
      });
    }
  }

  const inventoryAssignments = await CredentialAssignmentModel.find({
    projectId,
    status: 'active',
  })
    .select('credentialId serverId')
    .lean();

  if (inventoryAssignments.length > 0) {
    const label = 'VM Inventory';
    const credentialIds = inventoryAssignments.map((row) => row.credentialId);
    const serverIds = [
      ...new Set(inventoryAssignments.map((row) => row.serverId.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));

    const [credentials, servers] = await Promise.all([
      ServerCredentialModel.find({ _id: { $in: credentialIds }, status: 'active' })
        .select('_id username password label')
        .lean(),
      ServerModel.find({ _id: { $in: serverIds } }).select('_id ipAddress vmType').lean(),
    ]);

    const credById = new Map(credentials.map((c) => [c._id.toString(), c]));
    const serverById = new Map(servers.map((s) => [s._id.toString(), s]));
    countByService['vm-inventory'] = serverIds.length;

    for (const assignment of inventoryAssignments) {
      const cred = credById.get(assignment.credentialId.toString());
      const server = serverById.get(assignment.serverId.toString());
      if (!cred || !server) continue;
      const password = tryDecryptPassword(cred.password);
      pushAgentResource(resources, {
        serviceLabel: label,
        name: cred.label?.trim() || server.ipAddress,
        ipAddress: server.ipAddress,
        username: cred.username,
        password,
        protocol: String(server.vmType).toUpperCase(),
      });
    }
  }

  const serviceRows: { key: string; label: string; count: number }[] = enabled.map((key) => ({
    key,
    label: serviceLabel(key),
    count: countByService[key] ?? 0,
  }));

  if ((countByService['vm-inventory'] ?? 0) > 0) {
    serviceRows.push({
      key: 'vm-inventory',
      label: 'VM Inventory',
      count: countByService['vm-inventory'] ?? 0,
    });
  }

  return { services: serviceRows, resources };
}

/** @deprecated Use summarizeProjectExpiryForAgent */
export async function summarizeProjectExpiryResources(
  project: IProject
): Promise<ProjectExpiryAgentSummary> {
  return summarizeProjectExpiryForAgent(project);
}
