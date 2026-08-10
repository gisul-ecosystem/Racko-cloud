import type { LucideIcon } from 'lucide-react';
import {
  Cloud,
  CreditCard,
  FileText,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  Monitor,
  Package,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Users,
  Wrench,
} from 'lucide-react';

export type RolePermissionDef = {
  key: string;
  label: string;
  group: string;
};

export const SERVICE_DESCRIPTIONS: Record<string, string> = {
  Billing: 'Manage billing, wallet and payments',
  Console: 'Access the services console and dashboards',
  'VPS Hosting': 'Manage VPS and related operations',
  'VM Catalog': 'Manage VM catalog and requests',
  'Dedicated Server': 'Manage dedicated server requests',
  'Dedicated Servers': 'Manage dedicated server requests',
  'Elastic Servers': 'Manage elastic servers and users',
  Cloud: 'Manage cloud lab services',
  'Cloud Labs': 'Manage cloud lab environments',
  Azure: 'Manage Azure labs',
  'Azure Services': 'Access Azure service management',
  AWS: 'Manage AWS labs',
  'AWS Services': 'Access AWS lab management',
  'GCP Services': 'Access GCP lab management',
  GCP: 'Manage GCP services',
  Team: 'Manage team members and access',
  Projects: 'Manage projects and resources',
  Project: 'Manage projects and resources',
  'Access control': 'Create roles and assign people',
  Docs: 'View documentation',
  'Machine Manager': 'Use machine manager tools',
  'VM Management': 'Manage VM management dashboard',
  'VM Host Leases': 'Manage VM host leases',
  'Admin Users': 'Manage admin users and services',
  'Webyne VM requests': 'Handle Webyne VM catalog requests',
  'Webyne pricing': 'View and edit Webyne pricing',
  'VM Pricing Calculator': 'Use the VM pricing calculator',
  'White Labelling': 'Manage white labelling and tenants',
  Overview: 'View business overview dashboard',
  Orders: 'View and create orders',
};

export const PERMISSION_HELPERS: Record<string, string> = {
  'console.access': 'Allows basic access to the dashboard for this service.',
  'billing.read': 'Can see past transactions and current account balance.',
  'billing.topup': 'Permission to authorize new payments and add credits.',
  'wallet.read': 'Can see past transactions and current account balance.',
  'wallet.topup': 'Permission to authorize new payments and add credits.',
  'vms.read': 'Allows reading configuration and status of all virtual servers and managed instances.',
  'vms.manage': 'Start, stop, restart servers and modify internal network or storage settings.',
  'vms.assign': 'Grant or revoke specific server access to other members within the organization.',
  'create_vm.read':
    'Allows the user to view all submitted and historical VM catalog requests and their current status.',
  'create_vm.request':
    'Grant permission to initiate new VM requests from the enterprise catalog and configure instance specifications.',
};

const SERVICE_ICONS: Record<string, LucideIcon> = {
  Billing: CreditCard,
  Console: LayoutDashboard,
  'VPS Hosting': Server,
  'VM Catalog': Package,
  'Dedicated Server': Server,
  'Dedicated Servers': Server,
  'Elastic Servers': Cloud,
  Cloud: Cloud,
  'Cloud Labs': Cloud,
  Azure: Cloud,
  'Azure Services': Cloud,
  AWS: Cloud,
  'AWS Services': Cloud,
  'GCP Services': Cloud,
  GCP: Cloud,
  Team: Users,
  Projects: FolderKanban,
  Project: FolderKanban,
  'Access control': Shield,
  Docs: FileText,
  'Machine Manager': Wrench,
  'VM Management': Monitor,
  'VM Host Leases': KeyRound,
  'Admin Users': Users,
  'Webyne VM requests': Package,
  'Webyne pricing': CreditCard,
  'VM Pricing Calculator': Settings,
  'White Labelling': Shield,
  Overview: LayoutDashboard,
  Orders: ShoppingCart,
};

export function serviceIcon(group: string): LucideIcon {
  return SERVICE_ICONS[group] ?? Shield;
}

export function serviceDescription(group: string): string {
  return SERVICE_DESCRIPTIONS[group] ?? `Configure permissions for ${group}.`;
}

export function permissionHelper(key: string, label: string): string {
  return PERMISSION_HELPERS[key] ?? `Allows: ${label}.`;
}

export function groupCatalog(catalog: RolePermissionDef[]): Map<string, RolePermissionDef[]> {
  const map = new Map<string, RolePermissionDef[]>();
  for (const p of catalog) {
    const list = map.get(p.group) || [];
    list.push(p);
    map.set(p.group, list);
  }
  return map;
}

export function servicesFromPermissions(
  catalog: RolePermissionDef[],
  permissions: string[]
): string[] {
  const selected = new Set(permissions);
  const groups: string[] = [];
  for (const [group, perms] of groupCatalog(catalog)) {
    if (perms.some((p) => selected.has(p.key))) groups.push(group);
  }
  return groups;
}
