import type {
  ServiceCatalogKind,
  ServiceCatalogScope,
  ServiceCatalogStatus,
} from '../models/serviceCatalog.model';

/** Seed rows for Mongo `service_catalog`. Runtime truth after boot seed. */
export interface ServiceCatalogSeedRow {
  key: string;
  label: string;
  description: string;
  kind: ServiceCatalogKind;
  scopes: ServiceCatalogScope[];
  status: ServiceCatalogStatus;
  sortOrder: number;
}

export const SERVICE_CATALOG_SEED: readonly ServiceCatalogSeedRow[] = [
  {
    key: 'vm-management',
    label: 'VPS Hosting',
    description: 'Provision and manage Racko cloud virtual machines',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 10,
  },
  {
    key: 'create-vm',
    label: 'VM Catalog',
    description: 'Browse VM plans and request catalog virtual machines',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 20,
  },
  {
    key: 'dedicated-server',
    label: 'Dedicated Server',
    description: 'Request and manage dedicated bare-metal servers',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 30,
  },
  {
    key: 'elastic-servers',
    label: 'Elastic Server Import',
    description: 'Connect to external servers via secure browser console',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 40,
  },
  {
    key: 'azure',
    label: 'Azure Lab',
    description: 'Azure access management, provisioning, and lab environments',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 50,
  },
  {
    key: 'aws',
    label: 'AWS Lab',
    description: 'AWS access management, provisioning, and lab environments',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 60,
  },
  {
    key: 'gcp',
    label: 'GCP Lab',
    description: 'GCP access management, provisioning, and lab environments',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'hidden',
    sortOrder: 70,
  },
  {
    key: 'cloud-labs',
    label: 'Cloud Labs',
    description: 'Cloud lab environments and training workspaces',
    kind: 'product',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 80,
  },
  {
    key: 'docs',
    label: 'Documentation',
    description: 'Guides and reference for platform services',
    kind: 'utility',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 90,
  },
  {
    key: 'machine-manager',
    label: 'Machine Manager',
    description: 'Install and manage software on any machine',
    kind: 'utility',
    scopes: ['admin', 'tenant'],
    status: 'active',
    sortOrder: 100,
  },
];
