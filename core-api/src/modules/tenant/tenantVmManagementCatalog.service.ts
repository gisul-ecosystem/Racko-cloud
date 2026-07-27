import { vmService } from '../vm/vm.service';
import { ValidationError } from '../../utils/errors';

export interface PlatformTemplateOption {
  templateId: number;
  name: string;
  node: string;
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  enabled: boolean;
}

function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

/**
 * Enabled Proxmox templates the super_admin can offer to a tenant via limits.allowedTemplateIds.
 */
export async function listPlatformTemplatesForAssignment(): Promise<PlatformTemplateOption[]> {
  const catalog = await vmService.getTemplateCatalog();
  const enabledSet = new Set(catalog.enabledVmids);

  return catalog.templates
    .filter((template) => enabledSet.has(template.vmid))
    .map((template) => ({
      templateId: template.vmid,
      name: template.name,
      node: template.node,
      cpuCores: template.cpu ?? 1,
      memoryGb: bytesToGb(template.memory),
      diskGb: bytesToGb(template.maxdisk),
      enabled: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * allowedTemplateIds: [] or absent = tenant may order any enabled platform template.
 * Non-empty = only those template IDs (must be enabled on the platform).
 */
export async function validateAllowedTemplateIds(allowedTemplateIds: unknown): Promise<number[]> {
  if (allowedTemplateIds === undefined || allowedTemplateIds === null) {
    return [];
  }

  if (!Array.isArray(allowedTemplateIds)) {
    throw new ValidationError('allowedTemplateIds must be an array of template IDs.');
  }

  if (allowedTemplateIds.length === 0) {
    return [];
  }

  const ids = allowedTemplateIds.map((id, index) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new ValidationError(`allowedTemplateIds[${index}] must be a positive integer.`);
    }
    return id;
  });

  const uniqueIds = [...new Set(ids)];
  const platformTemplates = await listPlatformTemplatesForAssignment();
  const enabledIds = new Set(platformTemplates.map((t) => t.templateId));

  const invalid = uniqueIds.filter((id) => !enabledIds.has(id));
  if (invalid.length > 0) {
    throw new ValidationError(
      `allowedTemplateIds contains templates not enabled on the platform: ${invalid.join(', ')}`
    );
  }

  return uniqueIds;
}

export async function normalizeVmManagementLimits(
  limits: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const normalized = { ...limits };

  if ('allowedTemplateIds' in normalized) {
    normalized['allowedTemplateIds'] = await validateAllowedTemplateIds(
      normalized['allowedTemplateIds']
    );
  }

  return normalized;
}
