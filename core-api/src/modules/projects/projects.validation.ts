import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

/** Catalog membership validated in projects.service. */
const adminServiceKeySchema = z.string().min(1).max(100);

export const createProjectSchema = z.object({
  body: z.object({
    clientName: z.string().min(1).max(200).trim(),
    name: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(1000).trim().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    enabledServices: z.array(adminServiceKeySchema).min(1),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    name: z.string().min(1).max(200).trim().optional(),
    clientName: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(1000).trim().optional().nullable(),
    startDate: z.coerce.date().optional().nullable(),
    endDate: z.coerce.date().optional().nullable(),
  }),
});

export const projectIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export const addProjectServicesSchema = z.object({
  params: z.object({ id: mongoObjectId }),
  body: z.object({
    services: z.array(adminServiceKeySchema).min(1),
  }),
});

export const removeProjectServiceSchema = z.object({
  params: z.object({
    id: mongoObjectId,
    serviceKey: adminServiceKeySchema,
  }),
});

export const projectReportsQuerySchema = z.object({
  query: z.object({
    projectId: mongoObjectId.optional(),
  }),
});

export const adminIdParamSchema = z.object({
  params: z.object({ adminId: mongoObjectId }),
});

export const createProjectForAdminSchema = z.object({
  params: z.object({ adminId: mongoObjectId }),
  body: z.object({
    clientName: z.string().min(1).max(200).trim(),
    name: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(1000).trim().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    enabledServices: z.array(adminServiceKeySchema).min(1),
  }),
});

export const tenantIdParamSchema = z.object({
  params: z.object({ tenantId: mongoObjectId }),
});

export const createProjectForTenantSchema = z.object({
  params: z.object({ tenantId: mongoObjectId }),
  body: z.object({
    clientName: z.string().min(1).max(200).trim(),
    name: z.string().min(1).max(200).trim().optional(),
    description: z.string().max(1000).trim().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    enabledServices: z.array(adminServiceKeySchema).min(1),
  }),
});

export const adminProjectParamSchema = z.object({
  params: z.object({ adminId: mongoObjectId, projectId: mongoObjectId }),
});

export const addProjectServicesForAdminSchema = z.object({
  params: z.object({ adminId: mongoObjectId, projectId: mongoObjectId }),
  body: z.object({
    services: z.array(adminServiceKeySchema).min(1),
  }),
});

export const tenantProjectParamSchema = z.object({
  params: z.object({ tenantId: mongoObjectId, projectId: mongoObjectId }),
});

export const addProjectServicesForTenantSchema = z.object({
  params: z.object({ tenantId: mongoObjectId, projectId: mongoObjectId }),
  body: z.object({
    services: z.array(adminServiceKeySchema).min(1),
  }),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>['body'];
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>['body'];
export type AddProjectServicesInput = z.infer<typeof addProjectServicesSchema>['body'];
export type CreateProjectForAdminInput = z.infer<typeof createProjectForAdminSchema>['body'];
export type CreateProjectForTenantInput = z.infer<typeof createProjectForTenantSchema>['body'];
