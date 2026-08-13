import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

/** Runtime catalog validation happens in the service layer. */
const serviceKeySchema = z.string().min(1).max(100);

export const adminIdParamSchema = z.object({
  params: z.object({ adminId: mongoObjectId }),
});

export const adminServiceKeyParamSchema = z.object({
  params: z.object({
    adminId: mongoObjectId,
    serviceKey: serviceKeySchema,
  }),
});

export const assignAdminServiceSchema = z.object({
  params: z.object({ adminId: mongoObjectId }),
  body: z.object({
    serviceKey: serviceKeySchema,
  }),
});

export const updateAdminServiceSchema = z.object({
  params: z.object({
    adminId: mongoObjectId,
    serviceKey: serviceKeySchema,
  }),
  body: z.object({
    status: z.enum(['active', 'suspended']),
  }),
});

export type AssignAdminServiceInput = z.infer<typeof assignAdminServiceSchema>['body'];
export type UpdateAdminServiceInput = z.infer<typeof updateAdminServiceSchema>['body'];
