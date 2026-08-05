import { z } from 'zod';

const templateRatesSchema = z.object({
  cpuRatePerCoreMonthly: z.number().int().nonnegative(),
  ramRatePerGbMonthly: z.number().int().nonnegative(),
  diskRatePerGbMonthly: z.number().int().nonnegative(),
  billingDiscounts: z
    .object({
      quarterly: z.number().min(0).max(1).default(0),
      yearly: z.number().min(0).max(1).default(0),
    })
    .default({ quarterly: 0, yearly: 0 }),
});

export const savePricingSchema = z.object({
  body: z.object({
    templatePricing: z.record(z.string(), templateRatesSchema),
  }),
});

export const creditWalletSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    amount: z.number().positive(),
  }),
});

export const quoteSchema = z.object({
  body: z.object({
    templateId: z.number().int().positive(),
    cpuCores: z.number().positive(),
    memoryGb: z.number().positive(),
    diskGb: z.number().positive(),
    count: z.number().int().positive().default(1),
    billingPeriod: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  }),
});

export const listTransactionsSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

export const topupSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
  }),
});

export const chargeCloudRequestSchema = z.object({
  body: z.object({
    amountUsd: z.number().positive(),
    relatedRequestId: z.string().min(1).nullable().optional(),
    provider: z.enum(['azure', 'aws']).optional().default('azure'),
    projectId: z.string().min(1).optional(),
    serviceKey: z.enum(['azure', 'aws', 'cloud-labs']).optional(),
  }),
});

export const refundCloudRequestSchema = z.object({
  body: z.object({
    amountInr: z.number().positive(),
    relatedRequestId: z.string().min(1).nullable().optional(),
  }),
});

export const linkCloudRequestSchema = z.object({
  body: z.object({
    relatedRequestId: z.string().min(1),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
});
