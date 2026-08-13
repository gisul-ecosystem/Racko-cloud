import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const machineOSEnum = z.enum(['windows', 'linux', 'macos']);

const installMethodEnum = z.enum(
  ['apt', 'brew', 'choco', 'winget', 'msi', 'exe', 'zip', 'script'],
  { required_error: 'installMethod is required' }
);

export const createSoftwareCatalogSchema = z.object({
  body: z.object({
    name:          z.string({ required_error: 'name is required' }).min(1).max(100).trim(),
    version:       z.string().max(50).trim().optional().default('latest'),
    iconUrl:       z.string().url('iconUrl must be a valid URL').optional(),
    supportedOS:   z.array(machineOSEnum).min(1, 'At least one supported OS is required'),
    installMethod: installMethodEnum,
    // Package manager identifiers
    wingetId:    z.string().max(200).trim().optional(),
    aptName:     z.string().max(200).trim().optional(),
    brewName:    z.string().max(200).trim().optional(),
    chocoName:   z.string().max(200).trim().optional(),
    // File-based install
    fileUrl:     z.string().url('fileUrl must be a valid URL').optional(),
    fileName:    z.string().max(256).trim().optional(),
    // Extra args
    installArgs: z.string().max(512).trim().optional(),
  }),
});

export const softwareCatalogIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export type CreateSoftwareCatalogInput = z.infer<typeof createSoftwareCatalogSchema>['body'];
