import mongoose from 'mongoose';
import {
  ExternalVmPricingConfig,
  type CategoryPricingOverride,
  type ExternalVmPricingCategory,
  type ExternalVmPricingProvider,
  type PlanPeriodOverrides,
} from '../../models/externalVmPricingConfig.model';

export interface ExternalVmPricingPublic {
  provider: ExternalVmPricingProvider;
  updatedAt: string | null;
  updatedBy: string | null;
  categories: Record<ExternalVmPricingCategory, CategoryPricingOverride>;
}

const CATEGORIES: ExternalVmPricingCategory[] = ['linux', 'windows', 'gpu'];

function emptyCategory(): CategoryPricingOverride {
  return { multiplier: 1, plans: {} };
}

function mapToPlansRecord(
  value: Map<string, PlanPeriodOverrides> | Record<string, PlanPeriodOverrides> | undefined
): Record<string, PlanPeriodOverrides> {
  if (!value) return {};
  if (value instanceof Map) {
    const out: Record<string, PlanPeriodOverrides> = {};
    for (const [k, v] of value.entries()) {
      out[String(k)] = sanitizePlanRow(v);
    }
    return out;
  }
  const out: Record<string, PlanPeriodOverrides> = {};
  for (const [k, v] of Object.entries(value)) {
    out[String(k)] = sanitizePlanRow(v);
  }
  return out;
}

function sanitizePlanRow(row: PlanPeriodOverrides | undefined): PlanPeriodOverrides {
  if (!row || typeof row !== 'object') return {};
  const out: PlanPeriodOverrides = {};
  for (const period of ['hourly', 'monthly', 'quarterly', 'yearly'] as const) {
    const raw = row[period];
    if (raw == null) continue;
    const text = String(raw).trim();
    if (!text) continue;
    out[period] = text;
  }
  return out;
}

function normalizeCategory(input: CategoryPricingOverride | undefined): CategoryPricingOverride {
  const multiplier = Number(input?.multiplier);
  return {
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
    plans: mapToPlansRecord(input?.plans as CategoryPricingOverride['plans']),
  };
}

function toPublic(doc: {
  provider: ExternalVmPricingProvider;
  categories?: {
    linux?: CategoryPricingOverride;
    windows?: CategoryPricingOverride;
    gpu?: CategoryPricingOverride;
  };
  updatedBy?: mongoose.Types.ObjectId | null;
  updatedAt?: Date;
}): ExternalVmPricingPublic {
  return {
    provider: doc.provider,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    categories: {
      linux: normalizeCategory(doc.categories?.linux),
      windows: normalizeCategory(doc.categories?.windows),
      gpu: normalizeCategory(doc.categories?.gpu),
    },
  };
}

export class ExternalVmPricingService {
  async getByProvider(provider: ExternalVmPricingProvider): Promise<ExternalVmPricingPublic> {
    const doc = await ExternalVmPricingConfig.findOne({ provider }).lean();
    if (!doc) {
      return {
        provider,
        updatedAt: null,
        updatedBy: null,
        categories: {
          linux: emptyCategory(),
          windows: emptyCategory(),
          gpu: emptyCategory(),
        },
      };
    }
    return toPublic(doc);
  }

  async saveByProvider(
    provider: ExternalVmPricingProvider,
    categories: Record<ExternalVmPricingCategory, CategoryPricingOverride>,
    updatedBy: string
  ): Promise<ExternalVmPricingPublic> {
    const normalized = {
      linux: normalizeCategory(categories.linux),
      windows: normalizeCategory(categories.windows),
      gpu: normalizeCategory(categories.gpu),
    };

    // Persist plans as Map for Mongo
    const categoriesForDb: Record<string, { multiplier: number; plans: Map<string, PlanPeriodOverrides> }> =
      {};
    for (const cat of CATEGORIES) {
      categoriesForDb[cat] = {
        multiplier: normalized[cat].multiplier,
        plans: new Map(Object.entries(normalized[cat].plans)),
      };
    }

    const doc = await ExternalVmPricingConfig.findOneAndUpdate(
      { provider },
      {
        $set: {
          categories: categoriesForDb,
          updatedBy: new mongoose.Types.ObjectId(updatedBy),
        },
        $setOnInsert: { provider },
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    return toPublic(doc!);
  }
}

export const externalVmPricingService = new ExternalVmPricingService();
