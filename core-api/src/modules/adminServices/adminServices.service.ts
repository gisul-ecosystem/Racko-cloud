import mongoose from 'mongoose';
import {
  ADMIN_SERVICE_CATALOG,
  DEFAULT_NEW_ADMIN_SERVICES,
  type AdminServiceKey,
} from '../../constants/adminServiceCatalog';
import {
  AdminServiceConfig,
  type AdminServiceConfigStatus,
  type IAdminServiceConfig,
} from '../../models/adminServiceConfig.model';
import { User } from '../../models/user.model';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { logger } from '../../utils/logger';
import { serviceCatalogService } from '../serviceCatalog/serviceCatalog.service';

export interface AdminServicePublic {
  serviceKey: AdminServiceKey;
  status: AdminServiceConfigStatus;
  label?: string;
}

export interface AdminServiceCatalogItem {
  serviceKey: string;
  label: string;
  description?: string;
}

function toPublic(doc: IAdminServiceConfig, label?: string): AdminServicePublic {
  return {
    serviceKey: doc.serviceKey,
    status: doc.status,
    ...(label ? { label } : {}),
  };
}

async function requirePlatformAdmin(adminId: mongoose.Types.ObjectId): Promise<{
  seeded: boolean;
  orgOwnerId?: mongoose.Types.ObjectId | null;
}> {
  const user = await User.findById(adminId).select('role adminServicesSeeded orgOwnerId');
  if (!user || user.role !== 'admin') {
    throw new NotFoundError('Admin user not found.');
  }
  return { seeded: Boolean(user.adminServicesSeeded), orgOwnerId: user.orgOwnerId };
}

async function insertKeys(
  adminId: mongoose.Types.ObjectId,
  keys: readonly AdminServiceKey[],
  createdBy?: mongoose.Types.ObjectId
): Promise<void> {
  if (keys.length === 0) return;
  await AdminServiceConfig.insertMany(
    keys.map((serviceKey) => ({
      adminId,
      serviceKey,
      status: 'active' as const,
      ...(createdBy ? { createdBy } : {}),
    })),
    { ordered: false }
  ).catch((err: unknown) => {
    const code = (err as { code?: number })?.code;
    if (code !== 11000) throw err;
  });
}

async function markSeeded(adminId: mongoose.Types.ObjectId): Promise<void> {
  await User.updateOne({ _id: adminId }, { $set: { adminServicesSeeded: true } });
}

class AdminServicesService {
  async resolveEntitlementAdminId(
    adminId: mongoose.Types.ObjectId
  ): Promise<mongoose.Types.ObjectId> {
    const user = await User.findById(adminId).select('role orgOwnerId');
    if (!user || user.role !== 'admin') {
      throw new NotFoundError('Admin user not found.');
    }
    return user.orgOwnerId || adminId;
  }

  async seedDefaultsForNewAdmin(
    adminId: mongoose.Types.ObjectId,
    createdBy?: mongoose.Types.ObjectId
  ): Promise<void> {
    const count = await AdminServiceConfig.countDocuments({ adminId });
    if (count > 0) {
      await markSeeded(adminId);
      return;
    }
    await insertKeys(adminId, DEFAULT_NEW_ADMIN_SERVICES, createdBy);
    await markSeeded(adminId);
    logger.info('[AdminServices] Seeded default services for new admin', {
      adminId: adminId.toString(),
      services: [...DEFAULT_NEW_ADMIN_SERVICES],
    });
  }

  async ensureServices(adminId: mongoose.Types.ObjectId): Promise<AdminServicePublic[]> {
    const { seeded } = await requirePlatformAdmin(adminId);
    let docs = await AdminServiceConfig.find({ adminId }).sort({ serviceKey: 1 });

    if (docs.length === 0 && !seeded) {
      await insertKeys(adminId, ADMIN_SERVICE_CATALOG);
      await markSeeded(adminId);
      docs = await AdminServiceConfig.find({ adminId }).sort({ serviceKey: 1 });
      logger.info('[AdminServices] Seeded all services for existing admin', {
        adminId: adminId.toString(),
      });
    }

    const labels = await serviceCatalogService.getLabelMap(docs.map((d) => d.serviceKey));
    return docs.map((d) => toPublic(d, labels[d.serviceKey]));
  }

  async listMine(adminId: mongoose.Types.ObjectId): Promise<AdminServicePublic[]> {
    const entitlementAdminId = await this.resolveEntitlementAdminId(adminId);
    return this.ensureServices(entitlementAdminId);
  }

  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<AdminServicePublic[]> {
    const entitlementAdminId = await this.resolveEntitlementAdminId(adminId);
    return this.ensureServices(entitlementAdminId);
  }

  async assignService(
    adminId: mongoose.Types.ObjectId,
    serviceKey: string,
    actorId: mongoose.Types.ObjectId
  ): Promise<AdminServicePublic> {
    await requirePlatformAdmin(adminId);
    await serviceCatalogService.assertAssignable(serviceKey, 'admin');
    await markSeeded(adminId);

    const key = serviceKey as AdminServiceKey;
    const existing = await AdminServiceConfig.findOne({ adminId, serviceKey: key });
    if (existing) {
      if (existing.status === 'active') {
        throw new ConflictError('Service is already assigned and active.');
      }
      existing.status = 'active';
      existing.createdBy = actorId;
      await existing.save();
      const labels = await serviceCatalogService.getLabelMap([key]);
      return toPublic(existing, labels[key]);
    }

    const doc = await AdminServiceConfig.create({
      adminId,
      serviceKey: key,
      status: 'active',
      createdBy: actorId,
    });
    const labels = await serviceCatalogService.getLabelMap([key]);
    return toPublic(doc, labels[key]);
  }

  async updateStatus(
    adminId: mongoose.Types.ObjectId,
    serviceKey: string,
    status: AdminServiceConfigStatus
  ): Promise<AdminServicePublic> {
    await requirePlatformAdmin(adminId);
    const key = serviceKey as AdminServiceKey;
    const doc = await AdminServiceConfig.findOne({ adminId, serviceKey: key });
    if (!doc) {
      throw new NotFoundError('Service config not found. Assign the service first.');
    }
    doc.status = status;
    await doc.save();
    const labels = await serviceCatalogService.getLabelMap([key]);
    return toPublic(doc, labels[key]);
  }

  async removeService(adminId: mongoose.Types.ObjectId, serviceKey: string): Promise<void> {
    await requirePlatformAdmin(adminId);
    const result = await AdminServiceConfig.deleteOne({
      adminId,
      serviceKey: serviceKey as AdminServiceKey,
    });
    if (result.deletedCount === 0) {
      throw new NotFoundError('Service config not found.');
    }
  }

  async assertActive(
    adminId: mongoose.Types.ObjectId,
    serviceKey: AdminServiceKey
  ): Promise<void> {
    const entitlementAdminId = await this.resolveEntitlementAdminId(adminId);
    const services = await this.ensureServices(entitlementAdminId);
    const ok = services.some((s) => s.serviceKey === serviceKey && s.status === 'active');
    if (!ok) {
      throw new ForbiddenError(`Service "${serviceKey}" is not enabled for this admin.`);
    }
  }

  async catalog(): Promise<AdminServiceCatalogItem[]> {
    const rows = await serviceCatalogService.list({
      kind: 'product',
      scope: 'admin',
      activeOnly: true,
    });
    return rows.map((r) => ({
      serviceKey: r.key,
      label: r.label,
      description: r.description,
    }));
  }
}

export function parseAdminObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid admin id format.');
  }
  return new mongoose.Types.ObjectId(id);
}

export const adminServicesService = new AdminServicesService();
