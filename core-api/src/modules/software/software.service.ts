import mongoose from 'mongoose';
import { Software } from './software.model';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { CreateSoftwareInput, UpdateSoftwareInput } from './software.validation';

export class SoftwareService {
  /** List all active software entries (public — shown on VM create page). */
  async listActive() {
    return Software.find({ isActive: true }).sort({ name: 1 }).lean();
  }

  /** List all software entries including inactive (super admin only). */
  async listAll() {
    return Software.find().sort({ name: 1 }).lean();
  }

  async getById(softwareId: mongoose.Types.ObjectId) {
    const sw = await Software.findById(softwareId).lean();
    if (!sw) throw new NotFoundError(`Software ${softwareId.toString()} not found.`);
    return sw;
  }

  async create(dto: CreateSoftwareInput, createdBy: mongoose.Types.ObjectId) {
    // Auto-generate slug from name if not provided
    const slug = dto.slug ?? dto.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const existing = await Software.findOne({ slug }).lean();
    if (existing) throw new ValidationError(`A software entry with the name "${dto.name}" already exists.`);

    return Software.create({ ...dto, slug, createdBy });
  }

  async update(softwareId: mongoose.Types.ObjectId, dto: UpdateSoftwareInput) {
    const sw = await Software.findByIdAndUpdate(
      softwareId,
      { $set: dto },
      { new: true, runValidators: true }
    ).lean();
    if (!sw) throw new NotFoundError(`Software ${softwareId.toString()} not found.`);
    return sw;
  }

  async deactivate(softwareId: mongoose.Types.ObjectId) {
    const sw = await Software.findByIdAndUpdate(
      softwareId,
      { $set: { isActive: false } },
      { new: true }
    ).lean();
    if (!sw) throw new NotFoundError(`Software ${softwareId.toString()} not found.`);
    return sw;
  }

  /** Validate that all provided IDs exist and are active. Used at VM create time. */
  async validateIds(ids: mongoose.Types.ObjectId[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await Software.find({ _id: { $in: ids }, isActive: true }).select('_id').lean();
    if (found.length !== ids.length) {
      throw new ValidationError('One or more selected software packages are invalid or inactive.');
    }
  }

  /** Fetch full docs for a set of IDs (used by the provisioner). */
  async getByIds(ids: mongoose.Types.ObjectId[]) {
    return Software.find({ _id: { $in: ids } }).lean();
  }
}

export const softwareService = new SoftwareService();
