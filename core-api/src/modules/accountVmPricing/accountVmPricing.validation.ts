import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const periodAbsoluteSchema = z
  .object({
    hourly: z.number().min(0).nullable().optional(),
    monthly: z.number().min(0).nullable().optional(),
    quarterly: z.number().min(0).nullable().optional(),
    yearly: z.number().min(0).nullable().optional(),
  })
  .strict();

const dedicatedPlanAbsoluteSchema = z
  .object({
    monthlyPrice: z.number().min(0).nullable().optional(),
    setupFee: z.number().min(0).nullable().optional(),
  })
  .strict();

const categoryMultiplierSchema = z
  .object({
    multiplier: z.number().min(0.01).nullable().optional(),
  })
  .strict();

export const providerParamSchema = z.object({
  params: z.object({
    provider: z.enum(['webyne', 'dedicated']),
  }),
});

export const overrideParamsSchema = z.object({
  params: z.object({
    provider: z.enum(['webyne', 'dedicated']),
    scopeType: z.enum(['organization', 'tenant']),
    accountId: objectId,
  }),
});

export const searchAccountsSchema = z.object({
  query: z.object({
    scopeType: z.enum(['organization', 'tenant']),
    q: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const upsertOverrideSchema = z.object({
  params: z.object({
    provider: z.enum(['webyne', 'dedicated']),
    scopeType: z.enum(['organization', 'tenant']),
    accountId: objectId,
  }),
  body: z
    .object({
      hourlyEnabled: z.boolean().nullable().optional(),
      categories: z
        .object({
          linux: categoryMultiplierSchema.optional(),
          windows: categoryMultiplierSchema.optional(),
          gpu: categoryMultiplierSchema.optional(),
          default: categoryMultiplierSchema.optional(),
        })
        .strict()
        .optional(),
      planOverrides: z.record(z.string(), periodAbsoluteSchema).optional(),
      dedicatedPlanOverrides: z.record(z.string(), dedicatedPlanAbsoluteSchema).optional(),
      notes: z.string().trim().max(500).nullable().optional(),
    })
    .strict(),
});
