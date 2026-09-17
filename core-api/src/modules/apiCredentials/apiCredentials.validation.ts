import { z } from 'zod';
import mongoose from 'mongoose';
const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

export const createApiCredentialSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'name is required' })
      .min(1, 'name is required')
      .max(120)
      .trim(),
    /** Validated against the allowed scope set in apiCredentials.service (invalid_request). */
    scopes: z.array(z.string().min(1)).min(1).max(8).optional(),
    rateLimitPerMin: z.number().int().min(1).max(10_000).nullable().optional(),
  }),
});

export const revokeApiCredentialSchema = z.object({
  params: z.object({
    id: mongoObjectId,
  }),
});

export const apiCredentialIdParamSchema = revokeApiCredentialSchema;
