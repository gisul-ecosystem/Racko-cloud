import { z } from 'zod';
import { tenantIdRouteParamSchema } from './tenant.validation';

/** Path param; assignability checked against Mongo catalog on create. */
export const serviceKeyParamSchema = z.string().min(1).max(100);

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

/** Assignability is enforced in the service layer against Mongo `service_catalog`. */
export const serviceConfigCreateSchema = z
  .object({
    serviceKey: z.string().min(1).max(100),
    limits: z.record(z.any()).optional().default({}),
    pricing: z.record(z.any()).optional().default({}),
  })
  .superRefine((data, ctx) => {
    if (data.serviceKey !== 'vm-management') {
      return;
    }

    const limits = vmManagementLimitsSchema.safeParse(data.limits);
    if (!limits.success) {
      for (const issue of limits.error.issues) {
        ctx.addIssue({ ...issue, path: ['limits', ...issue.path] });
      }
    }

    const pricing = vmManagementPricingSchema.safeParse(data.pricing);
    if (!pricing.success) {
      for (const issue of pricing.error.issues) {
        ctx.addIssue({ ...issue, path: ['pricing', ...issue.path] });
      }
    }
  });

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
