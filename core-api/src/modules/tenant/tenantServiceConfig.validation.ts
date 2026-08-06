import { z } from 'zod';
import { SERVICE_CATALOG } from '../../constants/serviceCatalog';
import { tenantIdRouteParamSchema } from './tenant.validation';

export const serviceKeyParamSchema = z.enum(SERVICE_CATALOG);

const templateItemPricingSchema = z.object({
  cpuRatePerCoreMonthly: z.number().int().nonnegative().default(0),
  ramRatePerGbMonthly: z.number().int().nonnegative().default(0),
  diskRatePerGbMonthly: z.number().int().nonnegative().default(0),
  billingDiscounts: z
    .object({
      quarterly: z.number().min(0).max(1).default(0),
      yearly: z.number().min(0).max(1).default(0),
    })
    .optional()
    .default({ quarterly: 0, yearly: 0 }),
});

export const vmManagementPricingSchema = z.object({
  cpuRatePerCoreMonthly: z.number().int().nonnegative().optional().default(0),
  ramRatePerGbMonthly: z.number().int().nonnegative().optional().default(0),
  diskRatePerGbMonthly: z.number().int().nonnegative().optional().default(0),
  billingDiscounts: z
    .object({
      quarterly: z.number().min(0).max(1).default(0),
      yearly: z.number().min(0).max(1).default(0),
    })
    .optional()
    .default({ quarterly: 0, yearly: 0 }),
  fixedPlans: z
    .array(
      z.object({
        name: z.string().min(1),
        cpuCores: z.number().int().positive(),
        memoryGb: z.number().positive(),
        diskGb: z.number().int().positive(),
        priceMonthly: z.number().nonnegative(),
      })
    )
    .optional()
    .default([]),
  /** Per-template pricing map: keys are templateId as string */
  templatePricing: z.record(z.string(), templateItemPricingSchema).optional().default({}),
});

const vmManagementLimitsSchema = z.object({
  maxVms: z.number().int().positive(),
  maxTotalVcpu: z.number().int().positive(),
  maxTotalRamGb: z.number().positive(),
  maxTotalDiskGb: z.number().positive(),
  allowedTemplateIds: z.array(z.number().int().positive()).optional().default([]),
});

const genericLimitsSchema = z.object({}).passthrough();
const genericPricingSchema = z.object({}).passthrough();

function genericServiceCreateSchema<K extends Exclude<(typeof SERVICE_CATALOG)[number], 'vm-management'>>(
  serviceKey: K
) {
  return z.object({
    serviceKey: z.literal(serviceKey),
    limits: genericLimitsSchema,
    pricing: genericPricingSchema,
  });
}

export const serviceConfigCreateSchema = z.discriminatedUnion('serviceKey', [
  z.object({
    serviceKey: z.literal('vm-management'),
    limits: vmManagementLimitsSchema,
    pricing: vmManagementPricingSchema,
  }),
  genericServiceCreateSchema('create-vm'),
  genericServiceCreateSchema('dedicated-server'),
  genericServiceCreateSchema('elastic-servers'),
  genericServiceCreateSchema('azure'),
  genericServiceCreateSchema('aws'),
  genericServiceCreateSchema('gcp'),
  genericServiceCreateSchema('cloud-labs'),
  genericServiceCreateSchema('docs'),
  genericServiceCreateSchema('machine-manager'),
]);

export const serviceConfigUpdateSchema = z
  .object({
    limits: z.record(z.any()).optional(),
    pricing: z.record(z.any()).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const assignServiceRequestSchema = z.object({
  params: tenantIdRouteParamSchema.shape.params,
  body: serviceConfigCreateSchema,
});

export const listTenantServicesRequestSchema = z.object({
  params: tenantIdRouteParamSchema.shape.params,
});

export const vmManagementCatalogRequestSchema = z.object({
  params: tenantIdRouteParamSchema.shape.params,
});

export const updateServiceConfigRequestSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
    serviceKey: serviceKeyParamSchema,
  }),
  body: serviceConfigUpdateSchema,
});

export const updateVmManagementPricingRequestSchema = z.object({
  params: tenantIdRouteParamSchema.shape.params,
  body: vmManagementPricingSchema.partial(),
});

export const updateVmManagementAllowedTemplatesRequestSchema = z.object({
  params: tenantIdRouteParamSchema.shape.params,
  body: z.object({
    allowedTemplateIds: z.array(z.number().int().positive()),
  }),
});

export const removeServiceConfigRequestSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
    serviceKey: serviceKeyParamSchema,
  }),
  query: z.object({
    force: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  }),
});

export type ServiceConfigCreateInput = z.infer<typeof serviceConfigCreateSchema>;
export type ServiceConfigUpdateInput = z.infer<typeof serviceConfigUpdateSchema>;
export type VmManagementPricingInput = z.infer<typeof vmManagementPricingSchema>;
