import type { LabTemplate } from '../constants';
import type {
  CatalogService,
  SelectedInstance,
  SelectedRole,
  ServiceCatalogResponse,
} from '../../cloud_automation/types/catalog';

export type LabProvisionBundle = {
  serviceIds: number[];
  selectedRoles: SelectedRole[];
  selectedInstances: SelectedInstance[];
  location: string;
  missingServiceNames: string[];
  /** strict = only template roles (DP-900 read-only); standard = allow catalog auto-assign */
  labPermissionMode: 'strict' | 'standard';
};

type LabServiceSpec = {
  name: string;
  roles: string[];
  defaultInstance?: string;
  access?: string;
};

function findServiceByName(catalog: ServiceCatalogResponse, name: string): CatalogService | undefined {
  const needle = name.trim().toLowerCase();
  return catalog.services.find((service) => {
    const serviceName = String(service.service_name || service.name || '')
      .trim()
      .toLowerCase();
    return serviceName === needle;
  });
}

function rolesForService(
  catalog: ServiceCatalogResponse,
  service: CatalogService,
  preferredRoles: string[]
): string[] {
  if (preferredRoles.length > 0) {
    return preferredRoles;
  }

  const mapped = (catalog.roles || [])
    .filter((role) => Number(role.serviceId) === Number(service.id))
    .map((role) => role.azure_role)
    .filter(Boolean);

  if (service.default_role) return [service.default_role];
  if (service.azure_role) return [service.azure_role];

  return mapped.filter((role) =>
    (catalog.roles || []).some(
      (entry) =>
        Number(entry.serviceId) === Number(service.id) &&
        entry.azure_role === role &&
        entry.auto_assign
    )
  );
}

function parseLabServiceSpecs(lab: LabTemplate): LabServiceSpec[] {
  const raw = Array.isArray(lab.services) ? lab.services : lab.instances;
  const specs: LabServiceSpec[] = [];

  for (const item of raw || []) {
    if (typeof item === 'string') {
      specs.push({ name: item, roles: [] });
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name : null;
      if (!name) continue;
      specs.push({
        name,
        roles: Array.isArray(record.roles)
          ? record.roles.filter((role): role is string => typeof role === 'string')
          : [],
        defaultInstance:
          typeof record.defaultInstance === 'string' ? record.defaultInstance : undefined,
        access: typeof record.access === 'string' ? record.access : undefined,
      });
    }
  }

  return specs;
}

function resolveInstanceOption(
  catalog: ServiceCatalogResponse,
  service: CatalogService,
  preferred?: string
): string | null {
  if (!service.supports_instances) return null;

  const options = (catalog.instances || []).filter(
    (instance) => Number(instance.serviceId) === Number(service.id)
  );
  if (options.length === 0) return null;

  if (preferred) {
    const match = options.find(
      (option) => String(option.option_name).toLowerCase() === preferred.toLowerCase()
    );
    if (match) return match.option_name;
  }

  return options[0]?.option_name ?? null;
}

/**
 * Map a Cloud Labs template to Azure catalog services/roles for provisioning
 * (RG → services → users → roles → manage-portal credential email).
 * Pass locationOverride when the UI picked an available region (same as Azure create).
 */
export function buildLabProvisionBundle(
  lab: LabTemplate,
  catalog: ServiceCatalogResponse,
  selectedInstanceLabels: string[] = [],
  locationOverride?: string | null
): LabProvisionBundle {
  const templateRegion = String(lab.region || 'eastus').trim().toLowerCase() || 'eastus';
  const override = String(locationOverride || '')
    .trim()
    .toLowerCase();
  const location = override || templateRegion;
  const wanted: LabServiceSpec[] = [];

  if (lab.kind === 'fabric') {
    const workspaceRole = lab.permissions.workspaceRole || 'Contributor';
    wanted.push({
      name: 'Microsoft Fabric',
      roles: [
        workspaceRole === 'Contributor' ? 'Contributor' : workspaceRole,
        'Storage Blob Data Contributor',
      ],
      access: 'write',
    });
  } else {
    const specs = parseLabServiceSpecs(lab);
    const selected = new Set(selectedInstanceLabels.map((label) => label.trim().toLowerCase()));

    for (const spec of specs) {
      if (selected.size > 0 && !selected.has(spec.name.trim().toLowerCase())) {
        continue;
      }
      wanted.push(spec);
    }

    // If UI labels were instance SKUs rather than service names, fall back to all lab services.
    if (wanted.length === 0 && specs.length > 0) {
      wanted.push(...specs);
    }
  }

  const serviceIds: number[] = [];
  const selectedRoles: SelectedRole[] = [];
  const selectedInstances: SelectedInstance[] = [];
  const missingServiceNames: string[] = [];
  const seen = new Set<number>();
  let hasReadOnly = false;
  let hasWrite = false;

  for (const entry of wanted) {
    const service = findServiceByName(catalog, entry.name);
    if (!service) {
      missingServiceNames.push(entry.name);
      continue;
    }

    const id = Number(service.id);
    if (seen.has(id)) continue;
    seen.add(id);
    serviceIds.push(id);

    if (entry.access === 'read') hasReadOnly = true;
    if (entry.access === 'write') hasWrite = true;

    const roles = rolesForService(catalog, service, entry.roles || []);
    if (roles.length > 0) {
      selectedRoles.push({ serviceId: id, roles });
    }

    if (lab.kind === 'fabric') continue;

    const instanceOption = resolveInstanceOption(catalog, service, entry.defaultInstance);
    if (instanceOption) {
      selectedInstances.push({ serviceId: id, instanceOption });
    }
  }

  return {
    serviceIds,
    selectedRoles,
    selectedInstances,
    location,
    missingServiceNames,
    labPermissionMode: hasReadOnly && !hasWrite ? 'strict' : 'standard',
  };
}
