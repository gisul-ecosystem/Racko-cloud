import mongoose from 'mongoose';
import {
  VmCatalogPlan,
  type IVmCatalogPlan,
} from '../../models/vmCatalogPlan.model';
import type { ExternalVmPricingCategory } from '../../models/externalVmPricingConfig.model';
import { externalVmPricingService } from '../externalVmPricing/externalVmPricing.service';
import { NotFoundError } from '../../utils/errors';
import type {
  CreateVmCatalogPlanInput,
  UpdateVmCatalogPlanInput,
} from './vmCatalogPlan.validation';

const BILLING_PERIODS = ['hourly', 'monthly', 'quarterly', 'yearly'] as const;
type BillingPeriod = (typeof BILLING_PERIODS)[number];
const CATEGORIES: ExternalVmPricingCategory[] = ['linux', 'windows', 'gpu'];

export type VmCatalogPeriodPrices = Record<BillingPeriod, number | null>;

export interface VmCatalogPlanPublic {
  _id: string;
  sno?: number;
  name: string;
  /** Real Webyne/provider name when `name` was remapped for admin/tenant display. */
  providerName?: string;
  vcpu: number;
  ramGb: number;
  ssdGb: number;
  hourly: number | null;
  monthly: number | null;
  quarterly: number | null;
  yearly: number | null;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Admin listings only — sell prices per OS category (multiplier applied server-side). */
  sellPricesByCategory?: Record<ExternalVmPricingCategory, VmCatalogPeriodPrices>;
  /** Present on admin/tenant plan lists — whether hourly billing is offered. */
  hourlyEnabled?: boolean;
}

/** Customer-facing label for admin/tenant UIs (super-admin keeps provider `name`). */
export function customerDisplayName(
  sno?: number | null,
  fallbackIndex?: number
): string {
  const n =
    sno != null && Number.isFinite(Number(sno))
      ? Number(sno)
      : fallbackIndex != null && Number.isFinite(fallbackIndex)
        ? fallbackIndex + 1
        : 1;
  return `Cloud VPS - ${n}`;
}

/** Seed rows from the Webyne template sheet (admin-managed; not live scrape). */
export const DEFAULT_WEBYNE_CATALOG_PLANS: Omit<
  CreateVmCatalogPlanInput,
  'currency' | 'isActive' | 'sortOrder' | 'sno'
>[] = [
  { name: 'PG LARGE', vcpu: 4, ramGb: 8, ssdGb: 250, hourly: 0.3, monthly: 999, yearly: 5500 },
  { name: 'labsgisul4CORE16GB200GB', vcpu: 4, ramGb: 16, ssdGb: 200, monthly: 500, quarterly: 900, yearly: 4000 },
  { name: 'Gold Cloud 2', vcpu: 8, ramGb: 16, ssdGb: 500, hourly: 4, monthly: 1499, yearly: 11000 },
  { name: 'GISUL8VCORE16GBRAM300GBDISK', vcpu: 8, ramGb: 16, ssdGb: 300, monthly: 799, quarterly: 2200 },
  { name: 'GISUL 8VCPU 32GB RAM 500GB', vcpu: 8, ramGb: 32, ssdGb: 500, monthly: 999 },
  { name: 'GoldGsuilwindows8core64GBRAM500GBDISK', vcpu: 8, ramGb: 64, ssdGb: 500, monthly: 2799 },
  { name: 'Gold Cloud 5', vcpu: 10, ramGb: 20, ssdGb: 2000, hourly: 2.77, monthly: 3999, yearly: 47988 },
  { name: 'Package 4-10 CORE 20 GB RAM 500 GB DISK', vcpu: 10, ramGb: 20, ssdGb: 500, monthly: 1499 },
  { name: 'Gold Cloud 6', vcpu: 12, ramGb: 32, ssdGb: 4000, hourly: 8.33, monthly: 5999, yearly: 71988 },
  { name: 'Gold Cloud 3', vcpu: 16, ramGb: 32, ssdGb: 1024, hourly: 6, monthly: 2999, yearly: 21999 },
  { name: 'Gold Cloud 7', vcpu: 16, ramGb: 64, ssdGb: 6000, hourly: 11.1, monthly: 7999, yearly: 95988 },
];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function applySellMultiplier(
  base: number | null | undefined,
  multiplier: number
): number | null {
  if (base == null || !Number.isFinite(Number(base))) return null;
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return roundMoney(Number(base) * m);
}

function sellPricesForPlan(
  plan: VmCatalogPlanPublic,
  multiplier: number,
  hourlyEnabled: boolean
): VmCatalogPeriodPrices {
  return {
    hourly: hourlyEnabled ? applySellMultiplier(plan.hourly, multiplier) : null,
    monthly: applySellMultiplier(plan.monthly, multiplier),
    quarterly: applySellMultiplier(plan.quarterly, multiplier),
    yearly: applySellMultiplier(plan.yearly, multiplier),
  };
}

function toPublic(doc: IVmCatalogPlan): VmCatalogPlanPublic {
  return {
    _id: doc._id.toString(),
    ...(doc.sno != null ? { sno: doc.sno } : {}),
    name: doc.name,
    vcpu: doc.vcpu,
    ramGb: doc.ramGb,
    ssdGb: doc.ssdGb,
    hourly: doc.hourly ?? null,
    monthly: doc.monthly ?? null,
    quarterly: doc.quarterly ?? null,
    yearly: doc.yearly ?? null,
    currency: doc.currency || 'INR',
    isActive: doc.isActive,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

class VmCatalogPlanService {
  async list(opts?: {
    activeOnly?: boolean;
    applySellPrice?: boolean;
    /** When true, `name` becomes Cloud VPS - {sno}; real name is in `providerName`. */
    forCustomer?: boolean;
  }): Promise<VmCatalogPlanPublic[]> {
    const filter = opts?.activeOnly ? { isActive: true } : {};
    const docs = await VmCatalogPlan.find(filter).sort({ sortOrder: 1, createdAt: 1 });
    let plans = docs.map(toPublic);

    if (opts?.forCustomer) {
      plans = plans.map((plan, i) => ({
        ...plan,
        providerName: plan.name,
        name: customerDisplayName(plan.sno, i),
      }));
    }

    if (!opts?.applySellPrice) return plans;

    const pricingCfg = await externalVmPricingService.getByProvider('webyne');
    const hourlyEnabled = Boolean(pricingCfg.hourlyEnabled);
    return plans.map((plan) => {
      const sellPricesByCategory = {} as Record<
        ExternalVmPricingCategory,
        VmCatalogPeriodPrices
      >;
      for (const category of CATEGORIES) {
        const multiplierRaw = Number(pricingCfg.categories[category]?.multiplier);
        const multiplier =
          Number.isFinite(multiplierRaw) && multiplierRaw > 0 ? multiplierRaw : 1;
        sellPricesByCategory[category] = sellPricesForPlan(
          plan,
          multiplier,
          hourlyEnabled
        );
      }
      const display = sellPricesByCategory.linux;
      return {
        ...plan,
        hourly: display.hourly,
        monthly: display.monthly,
        quarterly: display.quarterly,
        yearly: display.yearly,
        sellPricesByCategory,
        hourlyEnabled,
      };
    });
  }

  async create(
    input: CreateVmCatalogPlanInput,
    createdBy?: mongoose.Types.ObjectId
  ): Promise<VmCatalogPlanPublic> {
    const doc = await VmCatalogPlan.create({
      ...input,
      hourly: input.hourly ?? null,
      monthly: input.monthly ?? null,
      quarterly: input.quarterly ?? null,
      yearly: input.yearly ?? null,
      currency: input.currency || 'INR',
      ...(createdBy ? { createdBy } : {}),
    });
    return toPublic(doc);
  }

  async update(id: string, input: UpdateVmCatalogPlanInput): Promise<VmCatalogPlanPublic> {
    const doc = await VmCatalogPlan.findById(id);
    if (!doc) throw new NotFoundError('Catalog plan not found.');

    if (input.sno !== undefined) doc.sno = input.sno;
    if (input.name !== undefined) doc.name = input.name;
    if (input.vcpu !== undefined) doc.vcpu = input.vcpu;
    if (input.ramGb !== undefined) doc.ramGb = input.ramGb;
    if (input.ssdGb !== undefined) doc.ssdGb = input.ssdGb;
    if (input.hourly !== undefined) doc.hourly = input.hourly;
    if (input.monthly !== undefined) doc.monthly = input.monthly;
    if (input.quarterly !== undefined) doc.quarterly = input.quarterly;
    if (input.yearly !== undefined) doc.yearly = input.yearly;
    if (input.currency !== undefined) doc.currency = input.currency;
    if (input.isActive !== undefined) doc.isActive = input.isActive;
    if (input.sortOrder !== undefined) doc.sortOrder = input.sortOrder;

    await doc.save();
    return toPublic(doc);
  }

  async remove(id: string): Promise<void> {
    const result = await VmCatalogPlan.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new NotFoundError('Catalog plan not found.');
  }

  /** Idempotent seed: only inserts when collection is empty. */
  async seedDefaultsIfEmpty(
    createdBy?: mongoose.Types.ObjectId
  ): Promise<{ inserted: number; total: number }> {
    const total = await VmCatalogPlan.countDocuments();
    if (total > 0) return { inserted: 0, total };

    const docs = DEFAULT_WEBYNE_CATALOG_PLANS.map((p, i) => ({
      ...p,
      sno: i + 1,
      hourly: p.hourly ?? null,
      monthly: p.monthly ?? null,
      quarterly: p.quarterly ?? null,
      yearly: p.yearly ?? null,
      currency: 'INR',
      isActive: true,
      sortOrder: i,
      ...(createdBy ? { createdBy } : {}),
    }));
    await VmCatalogPlan.insertMany(docs);
    return { inserted: docs.length, total: docs.length };
  }
}

export const vmCatalogPlanService = new VmCatalogPlanService();
