import { z } from 'zod';

export const listNotificationsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    unreadOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  }),
});

export const notificationIdParamSchema = z.object({
  params: z.object({
    notificationId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid notification ID.'),
  }),
});
