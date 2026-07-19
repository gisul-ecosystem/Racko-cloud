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

export interface AdminServicePublic {
  serviceKey: AdminServiceKey;
  status: AdminServiceConfigStatus;
}

function toPublic(doc: IAdminServiceConfig): AdminServicePublic {
  return {
    serviceKey: doc.serviceKey,
    status: doc.status,
  };
}

async function requirePlatformAdmin(adminId: mongoose.Types.ObjectId): Promise<{
  seeded: boolean;
}> {
  const user = await User.findById(adminId).select('role adminServicesSeeded');
  if (!user || user.role !== 'admin') {
    throw new NotFoundError('Admin user not found.');
  }
  return { seeded: Boolean(user.adminServicesSeeded) };
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
    // Ignore duplicate-key races
    const code = (err as { code?: number })?.code;
    if (code !== 11000) throw err;
  });
}

async function markSeeded(adminId: mongoose.Types.ObjectId): Promise<void> {
  await User.updateOne(
    { _id: adminId },
    { $set: { adminServicesSeeded: true } }
  );
}

class AdminServicesService {
  /** New admin registration — only VM Catalog + Dedicated Server. */
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

  /**
   * Ensure configs exist:
   * - never seeded → treat as existing admin → all services active
   * - already seeded but empty → leave empty (intentionally revoked)
   */
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

    return docs.map(toPublic);
  }

  async listMine(adminId: mongoose.Types.ObjectId): Promise<AdminServicePublic[]> {
    return this.ensureServices(adminId);
  }

  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<AdminServicePublic[]> {
    return this.ensureServices(adminId);
  }

  async assignService(
    adminId: mongoose.Types.ObjectId,
    serviceKey: AdminServiceKey,
    actorId: mongoose.Types.ObjectId
  ): Promise<AdminServicePublic> {
    await requirePlatformAdmin(adminId);
    await markSeeded(adminId);

    const existing = await AdminServiceConfig.findOne({ adminId, serviceKey });
    if (existing) {
      if (existing.status === 'active') {
        throw new ConflictError('Service is already assigned and active.');
      }
      existing.status = 'active';
      existing.createdBy = actorId;
      await existing.save();
      return toPublic(existing);
    }

    const doc = await AdminServiceConfig.create({
      adminId,
      serviceKey,
      status: 'active',
      createdBy: actorId,
    });
    return toPublic(doc);
  }

  async updateStatus(
    adminId: mongoose.Types.ObjectId,
    serviceKey: AdminServiceKey,
    status: AdminServiceConfigStatus
  ): Promise<AdminServicePublic> {
    await requirePlatformAdmin(adminId);
    const doc = await AdminServiceConfig.findOne({ adminId, serviceKey });
    if (!doc) {
      throw new NotFoundError('Service config not found. Assign the service first.');
    }
    doc.status = status;
    await doc.save();
    return toPublic(doc);
  }

  async removeService(
    adminId: mongoose.Types.ObjectId,
    serviceKey: AdminServiceKey
  ): Promise<void> {
    await requirePlatformAdmin(adminId);
    const result = await AdminServiceConfig.deleteOne({ adminId, serviceKey });
    if (result.deletedCount === 0) {
      throw new NotFoundError('Service config not found.');
    }
  }

  async assertActive(
    adminId: mongoose.Types.ObjectId,
    serviceKey: AdminServiceKey
  ): Promise<void> {
    const services = await this.ensureServices(adminId);
    const ok = services.some((s) => s.serviceKey === serviceKey && s.status === 'active');
    if (!ok) {
      throw new ForbiddenError(`Service "${serviceKey}" is not enabled for this admin.`);
    }
  }

  catalog(): AdminServiceKey[] {
    return [...ADMIN_SERVICE_CATALOG];
  }
}

export function parseAdminObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid admin id format.');
  }
  return new mongoose.Types.ObjectId(id);
}

export const adminServicesService = new AdminServicesService();
