import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const nullablePrice = z.preprocess((v) => {
  if (v === '' || v === undefined) return null;
  return v;
}, z.coerce.number().min(0).nullable().optional());

export const createVmCatalogPlanSchema = z.object({
  body: z.object({
    sno: z.coerce.number().int().optional(),
    name: z.string().min(1).max(200).trim(),
    vcpu: z.coerce.number().int().min(1),
    ramGb: z.coerce.number().min(1),
    ssdGb: z.coerce.number().min(1),
    hourly: nullablePrice,
    monthly: nullablePrice,
    quarterly: nullablePrice,
    yearly: nullablePrice,
    currency: z.string().min(1).max(8).trim().default('INR'),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().optional().default(0),
  }),
});

export const updateVmCatalogPlanSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    sno: z.coerce.number().int().optional(),
    name: z.string().min(1).max(200).trim().optional(),
    vcpu: z.coerce.number().int().min(1).optional(),
    ramGb: z.coerce.number().min(1).optional(),
    ssdGb: z.coerce.number().min(1).optional(),
    hourly: nullablePrice,
    monthly: nullablePrice,
    quarterly: nullablePrice,
    yearly: nullablePrice,
    currency: z.string().min(1).max(8).trim().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().optional(),
  }),
});

export const vmCatalogPlanIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export type CreateVmCatalogPlanInput = z.infer<typeof createVmCatalogPlanSchema>['body'];
export type UpdateVmCatalogPlanInput = z.infer<typeof updateVmCatalogPlanSchema>['body'];
