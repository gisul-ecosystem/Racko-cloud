import { z } from 'zod';
import mongoose from 'mongoose';
import { assignmentScheduleBody } from './superAdminBulkImport.validation';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const externalVmIdParam = z.object({
  id: mongoObjectId,
});

const assignmentIdParams = z.object({
  id: mongoObjectId,
  assignmentId: mongoObjectId,
});

export const createSuperAdminExternalVmAssignmentSchema = z.object({
  params: externalVmIdParam,
  body: z
    .object({
      userId: mongoObjectId.optional(),
      tenantUserId: mongoObjectId.optional(),
      schedule: assignmentScheduleBody.nullable().optional(),
    })
    .superRefine((data, ctx) => {
      const hasUser = Boolean(data.userId);
      const hasTenantUser = Boolean(data.tenantUserId);
      if (hasUser === hasTenantUser) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide exactly one of userId or tenantUserId',
          path: ['userId'],
        });
      }
    }),
});

export const patchSuperAdminExternalVmAssignmentSchema = z.object({
  params: assignmentIdParams,
  body: z
    .object({
      schedule: assignmentScheduleBody.nullable().optional(),
      status: z.enum(['active', 'revoked']).optional(),
      accessOverride: z.boolean().optional(),
      accessOverrideUntil: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .refine(
      (data) =>
        data.schedule !== undefined ||
        data.status !== undefined ||
        data.accessOverride !== undefined,
      { message: 'Provide schedule, status, and/or accessOverride' }
    ),
});

export const deleteSuperAdminExternalVmAssignmentSchema = z.object({
  params: assignmentIdParams,
});

export type CreateSuperAdminExternalVmAssignmentInput = z.infer<
  typeof createSuperAdminExternalVmAssignmentSchema
>;
export type PatchSuperAdminExternalVmAssignmentInput = z.infer<
  typeof patchSuperAdminExternalVmAssignmentSchema
>;
