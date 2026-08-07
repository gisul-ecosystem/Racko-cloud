import mongoose, { Document, Schema } from 'mongoose';

export interface IMachineGroup extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  adminId: mongoose.Types.ObjectId;
  machineIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const machineGroupSchema = new Schema<IMachineGroup>(
  {
    name:       { type: String, required: true, trim: true, maxlength: 100 },
    adminId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    machineIds: [{ type: Schema.Types.ObjectId, ref: 'Machine' }],
  },
  {
    strict: true,
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  }
);

// Unique group name per admin
machineGroupSchema.index({ adminId: 1, name: 1 }, { unique: true });

export const MachineGroupModel = mongoose.model<IMachineGroup>('MachineGroup', machineGroupSchema);
