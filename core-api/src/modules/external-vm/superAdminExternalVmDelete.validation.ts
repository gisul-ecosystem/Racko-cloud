import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

export const deleteSuperAdminExternalVmSchema = z.object({
  params: z.object({
    id: mongoObjectId,
  }),
});

export const bulkDeleteSuperAdminExternalVmSchema = z.object({
  body: z.object({
    ids: z.array(mongoObjectId).min(1, 'Provide at least one id').max(500),
  }),
});

export type BulkDeleteSuperAdminExternalVmInput = z.infer<
  typeof bulkDeleteSuperAdminExternalVmSchema
>;
