import { z } from 'zod';

const dateLike = z.coerce.date({
  required_error: 'Date is required.',
  invalid_type_error: 'Invalid date.',
});

export const createVmHostLeaseSchema = z.object({
  body: z
    .object({
      provider: z.string().trim().min(1, 'Provider is required.'),
      ipAddress: z.string().trim().min(1, 'IP Address is required.'),
      description: z.string().trim().min(1, 'Description is required.'),
      invoiceDate: dateLike,
      dueDate: dateLike,
      assignedTo: z.string().trim().min(1, 'Assigned To is required.'),
      clientAssignmentStartDate: dateLike.optional().nullable(),
      clientAssignmentEndDate: dateLike.optional().nullable(),
      vmUsername: z.string().trim().min(1, 'VM Username is required.'),
      vmPassword: z.string().min(1, 'VM Password is required.'),
    })
    .refine((data) => data.dueDate.getTime() >= data.invoiceDate.getTime(), {
      message: 'Due Date must be on or after Invoice Date.',
      path: ['dueDate'],
    })
    .superRefine((data, ctx) => {
      if (data.clientAssignmentStartDate && data.clientAssignmentEndDate && 
          data.clientAssignmentEndDate.getTime() < data.clientAssignmentStartDate.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Assignment End Date must be on or after Assignment Start Date.',
          path: ['clientAssignmentEndDate'],
        });
      }
    }),
});

export const updateVmHostLeaseSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid lease id.'),
  }),
  body: z
    .object({
      provider: z.string().trim().min(1).optional(),
      ipAddress: z.string().trim().min(1).optional(),
      description: z.string().trim().min(1).optional(),
      invoiceDate: dateLike.optional(),
      dueDate: dateLike.optional(),
      assignedTo: z.string().trim().min(1).optional(),
      clientAssignmentStartDate: dateLike.optional().nullable(),
      clientAssignmentEndDate: dateLike.optional().nullable(),
      vmUsername: z.string().trim().min(1).optional(),
      vmPassword: z.string().min(1).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required.',
    })
    .superRefine((data, ctx) => {
      if (data.invoiceDate && data.dueDate && data.dueDate.getTime() < data.invoiceDate.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Due Date must be on or after Invoice Date.',
          path: ['dueDate'],
        });
      }
      if (data.clientAssignmentStartDate && data.clientAssignmentEndDate && 
          data.clientAssignmentEndDate.getTime() < data.clientAssignmentStartDate.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Assignment End Date must be on or after Assignment Start Date.',
          path: ['clientAssignmentEndDate'],
        });
      }
    }),
});

export const vmHostLeaseIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid lease id.'),
  }),
});

export const listVmHostLeasesQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(500).optional().default(100),
    search: z.string().trim().optional(),
  }),
});

export type CreateVmHostLeaseInput = z.infer<typeof createVmHostLeaseSchema>['body'];
export type UpdateVmHostLeaseInput = z.infer<typeof updateVmHostLeaseSchema>['body'];
export type ListVmHostLeasesQuery = z.infer<typeof listVmHostLeasesQuerySchema>['query'];
