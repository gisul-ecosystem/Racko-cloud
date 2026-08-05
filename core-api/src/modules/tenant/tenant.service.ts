import crypto from 'crypto';
import mongoose from 'mongoose';
import { Tenant, type ITenant, type TenantStatus, type TenantIpAccessMode } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { TenantServiceConfig } from '../../models/tenantServiceConfig.model';
import { TenantBrandingAsset } from '../../models/tenantBrandingAsset.model';
import { TenantNotification } from '../../models/tenantNotification.model';
import { Wallet } from '../../models/wallet.model';
import { WalletTransaction } from '../../models/walletTransaction.model';
import { ManualWalletCredit } from '../../models/manualWalletCredit.model';
import { Order } from '../../models/order.model';
import { DedicatedServerRequestModel } from '../../models/dedicatedServerRequest.model';
import { CatalogVmModel } from '../../models/catalogVm.model';
import { VM } from '../vm/vm.model';
import { ExternalVMModel } from '../external-vm/external-vm.model';
import { hashPassword } from '../../utils/argon2';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import { sendTenantOperatorInviteEmail } from '../../utils/email/sender';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { logger } from '../../utils/logger';
import type {
  CreateTenantAdminInput,
  CreateTenantInput,
  UpdateTenantInput,
  UpdateTenantIpAccessInput,
} from './tenant.validation';

const CONSOLE_INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: number }).code === 11000
  );
}

export function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tenant';
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugifyName(name);
  let slug = base;
  let attempts = 0;

  while (await Tenant.exists({ slug })) {
    const suffix = crypto.randomBytes(3).toString('hex');
    slug = `${base}-${suffix}`;
    attempts += 1;
    if (attempts > 25) {
      throw new ConflictError('Unable to generate a unique tenant slug.');
    }
  }

  return slug;
}

export interface TenantPublic {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: TenantStatus;
  branding: ITenant['branding'];
  enabledServices: string[];
  limits: ITenant['limits'];
  ipAccessMode: TenantIpAccessMode;
  allowedIps: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantAdminPublic {
  id: string;
  email: string;
  role: 'tenant_admin';
  tenantId: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  createdAt: Date;
}

function toTenantPublic(tenant: ITenant): TenantPublic {
  return {
    id: tenant._id.toString(),
    slug: tenant.slug,
    name: tenant.name,
    domain: tenant.domain,
    status: tenant.status,
    branding: tenant.branding ?? {},
    enabledServices: tenant.enabledServices ?? [],
    limits: tenant.limits ?? {},
    ipAccessMode: tenant.ipAccessMode ?? 'all',
    allowedIps: tenant.allowedIps ?? [],
    createdBy: tenant.createdBy ? tenant.createdBy.toString() : null,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export class TenantService {
  async createTenant(
    dto: CreateTenantInput,
    createdByUserId: string
  ): Promise<TenantPublic> {
    const slug = await generateUniqueSlug(dto.name);

    try {
      const tenant = await Tenant.create({
        slug,
        name: dto.name.trim(),
        domain: dto.domain,
        status: 'pending',
        branding: dto.branding ?? {},
        enabledServices: [],
        createdBy: new mongoose.Types.ObjectId(createdByUserId),
      });

      return toTenantPublic(tenant);
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new ConflictError('A tenant with this domain or slug already exists.');
      }
      throw error;
    }
  }

  async listTenants(
    page: number,
    limit: number,
    status?: TenantStatus
  ): Promise<{ tenants: TenantPublic[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const filter = status ? { status } : {};

    const [tenants, total] = await Promise.all([
      Tenant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      Tenant.countDocuments(filter),
    ]);

    return {
      tenants: tenants.map(toTenantPublic),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getTenantById(id: string): Promise<TenantPublic> {
    if (!isValidObjectId(id)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    return toTenantPublic(tenant);
  }

  async updateTenant(id: string, dto: UpdateTenantInput): Promise<TenantPublic> {
    if (!isValidObjectId(id)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const { slug: _slug, createdBy: _createdBy, ...updates } = dto as UpdateTenantInput & {
      slug?: string;
      createdBy?: string;
    };

    if (updates.domain && updates.domain !== tenant.domain) {
      const domainTaken = await Tenant.findOne({
        domain: updates.domain,
        _id: { $ne: tenant._id },
      });
      if (domainTaken) {
        throw new ConflictError('A tenant with this domain already exists.');
      }
    }

    if (updates.name !== undefined) tenant.name = updates.name;
    if (updates.domain !== undefined) tenant.domain = updates.domain;
    if (updates.status !== undefined) tenant.status = updates.status;
    if (updates.branding !== undefined) {
      tenant.branding = { ...(tenant.branding ?? {}), ...updates.branding };
      tenant.markModified('branding');
    }

    try {
      await tenant.save();
      return toTenantPublic(tenant);
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new ConflictError('A tenant with this domain already exists.');
      }
      throw error;
    }
  }

  async createTenantAdmin(
    tenantId: string,
    dto: CreateTenantAdminInput
  ): Promise<TenantAdminPublic> {
    if (!isValidObjectId(tenantId)) {
      throw new NotFoundError('Tenant not found.');
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const existing = await TenantUser.findOne({
      tenantId: tenant._id,
      email: dto.email,
    });

    if (existing) {
      throw new ConflictError('TENANT_ADMIN_ALREADY_EXISTS');
    }

    const passwordHash = await hashPassword(dto.password);
    const rawVerifyToken = generateSecureToken(32);
    const rawResetToken = generateSecureToken(32);
    const inviteExpiresAt = new Date(Date.now() + CONSOLE_INVITE_TOKEN_TTL_MS);

    const tenantAdmin = await TenantUser.create({
      tenantId: tenant._id,
      email: dto.email,
      passwordHash,
      role: 'tenant_admin',
      isActive: true,
      isEmailVerified: false,
      mustSetPassword: true,
      emailVerificationTokenHash: hashToken(rawVerifyToken),
      emailVerificationExpiresAt: inviteExpiresAt,
      resetTokenHash: hashToken(rawResetToken),
      resetTokenExpiresAt: inviteExpiresAt,
      createdBy: null,
    });

    try {
      await sendTenantOperatorInviteEmail({
        to: tenantAdmin.email,
        email: tenantAdmin.email,
        tempPassword: dto.password,
        verifyToken: rawVerifyToken,
        resetToken: rawResetToken,
        inviteKind: 'admin',
        tenant: {
          name: tenant.name,
          domain: tenant.domain,
          branding: tenant.branding,
        },
      });
    } catch (err) {
      logger.warn('Failed to send tenant admin invite email', {
        tenantId: tenant._id.toString(),
        email: tenantAdmin.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      id: tenantAdmin._id.toString(),
      email: tenantAdmin.email,
      role: 'tenant_admin',
      tenantId: tenant._id.toString(),
      isActive: tenantAdmin.isActive,
      isEmailVerified: tenantAdmin.isEmailVerified,
      createdAt: tenantAdmin.createdAt,
    };
  }

  async updateTenantIpAccess(id: string, dto: UpdateTenantIpAccessInput): Promise<TenantPublic> {
    if (!isValidObjectId(id)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    // Deduplicate entries before saving
    const uniqueIps = [...new Set(dto.allowedIps.map((ip) => ip.trim()).filter(Boolean))];

    tenant.ipAccessMode = dto.ipAccessMode;
    tenant.allowedIps = uniqueIps;

    await tenant.save();
    return toTenantPublic(tenant);
  }

  /**
   * Hard-delete a tenant and all tenant-scoped documents from MongoDB.
   * Does not purge Proxmox/infra resources — DB wipe only.
   */
  async deleteTenant(id: string): Promise<{ deleted: Record<string, number> }> {
    if (!isValidObjectId(id)) {
      throw new ValidationError('Invalid tenant id format.');
    }

    const tenantObjectId = new mongoose.Types.ObjectId(id);
    const tenant = await Tenant.findById(tenantObjectId);
    if (!tenant) {
      throw new NotFoundError('Tenant not found.');
    }

    const filter = { tenantId: tenantObjectId };

    const [
      notifications,
      manualCredits,
      walletTxs,
      orders,
      dedicatedRequests,
      serviceConfigs,
      brandingAssets,
      externalVms,
      catalogVms,
      vms,
      tenantUsers,
      wallets,
    ] = await Promise.all([
      TenantNotification.deleteMany(filter),
      ManualWalletCredit.deleteMany(filter),
      WalletTransaction.deleteMany(filter),
      Order.deleteMany(filter),
      DedicatedServerRequestModel.deleteMany(filter),
      TenantServiceConfig.deleteMany(filter),
      TenantBrandingAsset.deleteMany(filter),
      ExternalVMModel.deleteMany(filter),
      CatalogVmModel.deleteMany(filter),
      // Bypass soft-delete find middleware — hard-remove all tenant VMs from DB
      VM.collection.deleteMany(filter),
      TenantUser.deleteMany(filter),
      Wallet.deleteMany(filter),
    ]);

    await tenant.deleteOne();

    const deleted: Record<string, number> = {
      tenant: 1,
      notifications: notifications.deletedCount ?? 0,
      manualCredits: manualCredits.deletedCount ?? 0,
      walletTransactions: walletTxs.deletedCount ?? 0,
      orders: orders.deletedCount ?? 0,
      dedicatedServerRequests: dedicatedRequests.deletedCount ?? 0,
      serviceConfigs: serviceConfigs.deletedCount ?? 0,
      brandingAssets: brandingAssets.deletedCount ?? 0,
      externalVms: externalVms.deletedCount ?? 0,
      catalogVms: catalogVms.deletedCount ?? 0,
      vms: vms.deletedCount ?? 0,
      tenantUsers: tenantUsers.deletedCount ?? 0,
      wallets: wallets.deletedCount ?? 0,
    };

    logger.info('[Tenant] Tenant hard-deleted with cascade', {
      tenantId: id,
      name: tenant.name,
      domain: tenant.domain,
      deleted,
    });

    return { deleted };
  }
}

export const tenantService = new TenantService();
