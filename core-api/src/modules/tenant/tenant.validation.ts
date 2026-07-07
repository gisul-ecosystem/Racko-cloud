import { z } from 'zod';
import { registerSchema } from '../auth/auth.validation';

export const passwordSchema = registerSchema.shape.body.shape.password;

const domainSchema = z
  .string()
  .min(1, 'Domain is required')
  .max(253, 'Domain too long')
  .toLowerCase()
  .trim()
  .refine(
    (value) =>
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(value),
    'Domain must be a valid hostname'
  );

const brandingSchema = z
  .object({
    logoUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
    loginPageImageUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    supportEmail: z.string().email('Support email must be valid').optional(),
  })
  .optional();

const tenantStatusSchema = z.enum(['pending', 'active', 'suspended', 'cancelled']);

export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(200, 'Name too long').trim(),
    domain: domainSchema,
    branding: brandingSchema,
  }),
});

export const listTenantsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    status: tenantStatusSchema.optional(),
  }),
});

export const tenantIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Tenant id is required'),
  }),
});

export const tenantIdRouteParamSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
  }),
});

export const updateTenantSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Tenant id is required'),
  }),
  body: z
    .object({
      name: z.string().min(1).max(200).trim().optional(),
      domain: domainSchema.optional(),
      status: tenantStatusSchema.optional(),
      branding: brandingSchema,
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

export const listTenantVmsSchema = z.object({
  params: tenantIdRouteParamSchema.shape.params,
  query: z.object({
    status: z
      .enum(['creating', 'running', 'stopped', 'paused', 'suspended', 'error', 'deleting', 'delete_failed'])
      .optional(),
    node: z
      .string()
      .max(63, 'Node name too long')
      .regex(/^[a-zA-Z0-9-]+$/, 'Invalid node name')
      .optional(),
  }),
});

export const createTenantAdminSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1, 'Tenant id is required'),
  }),
  body: z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .max(254, 'Email too long')
      .toLowerCase()
      .trim(),
    password: passwordSchema,
  }),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>['body'];
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>['body'];
export type CreateTenantAdminInput = z.infer<typeof createTenantAdminSchema>['body'];
