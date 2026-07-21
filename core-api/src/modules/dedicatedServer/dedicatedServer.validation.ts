import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

export const createDedicatedPlanSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).trim(),
    description: z.string().max(1000).trim().optional(),
    cpu: z.string().min(1).max(100).trim(),
    ram: z.string().min(1).max(100).trim(),
    disk: z.string().min(1).max(100).trim(),
    location: z.string().max(200).trim().optional(),
    features: z.array(z.string().max(200).trim()).optional().default([]),
    monthlyPrice: z.coerce.number().min(0),
    setupFee: z.coerce.number().min(0).nullable().optional(),
    currency: z.string().min(1).max(8).trim().default('INR'),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().optional().default(0),
  }),
});

export const updateDedicatedPlanSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    name: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(1000).trim().optional().nullable(),
    cpu: z.string().min(1).max(100).trim().optional(),
    ram: z.string().min(1).max(100).trim().optional(),
    disk: z.string().min(1).max(100).trim().optional(),
    location: z.string().max(200).trim().optional().nullable(),
    features: z.array(z.string().max(200).trim()).optional(),
    monthlyPrice: z.coerce.number().min(0).optional(),
    setupFee: z.coerce.number().min(0).nullable().optional(),
    currency: z.string().min(1).max(8).trim().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().optional(),
  }),
});

export const dedicatedIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export const createDedicatedRequestSchema = z.object({
  body: z.object({
    planId: mongoObjectId,
    notes: z.string().max(1000).trim().optional(),
  }),
});

export const attachDedicatedRequestSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    ipAddress: z.string().min(1).max(100).trim(),
    hostname: z.string().max(200).trim().optional(),
    username: z.string().min(1).max(100).trim(),
    password: z.string().min(1).max(500),
    protocol: z.enum(['rdp', 'ssh']),
  }),
});

export const rejectDedicatedRequestSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    reason: z.string().min(1).max(500).trim(),
  }),
});

export const listDedicatedRequestsQuerySchema = z.object({
  query: z.object({
    status: z
      .enum(['provisioning', 'active', 'rejected', 'cancelled', 'suspended', 'all'])
      .optional()
      .default('provisioning'),
    adminId: mongoObjectId.optional(),
  }),
});

export const updateDedicatedPricingSettingsSchema = z.object({
  body: z.object({
    sellMultiplier: z.coerce.number().positive().max(1000),
  }),
});

export type CreateDedicatedPlanInput = z.infer<typeof createDedicatedPlanSchema>['body'];
export type UpdateDedicatedPlanInput = z.infer<typeof updateDedicatedPlanSchema>['body'];
export type CreateDedicatedRequestInput = z.infer<typeof createDedicatedRequestSchema>['body'];
export type AttachDedicatedRequestInput = z.infer<typeof attachDedicatedRequestSchema>['body'];
