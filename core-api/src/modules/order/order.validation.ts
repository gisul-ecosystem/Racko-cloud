import { z } from 'zod';

const orderSpecFields = {
  cpuCores: z.number().int().min(1).max(128).optional(),
  memoryGb: z.number().min(0.5).max(512).optional(),
  diskGb: z.number().min(1).max(10000).optional(),
};

export const placeOrderBodySchema = z.object({
  templateId: z.number().int().positive(),
  count: z.number().int().positive(),
  cpuCores: orderSpecFields.cpuCores,
  memoryGb: orderSpecFields.memoryGb,
  diskGb: orderSpecFields.diskGb,
  billingPeriod: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  networkType: z.enum(['public', 'private']).optional().default('public'),
});

export const quoteOrderSchema = z.object({
  body: placeOrderBodySchema,
});

export const createOrderSchema = z.object({
  body: placeOrderBodySchema,
});

export const tenantTemplateIdParamSchema = z.object({
  params: z.object({
    templateId: z.coerce.number().int().positive(),
  }),
});
