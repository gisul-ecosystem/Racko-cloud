import { z } from 'zod';

/**
 * Validates :nodeName URL param.
 * Proxmox node names are alphanumeric + hyphens, max 63 chars (RFC 1123).
 */
export const nodeNameParamSchema = z.object({
  params: z.object({
    nodeName: z
      .string()
      .min(1, 'Node name is required')
      .max(63, 'Node name too long')
      .regex(/^[a-zA-Z0-9-]+$/, 'Node name must be alphanumeric (hyphens allowed)'),
  }),
});

/**
 * Validates optional query params for GET /proxmox/vms
 *   ?node=pve        → filter by node name
 *   ?status=running  → filter by VM status
 *   ?type=qemu       → filter by VM type
 */
export const vmQuerySchema = z.object({
  query: z.object({
    node: z
      .string()
      .max(63)
      .regex(/^[a-zA-Z0-9-]+$/, 'Invalid node name')
      .optional(),
    status: z.enum(['running', 'stopped', 'paused', 'suspended']).optional(),
    type: z.enum(['qemu', 'lxc']).optional(),
  }),
});

export type NodeNameParam = z.infer<typeof nodeNameParamSchema>['params'];
export type VMQueryParams = z.infer<typeof vmQuerySchema>['query'];
