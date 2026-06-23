import { z } from 'zod';
import { SERVICE_CATALOG } from '../../constants/serviceCatalog';
import { tenantIdRouteParamSchema } from './tenant.validation';

export const serviceKeyParamSchema = z.enum(SERVICE_CATALOG);

const vmManagementLimitsSchema = z.object({
  maxVms: z.number().int().positive(),
  maxTotalVcpu: z.number().int().positive(),
  maxTotalRamGb: z.number().positive(),
  maxTotalDiskGb: z.number().positive(),
  allowedTemplateIds: z.array(z.number().int().positive()).optional().default([]),
});

const vmManagementPricingSchema = z.object({
  cpuRatePerCoreMonthly: z.number().nonnegative(),
  ramRatePerGbMonthly: z.number().nonnegative(),
  diskRatePerGbMonthly: z.number().nonnegative(),
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
});

const azureLimitsSchema = z.object({}).passthrough();
const azurePricingSchema = z.object({}).passthrough();

export const serviceConfigCreateSchema = z.discriminatedUnion('serviceKey', [
  z.object({
    serviceKey: z.literal('vm-management'),
    limits: vmManagementLimitsSchema,
    pricing: vmManagementPricingSchema,
  }),
  z.object({
    serviceKey: z.literal('azure'),
    limits: azureLimitsSchema,
    pricing: azurePricingSchema,
  }),
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

export const updateServiceConfigRequestSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
    serviceKey: serviceKeyParamSchema,
  }),
  body: serviceConfigUpdateSchema,
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
