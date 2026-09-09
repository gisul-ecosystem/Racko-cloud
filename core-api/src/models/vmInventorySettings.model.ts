import mongoose, { Document, Schema } from 'mongoose';

/**
 * Single settings document for the super-admin VM inventory.
 *
 * Only one row ever exists — read it with `getVmInventorySettings()`, which
 * creates it on first use.
 */
export interface IVmInventorySettings extends Document {
  _id: mongoose.Types.ObjectId;
  /** Who gets told that provider contracts are about to lapse. */
  providerExpiryRecipients: string[];
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const vmInventorySettingsSchema = new Schema<IVmInventorySettings>(
  {
    providerExpiryRecipients: { type: [String], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'vm_inventory_settings' }
);

export const VmInventorySettingsModel = mongoose.model<IVmInventorySettings>(
  'VmInventorySettings',
  vmInventorySettingsSchema
);

/** The settings row, created empty the first time anything asks for it. */
export async function getVmInventorySettings(): Promise<IVmInventorySettings> {
  const existing = await VmInventorySettingsModel.findOne();
  if (existing) return existing;
  return VmInventorySettingsModel.create({ providerExpiryRecipients: [] });
}
