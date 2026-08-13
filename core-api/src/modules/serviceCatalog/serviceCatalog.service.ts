import {
  ServiceCatalogModel,
  type IServiceCatalog,
  type ServiceCatalogKind,
  type ServiceCatalogScope,
  type ServiceCatalogStatus,
} from '../../models/serviceCatalog.model';
import { SERVICE_CATALOG_SEED } from '../../constants/serviceCatalogSeed';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface ServiceCatalogPublic {
  key: string;
  label: string;
  description: string;
  kind: ServiceCatalogKind;
  scopes: ServiceCatalogScope[];
  status: ServiceCatalogStatus;
  sortOrder: number;
  defaultLimits: Record<string, unknown>;
  defaultPricing: Record<string, unknown>;
}

export interface ListCatalogFilters {
  kind?: ServiceCatalogKind;
  scope?: ServiceCatalogScope;
  status?: ServiceCatalogStatus | ServiceCatalogStatus[];
  /** When true (default for assign UIs), only active. Pass false to include all statuses. */
  activeOnly?: boolean;
}

function toPublic(doc: IServiceCatalog): ServiceCatalogPublic {
  return {
    key: doc.key,
    label: doc.label,
    description: doc.description ?? '',
    kind: doc.kind,
    scopes: [...doc.scopes],
    status: doc.status,
    sortOrder: doc.sortOrder,
    defaultLimits: (doc.defaultLimits ?? {}) as Record<string, unknown>,
    defaultPricing: (doc.defaultPricing ?? {}) as Record<string, unknown>,
  };
}

class ServiceCatalogService {
  private seedPromise: Promise<void> | null = null;

  /** Idempotent upsert of seed rows. Safe to call on every boot. */
  async ensureSeeded(): Promise<void> {
    if (!this.seedPromise) {
      this.seedPromise = this.runSeed().finally(() => {
        this.seedPromise = null;
      });
    }
    await this.seedPromise;
  }

  private async runSeed(): Promise<void> {
    let upserted = 0;
    for (const row of SERVICE_CATALOG_SEED) {
      const result = await ServiceCatalogModel.updateOne(
        { key: row.key },
        {
          $setOnInsert: {
            key: row.key,
            label: row.label,
            description: row.description,
            kind: row.kind,
            scopes: [...row.scopes],
            status: row.status,
            sortOrder: row.sortOrder,
            defaultLimits: {},
            defaultPricing: {},
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount) upserted += 1;
    }
    logger.info('[ServiceCatalog] Seed complete', {
      seedRows: SERVICE_CATALOG_SEED.length,
      upserted,
    });
  }

  async list(filters: ListCatalogFilters = {}): Promise<ServiceCatalogPublic[]> {
    await this.ensureSeeded();

    const query: Record<string, unknown> = {};
    if (filters.kind) query['kind'] = filters.kind;
    if (filters.scope) query['scopes'] = filters.scope;

    if (filters.status) {
      query['status'] = Array.isArray(filters.status)
        ? { $in: filters.status }
        : filters.status;
    } else if (filters.activeOnly !== false) {
      query['status'] = 'active';
    }

    const docs = await ServiceCatalogModel.find(query).sort({ sortOrder: 1, key: 1 });
    return docs.map(toPublic);
  }

  async getByKey(key: string): Promise<ServiceCatalogPublic | null> {
    await this.ensureSeeded();
    const doc = await ServiceCatalogModel.findOne({ key });
    return doc ? toPublic(doc) : null;
  }

  async getLabelMap(keys?: string[]): Promise<Record<string, string>> {
    await this.ensureSeeded();
    const query: Record<string, unknown> = {};
    if (keys && keys.length > 0) query['key'] = { $in: keys };
    const docs = await ServiceCatalogModel.find(query).select('key label');
    const map: Record<string, string> = {};
    for (const doc of docs) {
      map[doc.key] = doc.label;
    }
    return map;
  }

  /**
   * Assignable product service: exists, active, product kind, and allowed for scope.
   */
  async assertAssignable(
    key: string,
    scope: ServiceCatalogScope
  ): Promise<ServiceCatalogPublic> {
    await this.ensureSeeded();
    const doc = await ServiceCatalogModel.findOne({ key });
    if (!doc) {
      throw new ValidationError(`Unknown service "${key}".`);
    }
    if (doc.kind !== 'product') {
      throw new ValidationError(
        `Service "${key}" is a utility and cannot be assigned as a product entitlement.`
      );
    }
    if (doc.status !== 'active') {
      throw new ValidationError(`Service "${key}" is not active in the catalog.`);
    }
    if (!doc.scopes.includes(scope)) {
      throw new ValidationError(`Service "${key}" is not available for ${scope} scope.`);
    }
    return toPublic(doc);
  }

  async isAssignableProduct(key: string, scope: ServiceCatalogScope): Promise<boolean> {
    try {
      await this.assertAssignable(key, scope);
      return true;
    } catch {
      return false;
    }
  }

  async listAssignableKeys(scope: ServiceCatalogScope): Promise<string[]> {
    const rows = await this.list({ kind: 'product', scope, activeOnly: true });
    return rows.map((r) => r.key);
  }

  async patch(
    key: string,
    input: {
      label?: string;
      description?: string;
      status?: ServiceCatalogStatus;
      sortOrder?: number;
    }
  ): Promise<ServiceCatalogPublic> {
    await this.ensureSeeded();
    const doc = await ServiceCatalogModel.findOne({ key });
    if (!doc) {
      throw new NotFoundError(`Service catalog entry "${key}" not found.`);
    }

    if (input.label !== undefined) doc.label = input.label;
    if (input.description !== undefined) doc.description = input.description;
    if (input.status !== undefined) doc.status = input.status;
    if (input.sortOrder !== undefined) doc.sortOrder = input.sortOrder;

    await doc.save();
    return toPublic(doc);
  }
}

export const serviceCatalogService = new ServiceCatalogService();
