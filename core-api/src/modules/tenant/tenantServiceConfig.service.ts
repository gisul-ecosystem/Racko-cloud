import mongoose from 'mongoose';
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
import { serviceCatalogService } from '../serviceCatalog/serviceCatalog.service';

export interface TenantServiceConfigPublic {
  id: string;
  tenantId: string;
  serviceKey: string;
  status: TenantServiceConfigStatus;
  limits: Record<string, unknown>;
  pricing: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  label?: string;
}

function toPublic(doc: ITenantServiceConfig, label?: string): TenantServiceConfigPublic {
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
    ...(label ? { label } : {}),
  };
}

function assertValidMergedConfig(
  serviceKey: string,
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
    serviceKey: string,
    limits: Record<string, unknown>,
    pricing: Record<string, unknown>,
    createdBy: string
  ): Promise<TenantServiceConfigPublic> {
    if (!isValidObjectId(tenantId)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    await requireTenantExists(tenantId);
    await serviceCatalogService.assertAssignable(serviceKey, 'tenant');

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

    const labels = await serviceCatalogService.getLabelMap([serviceKey]);
    return toPublic(doc, labels[serviceKey]);
  }

  async listServicesForTenant(tenantId: string): Promise<TenantServiceConfigPublic[]> {
    await requireTenantExists(tenantId);

    const configs = await TenantServiceConfig.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).sort({ serviceKey: 1 });

    const labels = await serviceCatalogService.getLabelMap(configs.map((c) => c.serviceKey));
    return configs.map((c) => toPublic(c, labels[c.serviceKey]));
  }

  async updateServiceConfig(
    tenantId: string,
    serviceKey: string,
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

    // Only validate limits+pricing integrity when limits are explicitly being updated,
    // to avoid spurious Required errors on pricing-only or status-only updates.
    if (updates.limits !== undefined) {
      assertValidMergedConfig(serviceKey, resolvedLimits, mergedPricing);
    }

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

    const labels = await serviceCatalogService.getLabelMap([serviceKey]);
    return toPublic(config, labels[serviceKey]);
  }

  async removeService(
    tenantId: string,
    serviceKey: string,
    force = false
  ): Promise<TenantServiceConfigPublic | { deleted: true; serviceKey: string }> {
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
