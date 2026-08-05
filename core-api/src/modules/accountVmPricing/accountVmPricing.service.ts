import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { Tenant } from '../../models/tenant.model';
import {
  AccountVmPricingOverride,
  type AccountVmPricingCategory,
  type AccountVmPricingPeriod,
  type AccountVmPricingProvider,
  type AccountVmPricingScopeType,
  type DedicatedPlanAbsoluteOverride,
  type IAccountVmPricingOverride,
  type PlanPeriodAbsoluteOverrides,
} from '../../models/accountVmPricingOverride.model';
import { externalVmPricingService } from '../externalVmPricing/externalVmPricing.service';
import { DedicatedServerSettingsModel } from '../../models/dedicatedServerSettings.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { resolvePlatformOrgOwnerId } from '../platformRbac/platformRbac.service';

export type AccountPricingContext =
  | { scopeType: 'organization'; orgId: string }
  | { scopeType: 'tenant'; tenantId: string };

export interface AccountVmPricingOverridePublic {
  _id: string;
  provider: AccountVmPricingProvider;
  scopeType: AccountVmPricingScopeType;
  orgId: string | null;
  tenantId: string | null;
  accountLabel: string | null;
  hourlyEnabled: boolean | null;
  categories: {
    linux?: { multiplier: number | null };
    windows?: { multiplier: number | null };
    gpu?: { multiplier: number | null };
    default?: { multiplier: number | null };
  };
  planOverrides: Record<string, PlanPeriodAbsoluteOverrides>;
  dedicatedPlanOverrides: Record<string, DedicatedPlanAbsoluteOverride>;
  notes: string | null;
  updatedAt: string;
}

export interface UpsertAccountVmPricingInput {
  hourlyEnabled?: boolean | null;
  categories?: {
    linux?: { multiplier?: number | null };
    windows?: { multiplier?: number | null };
    gpu?: { multiplier?: number | null };
    default?: { multiplier?: number | null };
  };
  planOverrides?: Record<string, PlanPeriodAbsoluteOverrides>;
  dedicatedPlanOverrides?: Record<string, DedicatedPlanAbsoluteOverride>;
  notes?: string | null;
}

export type PricingSource = 'global' | 'account_multiplier' | 'account_absolute';

export interface ResolvedPeriodPrice {
  unitPrice: number;
  effectiveMultiplier: number | null;
  source: PricingSource;
  hourlyEnabled: boolean;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapToObject<T>(value: unknown): Record<string, T> {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries()) as Record<string, T>;
  }
  if (typeof value === 'object') {
    return { ...(value as Record<string, T>) };
  }
  return {};
}

function cleanMultiplier(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function accountLabelFor(
  scopeType: AccountVmPricingScopeType,
  orgId?: string | null,
  tenantId?: string | null
): Promise<string | null> {
  if (scopeType === 'organization' && orgId) {
    const user = await User.findById(orgId).select('email').lean();
    return user?.email ?? orgId;
  }
  if (scopeType === 'tenant' && tenantId) {
    const tenant = await Tenant.findById(tenantId).select('name slug domain').lean();
    if (!tenant) return tenantId;
    return tenant.name || tenant.slug || tenant.domain || tenantId;
  }
  return null;
}

function toPublic(
  doc: Record<string, unknown>,
  label: string | null
): AccountVmPricingOverridePublic {
  const categories = (doc.categories || {}) as IAccountVmPricingOverride['categories'];
  return {
    _id: String(doc._id),
    provider: doc.provider as AccountVmPricingProvider,
    scopeType: doc.scopeType as AccountVmPricingScopeType,
    orgId: doc.orgId ? String(doc.orgId) : null,
    tenantId: doc.tenantId ? String(doc.tenantId) : null,
    accountLabel: label,
    hourlyEnabled: (doc.hourlyEnabled as boolean | null | undefined) ?? null,
    categories: {
      ...(categories.linux
        ? { linux: { multiplier: cleanMultiplier(categories.linux.multiplier) } }
        : {}),
      ...(categories.windows
        ? { windows: { multiplier: cleanMultiplier(categories.windows.multiplier) } }
        : {}),
      ...(categories.gpu
        ? { gpu: { multiplier: cleanMultiplier(categories.gpu.multiplier) } }
        : {}),
      ...(categories.default
        ? { default: { multiplier: cleanMultiplier(categories.default.multiplier) } }
        : {}),
    },
    planOverrides: mapToObject<PlanPeriodAbsoluteOverrides>(doc.planOverrides),
    dedicatedPlanOverrides: mapToObject<DedicatedPlanAbsoluteOverride>(
      doc.dedicatedPlanOverrides
    ),
    notes: (doc.notes as string | null | undefined) ?? null,
    updatedAt: (
      doc.updatedAt instanceof Date ? doc.updatedAt : new Date(String(doc.updatedAt || Date.now()))
    ).toISOString(),
  };
}

function filterForAccount(
  provider: AccountVmPricingProvider,
  ctx: AccountPricingContext
): Record<string, unknown> {
  if (ctx.scopeType === 'organization') {
    return {
      provider,
      scopeType: 'organization',
      orgId: new mongoose.Types.ObjectId(ctx.orgId),
    };
  }
  return {
    provider,
    scopeType: 'tenant',
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
  };
}

class AccountVmPricingService {
  /** Resolve org owner id for a platform admin user (operators inherit owner pricing). */
  resolveOrgIdFromUser(user: {
    _id?: mongoose.Types.ObjectId | string;
    id?: string;
    role?: string;
    orgOwnerId?: mongoose.Types.ObjectId | string | null;
  }): string | null {
    return resolvePlatformOrgOwnerId(user);
  }

  async getOverride(
    provider: AccountVmPricingProvider,
    ctx: AccountPricingContext
  ): Promise<AccountVmPricingOverridePublic | null> {
    const doc = await AccountVmPricingOverride.findOne(filterForAccount(provider, ctx)).lean();
    if (!doc) return null;
    const label = await accountLabelFor(
      ctx.scopeType,
      ctx.scopeType === 'organization' ? ctx.orgId : null,
      ctx.scopeType === 'tenant' ? ctx.tenantId : null
    );
    return toPublic(doc as unknown as Record<string, unknown>, label);
  }

  async listOverrides(
    provider: AccountVmPricingProvider
  ): Promise<AccountVmPricingOverridePublic[]> {
    const docs = await AccountVmPricingOverride.find({ provider })
      .sort({ updatedAt: -1 })
      .lean();
    return Promise.all(
      docs.map(async (doc) => {
        const label = await accountLabelFor(
          doc.scopeType,
          doc.orgId ? String(doc.orgId) : null,
          doc.tenantId ? String(doc.tenantId) : null
        );
        return toPublic(doc as unknown as Record<string, unknown>, label);
      })
    );
  }

  async upsertOverride(
    provider: AccountVmPricingProvider,
    ctx: AccountPricingContext,
    input: UpsertAccountVmPricingInput,
    updatedBy: string
  ): Promise<AccountVmPricingOverridePublic> {
    if (ctx.scopeType === 'organization') {
      if (!mongoose.isValidObjectId(ctx.orgId)) {
        throw new ValidationError('Invalid organization id.');
      }
      const org = await User.findOne({
        _id: ctx.orgId,
        role: 'admin',
      })
        .select('_id')
        .lean();
      if (!org) throw new NotFoundError('Organization account not found.');
    } else {
      if (!mongoose.isValidObjectId(ctx.tenantId)) {
        throw new ValidationError('Invalid tenant id.');
      }
      const tenant = await Tenant.findById(ctx.tenantId).select('_id').lean();
      if (!tenant) throw new NotFoundError('Tenant not found.');
    }

    const $set: Record<string, unknown> = {
      updatedBy: new mongoose.Types.ObjectId(updatedBy),
    };

    if (input.hourlyEnabled !== undefined) $set.hourlyEnabled = input.hourlyEnabled;
    if (input.notes !== undefined) $set.notes = input.notes;
    if (input.categories !== undefined) {
      $set.categories = {
        linux: input.categories.linux
          ? { multiplier: cleanMultiplier(input.categories.linux.multiplier) }
          : undefined,
        windows: input.categories.windows
          ? { multiplier: cleanMultiplier(input.categories.windows.multiplier) }
          : undefined,
        gpu: input.categories.gpu
          ? { multiplier: cleanMultiplier(input.categories.gpu.multiplier) }
          : undefined,
        default: input.categories.default
          ? { multiplier: cleanMultiplier(input.categories.default.multiplier) }
          : undefined,
      };
    }
    if (input.planOverrides !== undefined) {
      $set.planOverrides = input.planOverrides;
    }
    if (input.dedicatedPlanOverrides !== undefined) {
      $set.dedicatedPlanOverrides = input.dedicatedPlanOverrides;
    }

    const filter = filterForAccount(provider, ctx);
    const doc = await AccountVmPricingOverride.findOneAndUpdate(
      filter,
      {
        $set,
        $setOnInsert: {
          provider,
          scopeType: ctx.scopeType,
          ...(ctx.scopeType === 'organization'
            ? { orgId: new mongoose.Types.ObjectId(ctx.orgId), tenantId: null }
            : { tenantId: new mongoose.Types.ObjectId(ctx.tenantId), orgId: null }),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    const label = await accountLabelFor(
      ctx.scopeType,
      ctx.scopeType === 'organization' ? ctx.orgId : null,
      ctx.scopeType === 'tenant' ? ctx.tenantId : null
    );
    return toPublic(doc as unknown as Record<string, unknown>, label);
  }

  async deleteOverride(
    provider: AccountVmPricingProvider,
    ctx: AccountPricingContext
  ): Promise<void> {
    await AccountVmPricingOverride.deleteOne(filterForAccount(provider, ctx));
  }

  async searchAccounts(input: {
    scopeType: AccountVmPricingScopeType;
    q?: string;
    limit?: number;
  }): Promise<Array<{ id: string; label: string; secondary?: string }>> {
    const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
    const q = (input.q || '').trim();

    if (input.scopeType === 'organization') {
      const filter: Record<string, unknown> = {
        role: 'admin',
        $or: [{ orgOwnerId: null }, { orgOwnerId: { $exists: false } }],
      };
      if (q) {
        filter.email = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      }
      const users = await User.find(filter)
        .select('email accountType')
        .sort({ email: 1 })
        .limit(limit)
        .lean();
      return users.map((u) => ({
        id: String(u._id),
        label: u.email,
        secondary: u.accountType || 'organization',
      }));
    }

    const filter: Record<string, unknown> = {};
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      filter.$or = [{ name: rx }, { slug: rx }, { domain: rx }];
    }
    const tenants = await Tenant.find(filter)
      .select('name slug domain status')
      .sort({ name: 1 })
      .limit(limit)
      .lean();
    return tenants.map((t) => ({
      id: String(t._id),
      label: t.name || t.slug || t.domain || String(t._id),
      secondary: t.domain || t.slug || t.status,
    }));
  }

  /**
   * Resolve Webyne sell unit price for one plan/period/category.
   * Absolute plan override wins; else account category multiplier; else global.
   */
  async resolveWebyneUnitPrice(input: {
    account?: AccountPricingContext | null;
    category: AccountVmPricingCategory;
    planId: string;
    period: AccountVmPricingPeriod;
    baseUnit: number;
  }): Promise<ResolvedPeriodPrice> {
    const globalCfg = await externalVmPricingService.getByProvider('webyne');
    const globalMultRaw = Number(globalCfg.categories[input.category]?.multiplier);
    const globalMult =
      Number.isFinite(globalMultRaw) && globalMultRaw > 0 ? globalMultRaw : 1;

    let override: AccountVmPricingOverridePublic | null = null;
    if (input.account) {
      override = await this.getOverride('webyne', input.account);
    }

    const hourlyEnabled =
      override?.hourlyEnabled != null
        ? Boolean(override.hourlyEnabled)
        : Boolean(globalCfg.hourlyEnabled);

    if (input.period === 'hourly' && !hourlyEnabled) {
      throw new ValidationError('Hourly billing is not available.');
    }

    const absolute = override?.planOverrides?.[input.planId]?.[input.period];
    if (absolute != null && Number.isFinite(Number(absolute)) && Number(absolute) >= 0) {
      return {
        unitPrice: roundMoney(Number(absolute)),
        effectiveMultiplier: null,
        source: 'account_absolute',
        hourlyEnabled,
      };
    }

    const accountMult = cleanMultiplier(override?.categories?.[input.category]?.multiplier);
    const effectiveMultiplier = accountMult ?? globalMult;
    return {
      unitPrice: roundMoney(Number(input.baseUnit) * effectiveMultiplier),
      effectiveMultiplier,
      source: accountMult != null ? 'account_multiplier' : 'global',
      hourlyEnabled,
    };
  }

  /** Effective Webyne multipliers + hourly flag for plan list display. */
  async resolveWebyneDisplayConfig(account?: AccountPricingContext | null): Promise<{
    hourlyEnabled: boolean;
    multipliers: Record<AccountVmPricingCategory, number>;
    planOverrides: Record<string, PlanPeriodAbsoluteOverrides>;
  }> {
    const globalCfg = await externalVmPricingService.getByProvider('webyne');
    const override = account ? await this.getOverride('webyne', account) : null;
    const categories: AccountVmPricingCategory[] = ['linux', 'windows', 'gpu'];
    const multipliers = {} as Record<AccountVmPricingCategory, number>;
    for (const cat of categories) {
      const globalMultRaw = Number(globalCfg.categories[cat]?.multiplier);
      const globalMult =
        Number.isFinite(globalMultRaw) && globalMultRaw > 0 ? globalMultRaw : 1;
      multipliers[cat] =
        cleanMultiplier(override?.categories?.[cat]?.multiplier) ?? globalMult;
    }
    return {
      hourlyEnabled:
        override?.hourlyEnabled != null
          ? Boolean(override.hourlyEnabled)
          : Boolean(globalCfg.hourlyEnabled),
      multipliers,
      planOverrides: override?.planOverrides ?? {},
    };
  }

  async resolveDedicatedSell(input: {
    account?: AccountPricingContext | null;
    planId: string;
    baseMonthly: number;
    baseSetup: number;
  }): Promise<{
    monthly: number;
    setup: number;
    effectiveMultiplier: number | null;
    source: PricingSource;
  }> {
    const settings = await DedicatedServerSettingsModel.findOne().sort({ updatedAt: -1 }).lean();
    const globalMult =
      settings?.sellMultiplier && settings.sellMultiplier > 0 ? settings.sellMultiplier : 1;

    const override = input.account
      ? await this.getOverride('dedicated', input.account)
      : null;

    const abs = override?.dedicatedPlanOverrides?.[input.planId];
    const hasAbsMonthly =
      abs?.monthlyPrice != null && Number.isFinite(Number(abs.monthlyPrice));
    const hasAbsSetup = abs?.setupFee != null && Number.isFinite(Number(abs.setupFee));

    if (hasAbsMonthly || hasAbsSetup) {
      return {
        monthly: hasAbsMonthly
          ? roundMoney(Number(abs!.monthlyPrice))
          : roundMoney(input.baseMonthly * globalMult),
        setup: hasAbsSetup
          ? roundMoney(Number(abs!.setupFee))
          : input.baseSetup > 0
            ? roundMoney(input.baseSetup * globalMult)
            : 0,
        effectiveMultiplier: null,
        source: 'account_absolute',
      };
    }

    const accountMult = cleanMultiplier(override?.categories?.default?.multiplier);
    const effectiveMultiplier = accountMult ?? globalMult;
    return {
      monthly: roundMoney(input.baseMonthly * effectiveMultiplier),
      setup:
        input.baseSetup > 0 ? roundMoney(input.baseSetup * effectiveMultiplier) : 0,
      effectiveMultiplier,
      source: accountMult != null ? 'account_multiplier' : 'global',
    };
  }

  async resolveDedicatedMultiplier(
    account?: AccountPricingContext | null
  ): Promise<{ multiplier: number; planOverrides: Record<string, DedicatedPlanAbsoluteOverride> }> {
    const settings = await DedicatedServerSettingsModel.findOne().sort({ updatedAt: -1 }).lean();
    const globalMult =
      settings?.sellMultiplier && settings.sellMultiplier > 0 ? settings.sellMultiplier : 1;
    const override = account ? await this.getOverride('dedicated', account) : null;
    return {
      multiplier: cleanMultiplier(override?.categories?.default?.multiplier) ?? globalMult,
      planOverrides: override?.dedicatedPlanOverrides ?? {},
    };
  }
}

export const accountVmPricingService = new AccountVmPricingService();
