import { z } from 'zod';

export const listServiceCatalogQuerySchema = z.object({
  query: z.object({
    kind: z.enum(['product', 'utility']).optional(),
    scope: z.enum(['admin', 'tenant']).optional(),
    status: z.enum(['active', 'deprecated', 'hidden']).optional(),
    /** When "all", include non-active statuses (SA). Default active-only. */
    include: z.enum(['active', 'all']).optional(),
  }),
});

export const serviceCatalogKeyParamSchema = z.object({
  params: z.object({
    key: z.string().min(1).max(100),
  }),
});

export const patchServiceCatalogSchema = z.object({
  params: z.object({
    key: z.string().min(1).max(100),
  }),
  body: z
    .object({
      label: z.string().min(1).max(200).trim().optional(),
      description: z.string().max(1000).trim().optional(),
      status: z.enum(['active', 'deprecated', 'hidden']).optional(),
      sortOrder: z.number().int().min(0).max(10000).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export type PatchServiceCatalogInput = z.infer<typeof patchServiceCatalogSchema>['body'];
