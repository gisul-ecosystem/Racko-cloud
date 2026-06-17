import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const externalVMBody = z.object({
  name: z.string({ required_error: 'name is required' }).min(1, 'name is required').max(100).trim(),
  ipAddress: z
    .string({ required_error: 'ipAddress is required' })
    .trim()
    .ip({ message: 'ipAddress must be a valid IPv4 or IPv6 address' }),
  protocol: z.enum(['rdp', 'ssh'], {
    required_error: 'protocol is required',
    invalid_type_error: 'protocol must be rdp or ssh',
  }),
  username: z.string().max(100).trim().optional(),
  password: z
    .string({ required_error: 'password is required' })
    .min(1, 'password is required')
    .max(256),
});

export const createExternalVMSchema = z.object({
  body: externalVMBody,
});

export const bulkCreateExternalVMSchema = z.object({
  body: z.object({
    vms: z
      .array(externalVMBody)
      .min(1, 'At least one VM is required')
      .max(100, 'Cannot add more than 100 VMs at once'),
  }),
});

export const externalVMIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export type CreateExternalVMInput = z.infer<typeof createExternalVMSchema>['body'];
export type BulkCreateExternalVMInput = z.infer<typeof bulkCreateExternalVMSchema>['body'];
