import { z } from 'zod';

export const superAdminTenantIdParamSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
  }),
});

export const superAdminTenantAdminParamSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
    tenantUserId: z.string().min(1, 'Tenant user id is required'),
  }),
});

export const setTenantAdminActiveSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
    tenantUserId: z.string().min(1, 'Tenant user id is required'),
  }),
  body: z.object({
    isActive: z.boolean(),
  }),
});
