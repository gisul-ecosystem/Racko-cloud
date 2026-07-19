import { z } from 'zod';
import mongoose from 'mongoose';

export const vmIdParamSchema = z.object({
  params: z.object({
    vmId: z
      .string()
      .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid VM id' }),
  }),
});
