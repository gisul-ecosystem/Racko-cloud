import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

export const createCatalogVmRequestSchema = z.object({
  body: z.object({
    category: z.enum(['linux', 'windows', 'gpu']),
    planId: z.string().min(1).max(64).trim(),
    planName: z.string().min(1).max(200).trim(),
    specs: z
      .object({
        cpu: z.string().max(100).trim().optional(),
        ram: z.string().max(100).trim().optional(),
        disk: z.string().max(100).trim().optional(),
      })
      .optional()
      .default({}),
    billing: z.string().min(1).max(64).trim(),
    quantity: z.coerce.number().int().min(1).max(100),
    template: z.object({
      value: z.string().min(1).max(200).trim(),
      label: z.string().min(1).max(200).trim(),
    }),
    pricingSnapshot: z.object({
      currency: z.string().min(1).max(8).trim().default('INR'),
      subtotal: z.coerce.number().optional(),
      tax: z.coerce.number().optional(),
      total: z.coerce.number().min(0),
      billingLabel: z.string().max(100).trim().optional(),
    }),
    durationDays: z.coerce.number().int().min(1).max(3650).optional(),
    canonicalSpec: z.string().min(1).max(100).trim().optional(),
  }),
});

export const catalogVmRequestIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export const catalogVmAdminIdParamSchema = z.object({
  params: z.object({ adminId: mongoObjectId }),
});

export const rejectCatalogVmRequestSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    reason: z.string().min(1).max(500).trim(),
  }),
});

export const listCatalogVmRequestsQuerySchema = z.object({
  query: z.object({
    status: z
      .enum([
        'pending_approval',
        'approved',
        'provisioning',
        'fulfilling',
        'ready_to_attach',
        'active',
        'failed',
        'rejected',
        'cancelled',
        'suspended',
        'terminated',
        'all',
      ])
      .optional()
      .default('provisioning'),
    adminId: mongoObjectId.optional(),
  }),
});

const cloudProviderEnum = z.enum(['aws', 'azure', 'oci', 'gcp']);

export const calculateVmPricingSchema = z.object({
  body: z
    .object({
      category: z.enum(['linux', 'windows', 'gpu']).default('linux'),
      durationDays: z.coerce.number().int().min(1).max(3650).default(1),
      specs: z
        .object({
          cpu: z.union([z.string(), z.number()]).optional(),
          ram: z.union([z.string(), z.number()]).optional(),
          disk: z.union([z.string(), z.number()]).optional(),
        })
        .optional(),
      canonicalSpec: z.string().min(1).max(100).trim().optional(),
      providers: z
        .union([z.array(cloudProviderEnum).min(1), cloudProviderEnum, z.string().min(1)])
        .optional(),
      provider: z
        .union([z.array(cloudProviderEnum).min(1), cloudProviderEnum, z.string().min(1)])
        .optional(),
    })
    .refine((b) => Boolean(b.canonicalSpec) || Boolean(b.specs), {
      message: 'canonicalSpec or specs is required',
    }),
});

export const listVmPricingQuerySchema = z.object({
  query: z.object({
    providers: z.string().optional(),
    provider: z.string().optional(),
    category: z.enum(['linux', 'windows', 'gpu']).optional(),
    canonicalSpec: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  }),
});

export type CreateCatalogVmRequestInput = z.infer<typeof createCatalogVmRequestSchema>['body'];
export type CalculateVmPricingInput = z.infer<typeof calculateVmPricingSchema>['body'];
export type ListVmPricingQuery = z.infer<typeof listVmPricingQuerySchema>['query'];
