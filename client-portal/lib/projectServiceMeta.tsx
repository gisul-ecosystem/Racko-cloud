'use client';

import {
  Cloud,
  FlaskConical,
  FolderKanban,
  Globe,
  HardDrive,
  LayoutList,
  Monitor,
  Server,
  SquarePlus,
} from 'lucide-react';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { AZURE_ROUTES } from '@/cloud_automation/constants';
import { AWS_ROUTES } from '@/cloud_automation_aws/constants';
import { GCP_ROUTES } from '@/cloud_automation_gcp/constants';
import { CLOUD_LABS_ROUTES } from '@/cloud_automation_training/constants';
import { tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';

export type ProjectServiceMeta = {
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
};

/** Shared labels/icons for project create toggles and detail cards. */
export const PROJECT_SERVICE_META: Record<AdminServiceKey, ProjectServiceMeta> = {
  'create-vm': {
    label: 'VM Catalog',
    description: 'Browse plans, request VMs and manage instances.',
    icon: <SquarePlus className="h-5 w-5" />,
    iconBg: 'bg-red-50',
    iconColor: 'text-[#B91C1C]',
  },
  'dedicated-server': {
    label: 'Dedicated Server',
    description: 'Request and manage dedicated hardware plans.',
    icon: <HardDrive className="h-5 w-5" />,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
  },
  'vm-management': {
    label: 'VPS Hosting',
    description: 'Provision and manage Racko cloud virtual machines.',
    icon: <Server className="h-5 w-5" />,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
  'elastic-servers': {
    label: 'External VM',
    description: 'External servers accessed via secure browser console.',
    icon: <Globe className="h-5 w-5" />,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
  },
  'my-vms': {
    label: 'My VM Dashboard',
    description: 'Read-only dashboard of all assigned external servers.',
    icon: <LayoutList className="h-5 w-5" />,
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-600',
  },
  azure: {
    label: 'Azure Lab',
    description: 'Azure access management, provisioning, and lab environments.',
    icon: <Cloud className="h-5 w-5" />,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  aws: {
    label: 'AWS Lab',
    description: 'AWS access management, provisioning, and lab environments.',
    icon: <Server className="h-5 w-5" />,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
  gcp: {
    label: 'GCP Lab',
    description: 'Google Cloud access management and provisioning.',
    icon: <Globe className="h-5 w-5" />,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
  },
  'cloud-labs': {
    label: 'Cloud Labs',
    description: 'Hands-on lab environments for training and certification.',
    icon: <FlaskConical className="h-5 w-5" />,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
  },
  docs: {
    label: 'Documentation',
    description: 'Guides and reference for all Racko services.',
    icon: <FolderKanban className="h-5 w-5" />,
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-600',
  },
  'machine-manager': {
    label: 'Machine Manager',
    description: 'Install and manage software on any machine.',
    icon: <Monitor className="h-5 w-5" />,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
  },
};

const ORG_LAUNCH_HREF: Record<AdminServiceKey, string> = {
  'create-vm': '/console/create-vm/create',
  'dedicated-server': '/console/dedicated-server/request',
  'vm-management': '/dashboard/admin/vms/create',
  'elastic-servers': '/console/elastic-servers/add',
  'my-vms': '/console/my-vm-dashboard',
  azure: AZURE_ROUTES.createRequest,
  aws: AWS_ROUTES.createRequest,
  gcp: GCP_ROUTES.dashboard,
  'cloud-labs': CLOUD_LABS_ROUTES.azureCreateRequest,
  docs: '/console/docs',
  'machine-manager': '/console/machine-manager',
};

const TENANT_LAUNCH_HREF: Record<AdminServiceKey, string> = {
  'create-vm': tenantConsole.createVmCreate,
  'dedicated-server': tenantConsole.dedicatedServerRequest,
  'vm-management': tenantVps.createVm,
  'elastic-servers': tenantConsole.elasticAdd,
  'my-vms': tenantConsole.myVmDashboard,
  azure: tenantConsole.azureNew,
  aws: tenantConsole.awsNew,
  gcp: tenantConsole.gcp,
  'cloud-labs': `${tenantConsole.cloudLabsAzure}/requests/new`,
  docs: tenantConsole.docs,
  'machine-manager': tenantConsole.machineManager,
};

export type ProjectPortal = 'org' | 'tenant';

function withProjectId(base: string, projectId?: string | null): string {
  if (!projectId) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}projectId=${encodeURIComponent(projectId)}`;
}

/** Launch URL for a service, optionally preselecting a project. */
export function getServiceLaunchHref(
  serviceKey: AdminServiceKey,
  portal: ProjectPortal = 'org',
  projectId?: string | null
): string {
  const base =
    portal === 'tenant' ? TENANT_LAUNCH_HREF[serviceKey] : ORG_LAUNCH_HREF[serviceKey];
  return withProjectId(base, projectId);
}

/** Wallet transactions for a project, narrowed to one service. */
export function getServiceTransactionsHref(
  serviceKey: AdminServiceKey,
  portal: ProjectPortal = 'org',
  projectId?: string | null
): string | null {
  if (!projectId || serviceKey === 'docs') return null;
  const base =
    portal === 'tenant'
      ? `${tenantConsole.projects}/${projectId}/transactions`
      : `/console/projects/${projectId}/transactions`;
  return `${base}?serviceKey=${encodeURIComponent(serviceKey)}`;
}
