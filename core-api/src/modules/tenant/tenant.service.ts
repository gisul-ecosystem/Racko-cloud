import crypto from 'crypto';
import mongoose from 'mongoose';
import { Tenant, type ITenant, type TenantStatus } from '../../models/tenant.model';
import { TenantUser } from '../../models/tenantUser.model';
import { hashPassword } from '../../utils/argon2';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import type {
  CreateTenantAdminInput,
  CreateTenantInput,
  UpdateTenantInput,
} from './tenant.validation';

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
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantAdminPublic {
  id: string;
  email: string;
  role: 'tenant_admin';
  tenantId: string;
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

    const tenantAdmin = await TenantUser.create({
      tenantId: tenant._id,
      email: dto.email,
      passwordHash,
      role: 'tenant_admin',
      isActive: true,
      isEmailVerified: true,
      createdBy: null,
    });

    return {
      id: tenantAdmin._id.toString(),
      email: tenantAdmin.email,
      role: 'tenant_admin',
      tenantId: tenant._id.toString(),
      createdAt: tenantAdmin.createdAt,
    };
  }
}

export const tenantService = new TenantService();
