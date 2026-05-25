import { z } from 'zod';
import mongoose from 'mongoose';

// ─── Reusable validators ──────────────────────────────────────────────────────

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ID format',
  });

// ─── Create VM ────────────────────────────────────────────────────────────────

export const createVMSchema = z.object({
  body: z.object({
    templateId: z
      .number({ required_error: 'templateId is required' })
      .int('templateId must be an integer')
      .positive('templateId must be positive'),
    name: z
      .string({ required_error: 'name is required' })
      .min(3, 'Name must be at least 3 characters')
      .max(50, 'Name must be at most 50 characters')
      .regex(/^[a-zA-Z0-9-]+$/, 'Only alphanumeric characters and hyphens allowed')
      .transform((val) => val.toLowerCase()),
    count: z
      .number({ required_error: 'count is required' })
      .int('count must be an integer')
      .min(1, 'count must be at least 1')
      .max(100, 'count cannot exceed 100'),
    cloneType: z.enum(['dedicated_storage', 'dynamic_storage'], {
      required_error: 'cloneType is required',
      invalid_type_error: 'cloneType must be dedicated_storage or dynamic_storage',
    }),
    cpuCores: z
      .number()
      .int('cpuCores must be an integer')
      .min(1, 'cpuCores must be at least 1')
      .max(128, 'cpuCores cannot exceed 128')
      .optional(),
    memoryGb: z
      .number()
      .min(0.5, 'memoryGb must be at least 0.5')
      .max(512, 'memoryGb cannot exceed 512')
      .optional(),
    diskGb: z
      .number()
      .int('diskGb must be an integer')
      .min(10, 'diskGb must be at least 10')
      .max(10000, 'diskGb cannot exceed 10000')
      .optional(),
    description: z
      .string()
      .max(500, 'description cannot exceed 500 characters')
      .optional(),
  }),
});

// ─── VM ID param ──────────────────────────────────────────────────────────────

export const vmIdParamSchema = z.object({
  params: z.object({
    vmId: mongoObjectId,
  }),
});

// ─── Job ID param ─────────────────────────────────────────────────────────────

export const jobIdParamSchema = z.object({
  params: z.object({
    jobId: mongoObjectId,
  }),
});

// ─── Template ID param ────────────────────────────────────────────────────────

export const templateIdParamSchema = z.object({
  params: z.object({
    templateId: z
      .string()
      .regex(/^\d+$/, 'templateId must be a positive integer')
      .transform(Number)
      .refine((n) => n > 0, 'templateId must be positive'),
  }),
});

// ─── VM list query ────────────────────────────────────────────────────────────

export const vmListQuerySchema = z.object({
  query: z.object({
    status: z
      .enum(['creating', 'running', 'stopped', 'paused', 'suspended', 'error', 'deleting', 'delete_failed'])
      .optional(),
    cloneType: z.enum(['dedicated_storage', 'dynamic_storage']).optional(),
    node: z
      .string()
      .max(63, 'Node name too long')
      .regex(/^[a-zA-Z0-9-]+$/, 'Invalid node name')
      .optional(),
  }),
});

// ─── Alert history query ──────────────────────────────────────────────────────

export const alertHistoryQuerySchema = z.object({
  query: z.object({
    limit: z
      .string()
      .regex(/^\d+$/, 'limit must be a positive integer')
      .transform(Number)
      .refine((n) => n >= 1 && n <= 100, 'limit must be between 1 and 100')
      .optional()
      .default('50'),
  }),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateVMInput = z.infer<typeof createVMSchema>['body'];
export type VMListQuery = z.infer<typeof vmListQuerySchema>['query'];
export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>['query'];
