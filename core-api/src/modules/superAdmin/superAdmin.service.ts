import mongoose from 'mongoose';
import { Tenant } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { isValidObjectId } from '../tenant/tenant.service';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { TenantStatus } from '../../models/tenant.model';

export interface SuperAdminOverview {
  totalTenants: number;
  tenantsByStatus: Record<TenantStatus, number>;
  totalTenantAdmins: number;
  totalTenantUsers: number;
}

export interface SuperAdminTenantAdminPublic {
  id: string;
  email: string;
  role: 'tenant_admin';
  tenantId: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toTenantAdminPublic(user: {
  _id: mongoose.Types.ObjectId;
  email: string;
  role: 'tenant_admin' | 'tenant_user';
  tenantId: mongoose.Types.ObjectId;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SuperAdminTenantAdminPublic {
  return {
    id: user._id.toString(),
    email: user.email,
    role: 'tenant_admin',
    tenantId: user.tenantId.toString(),
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const EMPTY_STATUS_COUNTS: Record<TenantStatus, number> = {
  pending: 0,
  active: 0,
  suspended: 0,
  cancelled: 0,
};

export class SuperAdminService {
  async getOverview(): Promise<SuperAdminOverview> {
    const [totalTenants, statusGroups, totalTenantAdmins, totalTenantUsers] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.aggregate<{ _id: TenantStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      TenantUser.countDocuments({ role: 'tenant_admin' }),
      TenantUser.countDocuments({ role: 'tenant_user' }),
    ]);

    const tenantsByStatus = { ...EMPTY_STATUS_COUNTS };
    for (const group of statusGroups) {
      if (group._id in tenantsByStatus) {
        tenantsByStatus[group._id] = group.count;
      }
    }

    return {
      totalTenants,
      tenantsByStatus,
      totalTenantAdmins,
      totalTenantUsers,
    };
  }

  async listTenantAdmins(tenantId: string): Promise<SuperAdminTenantAdminPublic[]> {
    if (!isValidObjectId(tenantId)) {
      throw new NotFoundError('Tenant not found.');
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const admins = await TenantUser.find({
      tenantId: tenant._id,
      role: 'tenant_admin',
    }).sort({ createdAt: -1 });

    return admins.map(toTenantAdminPublic);
  }

  async setTenantAdminActive(
    tenantId: string,
    tenantUserId: string,
    isActive: boolean
  ): Promise<SuperAdminTenantAdminPublic> {
    if (!isValidObjectId(tenantId) || !isValidObjectId(tenantUserId)) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    const tenantUser = await TenantUser.findOne({
      _id: new mongoose.Types.ObjectId(tenantUserId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      role: 'tenant_admin',
    });

    if (!tenantUser) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    tenantUser.isActive = isActive;
    await tenantUser.save();

    return toTenantAdminPublic(tenantUser);
  }

  async deleteTenantAdmin(tenantId: string, tenantUserId: string): Promise<void> {
    if (!isValidObjectId(tenantId) || !isValidObjectId(tenantUserId)) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const tenant = await Tenant.findById(tenantObjectId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const admin = await TenantUser.findOne({
      _id: new mongoose.Types.ObjectId(tenantUserId),
      tenantId: tenantObjectId,
      role: 'tenant_admin',
    });

    if (!admin) {
      throw new NotFoundError('TENANT_ADMIN_NOT_FOUND');
    }

    const adminCount = await TenantUser.countDocuments({
      tenantId: tenantObjectId,
      role: 'tenant_admin',
    });
    if (adminCount <= 1) {
      throw new ForbiddenError('Cannot delete the last tenant admin. Create another admin first.');
    }

    await admin.deleteOne();

    logger.info('[SuperAdmin] Tenant admin deleted', {
      tenantId,
      tenantUserId,
      email: admin.email,
    });
  }
}

export const superAdminService = new SuperAdminService();
