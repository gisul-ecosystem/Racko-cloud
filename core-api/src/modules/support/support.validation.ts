import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

export const createTicketSchema = z.object({
  body: z
    .object({
      type: z.enum(['support', 'bug', 'vm_request']),
      subject: z.string().min(5).max(255),
      description: z.string().min(10),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      requesterPhone: z.string().optional(),
      vmCpu: z.string().optional(),
      vmRam: z.string().optional(),
      vmStorage: z.string().optional(),
      vmOs: z.string().optional(),
      vmPurpose: z.string().optional(),
      projectId: mongoObjectId.optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type !== 'vm_request') {
        return;
      }

      const requiredVmFields = [
        { key: 'vmCpu' as const, label: 'vmCpu' },
        { key: 'vmRam' as const, label: 'vmRam' },
        { key: 'vmStorage' as const, label: 'vmStorage' },
        { key: 'vmOs' as const, label: 'vmOs' },
      ];

      for (const field of requiredVmFields) {
        const value = data[field.key];
        if (value === undefined || value.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field.label} is required when type is vm_request.`,
            path: [field.key],
          });
        }
      }
    }),
});

export const ticketIdParamSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1),
  }),
});

export const updateTicketSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1),
  }),
  body: z.object({
    status: z
      .enum([
        'open',
        'tenant_handling',
        'platform_assigned',
        'in_progress',
        'resolved',
        'closed',
      ])
      .optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    platformAssigneeId: z.string().optional(),
    platformAssigneeName: z.string().optional(),
  }),
});

export const reassignSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1),
  }),
  body: z.object({
    agentId: z.string().min(1),
  }),
});

export const addCommentSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1),
  }),
  body: z.object({
    body: z.string().min(1),
    isInternal: z.boolean().optional().default(false),
  }),
});

export const listTicketsSchema = z.object({
  query: z.object({
    status: z
      .enum([
        'open',
        'tenant_handling',
        'platform_assigned',
        'in_progress',
        'resolved',
        'closed',
      ])
      .optional(),
    type: z.enum(['support', 'bug', 'vm_request']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assigneeId: z.string().optional(),
    tenantId: z.string().optional(),
    projectId: mongoObjectId.optional(),
    skip: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const tenantAssignSelfSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1),
  }),
});

export const escalateSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1),
  }),
  body: z.object({
    note: z.string().max(1000).optional(),
  }),
});

export const createSupportAgentSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    password: z.string().min(8),
  }),
});
