import { z } from 'zod';
import { PLATFORM_ALL_PERMISSION_KEYS } from './platformPermissions.catalog';

const permissionKeySchema = z.string().refine((k) => PLATFORM_ALL_PERMISSION_KEYS.includes(k), {
  message: 'Unknown permission key',
});

export const createPlatformRoleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(500).optional(),
      permissions: z.array(permissionKeySchema).default([]),
    })
    .strict(),
});

export const updatePlatformRoleSchema = z.object({
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

export const setPlatformUserRolesSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id'),
  }),
  body: z
    .object({
      roleIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
    })
    .strict(),
});

export const invitePlatformOperatorSchema = z.object({
  body: z
    .object({
      email: z.string().email(),
      roleIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
    })
    .strict(),
});
