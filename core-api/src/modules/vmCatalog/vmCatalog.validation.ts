import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

export const createCatalogVmRequestSchema = z.object({
  body: z.object({
    category: z.enum(['ubuntu', 'rocky', 'debian', 'windows', 'linux', 'gpu']),
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

export const changeCatalogVmTemplateSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z
    .object({
      template: z.string().min(1).max(200).trim().optional(),
    })
    .optional()
    .default({}),
});

export const catalogVmPowerActionSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    action: z.enum(['virtualizor', 'start', 'stop', 'reboot']),
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
        'all',
      ])
      .optional()
      .default('provisioning'),
    adminId: mongoObjectId.optional(),
  }),
});

export type CreateCatalogVmRequestInput = z.infer<typeof createCatalogVmRequestSchema>['body'];
