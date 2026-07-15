import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const machineOSEnum = z.enum(['windows', 'linux', 'macos'], {
  required_error: 'os is required',
  invalid_type_error: 'os must be windows, linux, or macos',
});

const machineBody = z.object({
  name: z.string({ required_error: 'name is required' }).min(1, 'name is required').max(100).trim(),
  ipAddress: z
    .string({ required_error: 'ipAddress is required' })
    .trim()
    .ip({ message: 'ipAddress must be a valid IPv4 or IPv6 address' }),
  os: machineOSEnum,
});

export const createMachineSchema = z.object({ body: machineBody });

export const bulkCreateMachineSchema = z.object({
  body: z.object({
    machines: z
      .array(machineBody)
      .min(1, 'At least one machine is required')
      .max(100, 'Cannot add more than 100 machines at once'),
  }),
});

export const machineIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export const createJobSchema = z.object({
  body: z.object({
    machineIds: z
      .array(mongoObjectId)
      .min(1, 'At least one machine is required'),
    softwareIds: z
      .array(mongoObjectId)
      .min(1, 'At least one software is required'),
  }),
});

export const jobIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

// ─── Agent schemas (no auth — uses accountToken) ─────────────────────────────

export const agentRegisterSchema = z.object({
  body: z.object({
    accountToken: z.string({ required_error: 'accountToken is required' }).min(1),
    hostname: z.string({ required_error: 'hostname is required' }).min(1).max(253),
    mac: z.string({ required_error: 'mac is required' }).min(1).max(64),
    os: z.string({ required_error: 'os is required' }).min(1).max(64),
    cpuId: z.string({ required_error: 'cpuId is required' }).min(1).max(256),
  }),
});

export const agentEnrollSchema = z.object({
  body: z.object({
    enrollmentKey: z.string({ required_error: 'enrollmentKey is required' }).min(1),
    hostname: z.string({ required_error: 'hostname is required' }).min(1).max(253),
    mac: z.string({ required_error: 'mac is required' }).min(1).max(64),
    os: z.string({ required_error: 'os is required' }).min(1).max(64),
    cpuId: z.string({ required_error: 'cpuId is required' }).min(1).max(256),
  }),
});

const vmPushBody = z.object({
  name: z.string().min(1).max(100).trim(),
  ipAddress: z.string().trim().ip({ message: 'Must be a valid IP address' }),
  os: z.enum(['windows', 'linux', 'macos']),
  username: z.string().min(1).max(100).trim(),
  password: z.string().min(1).max(256),
});

export const pushAgentSchema = z.object({
  body: z.object({
    vms: z.array(vmPushBody).min(1).max(50),
  }),
});

export type PushAgentInput = z.infer<typeof pushAgentSchema>['body'];
export type AgentEnrollInput = z.infer<typeof agentEnrollSchema>['body'];

export const agentIdParamSchema = z.object({
  params: z.object({ agentId: z.string().min(1) }),
});

export const jobIdAgentParamSchema = z.object({
  params: z.object({ jobId: mongoObjectId }),
});

export const agentJobResultSchema = z.object({
  params: z.object({ jobId: mongoObjectId }),
  body: z.object({
    agentId: z.string({ required_error: 'agentId is required' }).min(1),
    status: z.enum(['pending', 'installing', 'success', 'failed', 'retrying']),
    logs: z.string().default(''),
  }),
});

export const agentHeartbeatSchema = z.object({
  body: z.object({
    agentId: z.string({ required_error: 'agentId is required' }).min(1),
    status: z.string().min(1).max(32),
    specs: z.object({
      hostname:  z.string().optional(),
      osVersion: z.string().optional(),
      cpuCores:  z.number().optional(),
      ramGb:     z.number().optional(),
      diskGb:    z.number().optional(),
    }).optional(),
  }),
});

export type CreateMachineInput = z.infer<typeof createMachineSchema>['body'];
export type BulkCreateMachineInput = z.infer<typeof bulkCreateMachineSchema>['body'];
export type CreateJobInput = z.infer<typeof createJobSchema>['body'];
export type AgentRegisterInput = z.infer<typeof agentRegisterSchema>['body'];
export type AgentJobResultInput = z.infer<typeof agentJobResultSchema>['body'];
export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>['body'];
