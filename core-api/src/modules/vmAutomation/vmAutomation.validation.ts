import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const vmIdsBody = z
  .array(z.string().regex(/^[a-f\d]{24}$/i, 'Invalid VM id'))
  .min(1, 'Select at least one VM')
  .max(500, 'Maximum 500 VMs per automation');

export const createVmAutomationSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(120),
      vmIds: vmIdsBody,
      startTime: z.string().regex(timeRegex, 'startTime must be HH:mm (24h)'),
      stopTime: z.string().regex(timeRegex, 'stopTime must be HH:mm (24h)'),
      startDate: z.string().regex(dateRegex, 'startDate must be YYYY-MM-DD'),
      endDate: z.string().regex(dateRegex, 'endDate must be YYYY-MM-DD'),
      timezone: z.string().min(1).max(64).default('UTC'),
    })
    .refine((d) => d.startDate <= d.endDate, {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    }),
});

export const updateVmAutomationSchema = z.object({
  params: z.object({
    automationId: z.string().regex(/^[a-f\d]{24}$/i),
  }),
  body: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      vmIds: vmIdsBody.optional(),
      startTime: z.string().regex(timeRegex).optional(),
      stopTime: z.string().regex(timeRegex).optional(),
      startDate: z.string().regex(dateRegex).optional(),
      endDate: z.string().regex(dateRegex).optional(),
      timezone: z.string().min(1).max(64).optional(),
      isActive: z.boolean().optional(),
    })
    .refine(
      (d) => {
        if (d.startDate && d.endDate) return d.startDate <= d.endDate;
        return true;
      },
      { message: 'endDate must be on or after startDate', path: ['endDate'] }
    ),
});

export const automationIdParamSchema = z.object({
  params: z.object({
    automationId: z.string().regex(/^[a-f\d]{24}$/i),
  }),
});
