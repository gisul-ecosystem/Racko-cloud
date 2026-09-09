import type { AssigneeType } from '../../models/credentialAssignment.model';

/**
 * Which collection a row (or part of a merged row) came from.
 *
 * `inventory` means the machine was added straight to the inventory (via the
 * Excel upload) and is assigned out from here. The other three are read-only
 * views onto machines that live in their own subsystems. `imported` is
 * reserved for the external-server import, which is not built yet.
 */
export type InventorySource =
  | 'inventory'
  | 'platform_vm'
  | 'catalog_vm'
  | 'dedicated_server';

/** One grant of a login to one person, with client dates resolved from its project. */
export interface InventoryNotificationSettings {
  /** Alerted before a provider contract lapses. Empty means nobody is told. */
  providerExpiryRecipients: string[];
  /** How many days ahead the alert goes out, from server config. */
  warningDays: number;
}

export interface InventoryAssignmentView {
  assignmentId: string;
  assigneeType: AssigneeType;
  assigneeId: string;
  email: string | null;
  username: string | null;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  /** Read live from the project — never copied onto the assignment. */
  clientStartDate: string | null;
  clientEndDate: string | null;
  accessOverride: boolean;
  accessOverrideUntil: string | null;
}

/**
 * A login on the row's IP. `credentialId` is null for the three read-only
 * sources, which expose their single built-in login but cannot be assigned
 * or edited from the inventory.
 */
export interface InventoryCredentialView {
  credentialId: string | null;
  source: InventorySource;
  username: string | null;
  hasPassword: boolean;
  /** False for read-only sources whose password is stored unencrypted. */
  canReveal: boolean;
  assignments: InventoryAssignmentView[];
}

export interface InventoryOwnerView {
  adminId: string | null;
  adminEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
}

/** One row of the inventory: one unique IP, with every login found on it. */
export interface VmInventoryRow {
  ipAddress: string;
  sources: InventorySource[];
  /** Set only when an inventory-owned server exists for this IP. */
  serverId: string | null;
  vmType: string | null;
  vmSpec: string | null;
  /** Vendor billing cadence. Null for the three read-only sources. */
  planDuration: string | null;
  provider: string | null;
  /** Vendor contract window. Null for the three read-only sources. */
  providerStartDate: string | null;
  providerEndDate: string | null;
  inventoryLocked: boolean;
  owner: InventoryOwnerView;
  /** Row-level project, used for client dates when there is no assignment. */
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  clientStartDate: string | null;
  clientEndDate: string | null;
  credentials: InventoryCredentialView[];
}

export interface VmInventoryListResult {
  rows: VmInventoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProviderMetadataImportRow {
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

/**
 * One row of an uploaded assignment file, matched against the inventory.
 *
 * `credentialId` is null when the IP or username is unknown: the file is only
 * ever a way to assign logins that already exist, never to create them.
 */
export interface ResolvedLoginRow {
  index: number;
  ipAddress: string;
  username: string;
  credentialId: string | null;
  serverId: string | null;
  /** Already held by someone else, so this row cannot be granted again. */
  assigned: boolean;
  /**
   * Whether the VM password in the file equals the stored one. Null when the
   * file omitted it or the row did not resolve. False is a warning, not an
   * error — the stored value stays authoritative.
   */
  vmPasswordMatches: boolean | null;
  error: string | null;
}

export interface ResolveLoginsResult {
  rows: ResolvedLoginRow[];
  summary: {
    total: number;
    resolved: number;
    unresolved: number;
    /** Rows whose file password disagrees with the inventory. */
    passwordMismatches: number;
  };
}

/** One login in a bulk assign run, paired with the user generated for it. */
export interface BulkAssignRowResult {
  index: number;
  credentialId: string;
  ipAddress: string | null;
  username: string | null;
  email: string;
  /** Null on failed rows. Present on dry-run rows so the preview shows the real value. */
  password: string | null;
  status: 'assigned' | 'ready' | 'failed';
  error?: string;
}

export interface BulkAssignResult {
  rows: BulkAssignRowResult[];
  summary: {
    total: number;
    assigned: number;
    ready: number;
    failed: number;
  };
  projectName: string;
  dryRun: boolean;
  /**
   * Set when the portal-visible copy of the grant differs from what was asked
   * for — a widened access window, or a mirror that could not be written.
   */
  note?: string;
}

/** What releasing one login actually changed. */
export interface UnassignResult {
  /** True when the lab user created for this login was removed with it. */
  userDeleted: boolean;
  /** True when the VM went back to the free pool. */
  serverFreed: boolean;
  /** Logins still assigned on that VM, which is why it kept its owner. */
  remainingLogins: number;
  owner: 'admin' | 'tenant' | 'free' | null;
}

export interface BulkUnassignResult {
  servers: number;
  loginsUnassigned: number;
  usersDeleted: number;
  serversFreed: number;
}

/** One server a bulk delete refused to touch, and why. */
export interface BulkDeleteSkip {
  serverId: string;
  ipAddress: string | null;
  reason: string;
}

export interface BulkDeleteResult {
  deleted: number;
  skipped: BulkDeleteSkip[];
}

export interface ProviderMetadataImportRowResult {
  index: number;
  ipAddress: string;
  action: 'created' | 'updated' | 'credential_added' | 'skipped' | 'failed';
  error?: string;
  /** Surfaces values the importer decided on its own, e.g. an inferred VM type. */
  note?: string;
}

export interface ProviderMetadataImportResult {
  results: ProviderMetadataImportRowResult[];
  summary: {
    total: number;
    created: number;
    updated: number;
    credentialsAdded: number;
    skipped: number;
    failed: number;
  };
}
