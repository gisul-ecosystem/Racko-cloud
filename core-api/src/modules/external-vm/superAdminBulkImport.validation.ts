import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const assignmentScheduleBody = z.object({
  effectiveFrom: z.coerce.date({ required_error: 'effectiveFrom is required' }),
  effectiveTo: z.coerce.date().nullable().optional().default(null),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'daysOfWeek must include at least one day (0–6)'),
  dailyStart: z.string().regex(HHMM_RE, 'dailyStart must be HH:mm'),
  dailyEnd: z.string().regex(HHMM_RE, 'dailyEnd must be HH:mm'),
  timezone: z.string().min(1).default('Asia/Kolkata'),
});

/** Treat null/absent/partial schedule payloads as undefined (always-on). */
export const optionalAssignmentScheduleBody = z.preprocess(
  (val) => {
    if (val == null) return undefined;
    if (typeof val !== 'object' || Array.isArray(val)) return undefined;
    const s = val as Record<string, unknown>;
    const from = s.effectiveFrom;
    if (from == null || from === '') return undefined;
    const days = s.daysOfWeek;
    if (!Array.isArray(days) || days.length === 0) return undefined;
    if (typeof s.dailyStart !== 'string' || !s.dailyStart.trim()) return undefined;
    if (typeof s.dailyEnd !== 'string' || !s.dailyEnd.trim()) return undefined;
    return val;
  },
  assignmentScheduleBody.optional()
);

const assignmentBody = z
  .object({
    userId: mongoObjectId.optional(),
    tenantUserId: mongoObjectId.optional(),
    userEmail: z.string().email().trim().toLowerCase().optional(),
    userUsername: z.string().trim().toLowerCase().min(1).optional(),
    tenantUserEmail: z.string().email().trim().toLowerCase().optional(),
    schedule: optionalAssignmentScheduleBody,
  })
  .superRefine((data, ctx) => {
    const identifierCount = [
      data.userId,
      data.tenantUserId,
      data.userEmail,
      data.userUsername,
      data.tenantUserEmail,
    ].filter(Boolean).length;
    if (identifierCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Each assignment needs exactly one assignee identifier: userId, tenantUserId, userEmail, userUsername, or tenantUserEmail',
        path: ['userId'],
      });
    }
  });

const targetBody = z
  .object({
    tenantId: mongoObjectId.optional(),
    adminId: mongoObjectId.optional(),
    tenantSlug: z.string().trim().toLowerCase().min(1).optional(),
    adminEmail: z.string().email().trim().toLowerCase().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const identifierCount = [
      data.tenantId,
      data.adminId,
      data.tenantSlug,
      data.adminEmail,
    ].filter(Boolean).length;
    if (identifierCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'target needs exactly one of tenantId, tenantSlug, adminId, or adminEmail',
        path: ['tenantId'],
      });
    }
  });

const inlinePortalUserBody = z.object({
  name: z.string().trim().optional(),
  email: z.string().email().trim().toLowerCase(),
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1).max(256),
});

/**
 * One bulk-import row. Accepts `ip` (Bulk Import JSON shape) or `ipAddress`.
 *
 * Legacy:           `{ target, assignments? }`
 * Extended tenant:  `{ tenantName, user?, schedule? }`
 * Extended admin:   `{ adminEmail, user?, schedule? }`
 */
const bulkImportRowBody = z
  .object({
    name: z.string({ required_error: 'name is required' }).min(1).max(100).trim(),
    ip: z.string().trim().optional(),
    ipAddress: z.string().trim().optional(),
    protocol: z.enum(['rdp', 'ssh']).default('rdp'),
    username: z.string().max(100).trim().optional(),
    password: z.string({ required_error: 'password is required' }).min(1).max(256),
    target: targetBody.optional(),
    assignments: z.array(assignmentBody).max(50).optional(),
    tenantName: z.string().trim().min(1).optional(),
    adminEmail: z.string().email().trim().toLowerCase().optional(),
    user: inlinePortalUserBody.optional(),
    schedule: optionalAssignmentScheduleBody,
    projectId: mongoObjectId.optional(),
  })
  .superRefine((data, ctx) => {
    const ip = data.ipAddress ?? data.ip;
    if (!ip) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ip or ipAddress is required',
        path: ['ip'],
      });
      return;
    }
    if (ip.length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid IP address', path: ['ip'] });
    }

    const hasExtendedTenant = Boolean(data.tenantName);
    const hasExtendedAdmin = Boolean(data.adminEmail);
    const hasLegacy = Boolean(data.target);
    const modeCount = [hasExtendedTenant, hasExtendedAdmin, hasLegacy].filter(Boolean).length;

    if (modeCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each row needs exactly one of: tenantName, adminEmail, or target',
        path: ['tenantName'],
      });
      return;
    }

    if (modeCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use exactly one of tenantName, adminEmail, or target — not multiple',
        path: ['tenantName'],
      });
      return;
    }

    if ((hasExtendedTenant || hasExtendedAdmin) && data.assignments?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Extended rows use user + schedule, not assignments[]',
        path: ['assignments'],
      });
      return;
    }

    if ((hasExtendedTenant || hasExtendedAdmin) && data.schedule && !data.user) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'schedule requires user on extended rows',
        path: ['user'],
      });
    }

    if (hasLegacy && data.target) {
      const isTenant = Boolean(data.target.tenantId || data.target.tenantSlug);
      for (let i = 0; i < (data.assignments?.length ?? 0); i++) {
        const a = data.assignments![i]!;
        if (isTenant && (a.userId || a.userEmail || a.userUsername)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'tenant target requires tenantUserId or tenantUserEmail assignments (not userId/userEmail/userUsername)',
            path: ['assignments', i, 'tenantUserId'],
          });
        }
        if (!isTenant && (a.tenantUserId || a.tenantUserEmail)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'admin target requires userId, userEmail, or userUsername assignments (not tenantUserId/tenantUserEmail)',
            path: ['assignments', i, 'userId'],
          });
        }
      }
    }
  })
  .transform((data) => {
    const base = {
      name: data.name,
      ipAddress: (data.ipAddress ?? data.ip)!,
      protocol: data.protocol,
      username: data.username,
      password: data.password,
      projectId: data.projectId,
    };

    if (data.tenantName) {
      return {
        ...base,
        mode: 'extended' as const,
        tenantName: data.tenantName.trim(),
        user: data.user,
        schedule: data.schedule,
      };
    }

    if (data.adminEmail) {
      return {
        ...base,
        mode: 'extended_admin' as const,
        adminEmail: data.adminEmail,
        user: data.user,
        schedule: data.schedule,
      };
    }

    return {
      ...base,
      mode: 'legacy' as const,
      target: data.target!,
      assignments: data.assignments ?? [],
    };
  });

export const superAdminBulkImportExternalVmSchema = z.object({
  body: z.object({
    vms: z
      .array(bulkImportRowBody)
      .min(1, 'At least one VM is required')
      .max(300, 'Cannot import more than 300 VMs at once'),
  }),
});

export type SuperAdminBulkImportExternalVmInput = z.infer<
  typeof superAdminBulkImportExternalVmSchema
>['body'];
export type SuperAdminBulkImportRow = SuperAdminBulkImportExternalVmInput['vms'][number];
export type SuperAdminBulkImportAssignment = Extract<
  SuperAdminBulkImportRow,
  { mode: 'legacy' }
>['assignments'][number];
export type SuperAdminBulkImportInlineUser = NonNullable<
  Extract<SuperAdminBulkImportRow, { mode: 'extended' }>['user']
>;
