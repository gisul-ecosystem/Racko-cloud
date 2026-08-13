import { z } from 'zod';

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const superAdminVmInventoryQuerySchema = z.object({
  query: z.object({
    resourceType: z.enum(['platform_vm', 'catalog_vm', 'external_vm']).optional(),
    originServiceKey: z.enum(['vm-management', 'create-vm', 'external-vm']).optional(),
    ownerScope: z.enum(['admin', 'tenant']).optional(),
    tenantId: z.string().regex(objectIdRegex, 'Invalid tenantId').optional(),
    adminId: z.string().regex(objectIdRegex, 'Invalid adminId').optional(),
    projectId: z.string().regex(objectIdRegex, 'Invalid projectId').optional(),
    status: z.enum(['provisioning', 'active', 'suspended', 'failed', 'deleted']).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    ownerSearch: z.string().trim().min(1).max(120).optional(),
    sortBy: z.enum(['createdAt', 'owner', 'service']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    createdFrom: z.string().datetime().optional(),
    createdTo: z.string().datetime().optional(),
  }),
});

const providerPlanDurationSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toLowerCase())
  .transform((value) => {
    if (value === 'monthly' || value === 'month' || value === 'mon') return 'monthly';
    if (value === 'quarterly' || value === 'quarter' || value === 'qtr') return 'quarterly';
    if (value === 'hourly' || value === 'hour' || value === 'hr') return 'hourly';
    if (value === 'yearly' || value === 'year' || value === 'yr') return 'yearly';
    return value;
  })
  .pipe(z.enum(['monthly', 'quarterly', 'hourly', 'yearly']));

export const superAdminVmProviderMetadataImportSchema = z.object({
  body: z.object({
    rows: z.array(
      z.object({
        ipAddress: z.string().trim().min(1, 'ipAddress is required'),
        name: z.string().trim().optional(),
        protocol: z.enum(['rdp', 'ssh']).optional(),
        planDuration: providerPlanDurationSchema.optional(),
        username: z.string().trim().optional(),
        password: z.string().optional(),
        providerStartDate: z.string().datetime().optional(),
        providerEndDate: z.string().datetime().optional(),
      })
    ).min(1, 'Provide at least one row').max(5000, 'Too many rows'),
  }),
});

export const superAdminVmProviderMetadataUpdateSchema = z.object({
  body: z.object({
    ipAddress: z.string().trim().min(1, 'ipAddress is required'),
    providerStartDate: z.string().datetime().nullable().optional(),
    providerEndDate: z.string().datetime().nullable().optional(),
    planDuration: providerPlanDurationSchema.optional(),
  }),
});

export const superAdminVmInventoryClearAssignmentSchema = z.object({
  body: z.object({
    resourceType: z.enum(['platform_vm', 'catalog_vm', 'external_vm']),
    sourceId: z.string().regex(objectIdRegex, 'Invalid sourceId'),
  }),
});

export const superAdminVmInventoryDeleteAssignedUserSchema = z.object({
  body: z.object({
    resourceType: z.enum(['platform_vm', 'catalog_vm', 'external_vm']),
    sourceId: z.string().regex(objectIdRegex, 'Invalid sourceId'),
  }),
});
