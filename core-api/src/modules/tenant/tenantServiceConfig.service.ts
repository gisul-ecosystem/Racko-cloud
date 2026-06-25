import mongoose from 'mongoose';
import type { ServiceKey } from '../../constants/serviceCatalog';
import { Tenant } from '../../models/tenant.model';
import {
  TenantServiceConfig,
  type ITenantServiceConfig,
  type TenantServiceConfigStatus,
} from '../../models/tenantServiceConfig.model';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import {
  serviceConfigCreateSchema,
  type ServiceConfigUpdateInput,
} from './tenantServiceConfig.validation';
import { isValidObjectId } from './tenant.service';
import { normalizeVmManagementLimits, listPlatformTemplatesForAssignment } from './tenantVmManagementCatalog.service';
import { orderService } from '../order/order.service';

export interface TenantServiceConfigPublic {
  id: string;
  tenantId: string;
  serviceKey: ServiceKey;
  status: TenantServiceConfigStatus;
  limits: Record<string, unknown>;
  pricing: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function toPublic(doc: ITenantServiceConfig): TenantServiceConfigPublic {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    serviceKey: doc.serviceKey,
    status: doc.status,
    limits: (doc.limits ?? {}) as Record<string, unknown>,
    pricing: (doc.pricing ?? {}) as Record<string, unknown>,
    createdBy: doc.createdBy.toString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function assertValidMergedConfig(
  serviceKey: ServiceKey,
  limits: unknown,
  pricing: unknown
): void {
  const result = serviceConfigCreateSchema.safeParse({ serviceKey, limits, pricing });
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ValidationError(firstIssue?.message ?? 'Invalid service configuration.');
  }
}

async function requireTenantExists(tenantId: string): Promise<void> {
  if (!isValidObjectId(tenantId)) {
    throw new ValidationError('Invalid tenant id format.');
  }

  const exists = await Tenant.exists({ _id: tenantId });
  if (!exists) {
    throw new NotFoundError('Tenant not found.');
  }
}

export class TenantServiceConfigService {
  async assignService(
    tenantId: string,
    serviceKey: ServiceKey,
    limits: Record<string, unknown>,
    pricing: Record<string, unknown>,
    createdBy: string
  ): Promise<TenantServiceConfigPublic> {
    if (!isValidObjectId(tenantId)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    await requireTenantExists(tenantId);

    const existing = await TenantServiceConfig.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      serviceKey,
    });

    if (existing) {
      throw new ConflictError('use PATCH to update an existing service config');
    }

    const resolvedLimits =
      serviceKey === 'vm-management'
        ? await normalizeVmManagementLimits(limits)
        : limits;

    assertValidMergedConfig(serviceKey, resolvedLimits, pricing);

    const doc = await TenantServiceConfig.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      serviceKey,
      status: 'active',
      limits: resolvedLimits,
      pricing,
      createdBy: new mongoose.Types.ObjectId(createdBy),
    });

    return toPublic(doc);
  }

  async listServicesForTenant(tenantId: string): Promise<TenantServiceConfigPublic[]> {
    await requireTenantExists(tenantId);

    const configs = await TenantServiceConfig.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).sort({ serviceKey: 1 });

    return configs.map(toPublic);
  }

  async updateServiceConfig(
    tenantId: string,
    serviceKey: ServiceKey,
    updates: ServiceConfigUpdateInput
  ): Promise<TenantServiceConfigPublic> {
    if (!isValidObjectId(tenantId)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const config = await TenantServiceConfig.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      serviceKey,
    });

    if (!config) {
      throw new NotFoundError('SERVICE_CONFIG_NOT_FOUND');
    }

    const mergedLimits =
      updates.limits !== undefined
        ? { ...(config.limits as Record<string, unknown>), ...updates.limits }
        : config.limits;

    const mergedPricing =
      updates.pricing !== undefined
        ? { ...(config.pricing as Record<string, unknown>), ...updates.pricing }
        : config.pricing;

    const resolvedLimits =
      serviceKey === 'vm-management'
        ? await normalizeVmManagementLimits(mergedLimits as Record<string, unknown>)
        : mergedLimits;

    assertValidMergedConfig(serviceKey, resolvedLimits, mergedPricing);

    if (updates.limits !== undefined) {
      config.limits = resolvedLimits;
    }
    if (updates.pricing !== undefined) {
      config.pricing = mergedPricing;
    }
    if (updates.status !== undefined) {
      config.status = updates.status;
    }

    config.markModified('limits');
    config.markModified('pricing');
    await config.save();

    return toPublic(config);
  }

  async removeService(
    tenantId: string,
    serviceKey: ServiceKey,
    force = false
  ): Promise<TenantServiceConfigPublic | { deleted: true; serviceKey: ServiceKey }> {
    if (!isValidObjectId(tenantId)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const config = await TenantServiceConfig.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      serviceKey,
    });

    if (!config) {
      throw new NotFoundError('SERVICE_CONFIG_NOT_FOUND');
    }

    if (force) {
      await config.deleteOne();
      return { deleted: true, serviceKey };
    }

    config.status = 'suspended';
    await config.save();

    return toPublic(config);
  }

  async getVmManagementPlatformTemplates(tenantId: string) {
    await requireTenantExists(tenantId);

    const [templates, config] = await Promise.all([
      listPlatformTemplatesForAssignment(),
      TenantServiceConfig.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        serviceKey: 'vm-management',
      }).lean(),
    ]);

    const allowedTemplateIds = config
      ? ((config.limits as Record<string, unknown>)['allowedTemplateIds'] as number[] | undefined) ?? []
      : [];
    const validAllowed = Array.isArray(allowedTemplateIds)
      ? allowedTemplateIds.filter((id) => typeof id === 'number')
      : [];
    const allEnabledAllowed = validAllowed.length === 0;
    const allowedSet = new Set(validAllowed);

    return {
      platformCatalogPath: '/api/v1/vms/templates/catalog',
      platformSelectionPath: '/api/v1/vms/templates/selection',
      selectionMode: allEnabledAllowed ? ('all_enabled' as const) : ('allowlist' as const),
      allowedTemplateIds: validAllowed,
      templates: templates.map((template) => ({
        ...template,
        selected: allEnabledAllowed || allowedSet.has(template.templateId),
      })),
    };
  }

  async getVmManagementOrderableTemplatesForTenant(tenantId: string) {
    await requireTenantExists(tenantId);
    return orderService.getAvailableTemplatesForTenant(tenantId);
  }
}

export const tenantServiceConfigService = new TenantServiceConfigService();
