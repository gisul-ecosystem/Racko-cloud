import { z } from 'zod';

const periodOverridesSchema = z
  .object({
    hourly: z.string().trim().optional(),
    monthly: z.string().trim().optional(),
    quarterly: z.string().trim().optional(),
    yearly: z.string().trim().optional(),
  })
  .strict();

const categorySchema = z
  .object({
    multiplier: z.number().positive().max(1000),
    plans: z.record(z.string().min(1), periodOverridesSchema).default({}),
  })
  .strict();

export const providerParamSchema = z.object({
  params: z.object({
    provider: z.enum(['webyne']),
  }),
});

export const saveExternalVmPricingSchema = z.object({
  params: z.object({
    provider: z.enum(['webyne']),
  }),
  body: z
    .object({
      categories: z
        .object({
          linux: categorySchema,
          windows: categorySchema,
          gpu: categorySchema,
        })
        .strict(),
    })
    .strict(),
});
