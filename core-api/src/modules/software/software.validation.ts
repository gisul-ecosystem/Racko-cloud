import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

export const createSoftwareSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).trim(),
    slug: z
      .string()
      .max(100)
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens only')
      .optional(),
    description: z.string().max(500).trim().optional(),
    iconUrl: z.string().url('iconUrl must be a valid URL').max(500).optional(),
    version: z.string().max(50).trim().optional(),
    installScript: z.string().min(1, 'installScript is required').max(50000).trim(),
    estimatedMinutes: z.number().int().min(1).max(120).optional().default(5),
    isActive: z.boolean().optional().default(true),
  }),
});

export const updateSoftwareSchema = z.object({
  params: z.object({ softwareId: mongoObjectId }),
  body: z.object({
    name: z.string().min(1).max(100).trim().optional(),
    description: z.string().max(500).trim().optional(),
    iconUrl: z.string().url().max(500).optional(),
    version: z.string().max(50).trim().optional(),
    installScript: z.string().min(1).max(50000).trim().optional(),
    estimatedMinutes: z.number().int().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const softwareIdParamSchema = z.object({
  params: z.object({ softwareId: mongoObjectId }),
});

export type CreateSoftwareInput = z.infer<typeof createSoftwareSchema>['body'];
export type UpdateSoftwareInput = z.infer<typeof updateSoftwareSchema>['body'];
