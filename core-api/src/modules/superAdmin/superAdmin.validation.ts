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

const walletPaginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const superAdminWalletTransactionsSchema = z.object({
  params: superAdminTenantIdParamSchema.shape.params,
  query: walletPaginationQuerySchema,
});

export const superAdminManualCreditsListSchema = z.object({
  params: superAdminTenantIdParamSchema.shape.params,
  query: walletPaginationQuerySchema,
});

export const manualWalletCreditSchema = z.object({
  params: superAdminTenantIdParamSchema.shape.params,
  body: z.object({
    amount: z.number().positive('amount must be positive'),
    paymentReference: z.string().min(6).max(64).trim(),
    paymentMethod: z.enum(['upi', 'bank_transfer', 'cash', 'other']),
    internalNote: z.string().max(500).trim().optional(),
  }),
});
