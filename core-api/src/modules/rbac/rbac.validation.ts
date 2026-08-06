import { z } from 'zod';
import { isKnownPermission } from './permissions.catalog';

const permissionKeySchema = z.string().refine((k) => isKnownPermission(k), {
  message: 'Unknown permission key',
});

export const createRbacRoleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(500).optional(),
      permissions: z.array(permissionKeySchema).default([]),
    })
    .strict(),
});

export const updateRbacRoleSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid role id'),
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(500).optional(),
      permissions: z.array(permissionKeySchema).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

export const rbacRoleIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid role id'),
  }),
});

export const setUserRolesSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id'),
  }),
  body: z
    .object({
      roleIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
    })
    .strict(),
});

export const deleteStaffUserSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id'),
  }),
});

export const createStaffUserSchema = z.object({
  body: z
    .object({
      email: z.string().trim().email().max(255),
      tempPassword: z.string().min(8).max(128).optional(),
      roleIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).optional(),
      /** Convert an existing non-staff account to staff instead of failing. */
      promoteExisting: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Boolean(body.promoteExisting) || Boolean(body.tempPassword), {
      message: 'tempPassword is required when creating a new staff user',
      path: ['tempPassword'],
    }),
});

export type CreateRbacRoleInput = z.infer<typeof createRbacRoleSchema>['body'];
export type UpdateRbacRoleInput = z.infer<typeof updateRbacRoleSchema>['body'];
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>['body'];
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>['body'];
