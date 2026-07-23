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

// Validates a single IPv4, IPv6, or CIDR notation entry.
const ipOrCidrSchema = z
  .string()
  .min(1)
  .max(50)
  .refine(
    (value) => {
      // IPv4: four octets, optional /0-32 prefix
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
      // IPv6: full or compressed colon-hex notation, optional /0-128 prefix
      // Covers: ::1, 2001:db8::1, 2401:4900:1cb9:405e:3d5e:5842:4e29:4239, etc.
      const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d))(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/;
      return ipv4.test(value) || ipv6.test(value);
    },
    { message: 'Each entry must be a valid IPv4, IPv6, or CIDR notation' }
  );

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

export const updateTenantIpAccessSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Tenant id is required'),
  }),
  body: z.object({
    ipAccessMode: z.enum(['all', 'restricted']),
    allowedIps: z
      .array(ipOrCidrSchema)
      .max(500, 'Cannot exceed 500 IP/CIDR entries')
      .default([]),
  }),
});

export const listTenantVmsSchema = z.object({
  params: tenantIdRouteParamSchema.shape.params,
  query: z.object({
    status: z
      .enum([
        'creating',
        'running',
        'stopped',
        'paused',
        'suspended',
        'error',
        'deleting',
        'delete_failed',
      ])
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
export type UpdateTenantIpAccessInput = z.infer<typeof updateTenantIpAccessSchema>['body'];
