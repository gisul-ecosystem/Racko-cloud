import mongoose from 'mongoose';
import { MachineGroupModel } from '../../models/machineGroup.model';
import { MachineModel } from '../machine-manager/machine-manager.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface GroupResponse {
  _id: string;
  name: string;
  adminId: string;
  machineIds: string[];
  machineCount: number;
  createdAt: string;
  updatedAt: string;
}

class MachineGroupsService {
  private toResponse(doc: InstanceType<typeof MachineGroupModel>): GroupResponse {
    return {
      _id:          doc._id.toString(),
      name:         doc.name,
      adminId:      doc.adminId.toString(),
      machineIds:   doc.machineIds.map((id) => id.toString()),
      machineCount: doc.machineIds.length,
      createdAt:    doc.createdAt.toISOString(),
      updatedAt:    doc.updatedAt.toISOString(),
    };
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(name: string, adminId: mongoose.Types.ObjectId): Promise<GroupResponse> {
    const exists = await MachineGroupModel.findOne({ adminId, name: name.trim() });
    if (exists) throw new ValidationError(`A group named "${name}" already exists.`);

    const doc = await MachineGroupModel.create({ name: name.trim(), adminId, machineIds: [] });
    logger.info('[MachineGroups] Group created', { groupId: doc._id.toString(), name });
    return this.toResponse(doc);
  }

  // ── List ────────────────────────────────────────────────────────────────────

  async list(adminId: mongoose.Types.ObjectId): Promise<GroupResponse[]> {
    const docs = await MachineGroupModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((d) => this.toResponse(d));
  }

  // ── Get one ─────────────────────────────────────────────────────────────────

  async getOne(id: mongoose.Types.ObjectId, adminId: mongoose.Types.ObjectId): Promise<GroupResponse> {
    const doc = await this.findOwned(id, adminId);
    return this.toResponse(doc);
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  async rename(id: mongoose.Types.ObjectId, name: string, adminId: mongoose.Types.ObjectId): Promise<GroupResponse> {
    const doc = await this.findOwned(id, adminId);

    const conflict = await MachineGroupModel.findOne({ adminId, name: name.trim(), _id: { $ne: id } });
    if (conflict) throw new ValidationError(`A group named "${name}" already exists.`);

    doc.name = name.trim();
    await doc.save();
    return this.toResponse(doc);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async delete(id: mongoose.Types.ObjectId, adminId: mongoose.Types.ObjectId): Promise<void> {
    const doc = await this.findOwned(id, adminId);
    // Remove groupId from all machines in this group
    await MachineModel.updateMany({ groupId: id }, { $unset: { groupId: '' } });
    await doc.deleteOne();
    logger.info('[MachineGroups] Group deleted', { groupId: id.toString() });
  }

  // ── Add machines ────────────────────────────────────────────────────────────

  async addMachines(
    id: mongoose.Types.ObjectId,
    machineIds: string[],
    adminId: mongoose.Types.ObjectId,
  ): Promise<GroupResponse> {
    const doc = await this.findOwned(id, adminId);

    // Verify all machines belong to this admin
    for (const machineId of machineIds) {
      const machine = await MachineModel.findById(machineId).lean();
      if (!machine) throw new ValidationError(`Machine ${machineId} not found.`);
      if (machine.adminId.toString() !== adminId.toString()) {
        throw new ForbiddenError(`Machine ${machineId} does not belong to your account.`);
      }
    }

    const objectIds = machineIds.map((m) => new mongoose.Types.ObjectId(m));

    // Add to group (no duplicates)
    const existing = new Set(doc.machineIds.map((m) => m.toString()));
    for (const oid of objectIds) {
      if (!existing.has(oid.toString())) {
        doc.machineIds.push(oid);
      }
    }
    await doc.save();

    // Set groupId on each machine
    await MachineModel.updateMany(
      { _id: { $in: objectIds }, adminId },
      { groupId: id },
    );

    logger.info('[MachineGroups] Machines added to group', { groupId: id.toString(), count: machineIds.length });
    return this.toResponse(doc);
  }

  // ── Remove machines ─────────────────────────────────────────────────────────

  async removeMachines(
    id: mongoose.Types.ObjectId,
    machineIds: string[],
    adminId: mongoose.Types.ObjectId,
  ): Promise<GroupResponse> {
    const doc = await this.findOwned(id, adminId);
    const removeSet = new Set(machineIds);
    doc.machineIds = doc.machineIds.filter((m) => !removeSet.has(m.toString()));
    await doc.save();

    // Clear groupId on removed machines
    await MachineModel.updateMany(
      { _id: { $in: machineIds.map((m) => new mongoose.Types.ObjectId(m)) } },
      { $unset: { groupId: '' } },
    );

    logger.info('[MachineGroups] Machines removed from group', { groupId: id.toString(), count: machineIds.length });
    return this.toResponse(doc);
  }

  // ── List machines in a group ────────────────────────────────────────────────

  async listMachines(id: mongoose.Types.ObjectId, adminId: mongoose.Types.ObjectId) {
    const doc = await this.findOwned(id, adminId);
    const machines = await MachineModel.find({
      _id: { $in: doc.machineIds },
      deleted: { $ne: true },
    }, { _id: 1, name: 1, status: 1, os: 1, ipAddress: 1 }).lean();
    return machines;
  }

  // ── Private helper ──────────────────────────────────────────────────────────

  private async findOwned(id: mongoose.Types.ObjectId, adminId: mongoose.Types.ObjectId) {
    const doc = await MachineGroupModel.findById(id);
    if (!doc) throw new NotFoundError('Group not found.');
    if (doc.adminId.toString() !== adminId.toString()) throw new ForbiddenError('Access denied.');
    return doc;
  }
}

export const machineGroupsService = new MachineGroupsService();
