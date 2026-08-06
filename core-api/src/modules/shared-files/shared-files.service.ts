import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { SharedFileModel, type SharedFilePermission } from '../../models/sharedFile.model';
import { MachineModel } from '../machine-manager/machine-manager.model';
import { seaweedfsService } from '../../services/seaweedfs.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface SharedFileResponse {
  _id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageRef: string;
  sourceMachineId: string;
  sourceMachineName: string;
  adminId: string;
  permission: SharedFilePermission;
  sharedWithMachineIds: string[];
  createdAt: string;
  updatedAt: string;
}

class SharedFilesService {
  // ─── Mapper ────────────────────────────────────────────────────────────────

  private toResponse(
    doc: InstanceType<typeof SharedFileModel>,
    sourceMachineName = '',
  ): SharedFileResponse {
    return {
      _id:                  doc._id.toString(),
      fileName:             doc.fileName,
      mimeType:             doc.mimeType,
      sizeBytes:            doc.sizeBytes,
      storageRef:           doc.storageRef,
      sourceMachineId:      doc.sourceMachineId.toString(),
      sourceMachineName,
      adminId:              doc.adminId.toString(),
      permission:           doc.permission,
      sharedWithMachineIds: doc.sharedWithMachineIds.map((id) => id.toString()),
      createdAt:            doc.createdAt.toISOString(),
      updatedAt:            doc.updatedAt.toISOString(),
    };
  }

  // ─── Upload & Share ────────────────────────────────────────────────────────

  /**
   * Called by agent GUI app via POST /api/v1/agent/shared-files
   * Receives multipart file buffer, uploads to SeaweedFS, creates record.
   */
  async uploadAndShare(
    agentId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
    permission: SharedFilePermission,
    sharedWithMachineIds: string[],
  ): Promise<SharedFileResponse> {
    const sourceMachine = await MachineModel.findOne({ agentId, deleted: { $ne: true } });
    if (!sourceMachine) throw new NotFoundError('Agent not found.');

    const adminId = sourceMachine.adminId;

    // Verify all target machines belong to the same admin
    for (const machineId of sharedWithMachineIds) {
      if (!mongoose.Types.ObjectId.isValid(machineId)) {
        throw new ValidationError(`Invalid machine ID: ${machineId}`);
      }
      const target = await MachineModel.findById(machineId).lean();
      if (!target) throw new ValidationError(`Target machine ${machineId} not found.`);
      if (target.adminId.toString() !== adminId.toString()) {
        throw new ForbiddenError(`Machine ${machineId} does not belong to your account.`);
      }
    }

    // Compute sha256 for dedup key — use first 16 chars of hash(buffer)
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // Upload to SeaweedFS — stored under shared-files/ prefix
    const { storageRef, sizeBytes } = await seaweedfsService.upload(
      buffer,
      `shared-files/${sourceMachine._id.toString()}`,
      sha256,
      fileName,
      mimeType,
    );

    const doc = await SharedFileModel.create({
      fileName,
      mimeType,
      sizeBytes,
      storageRef,
      sourceMachineId:      sourceMachine._id,
      adminId,
      permission,
      sharedWithMachineIds: sharedWithMachineIds.map((id) => new mongoose.Types.ObjectId(id)),
    });

    logger.info('[SharedFiles] File uploaded and shared', {
      fileId:    doc._id.toString(),
      fileName,
      sourceId:  sourceMachine._id.toString(),
      targets:   sharedWithMachineIds.length,
      permission,
    });

    // Notify target machines via WebSocket
    await this.notifyTargets(
      doc._id.toString(),
      fileName,
      permission,
      sourceMachine.name,
      sharedWithMachineIds,
      'shared_file_added',
    );

    return this.toResponse(doc, sourceMachine.name);
  }

  // ─── List files shared WITH a machine (received files) ────────────────────

  async listForMachine(agentId: string): Promise<SharedFileResponse[]> {
    const machine = await MachineModel.findOne({ agentId, deleted: { $ne: true } });
    if (!machine) throw new NotFoundError('Agent not found.');

    const docs = await SharedFileModel.find({
      sharedWithMachineIds: machine._id,
      deleted: { $ne: true },
    }).sort({ createdAt: -1 });

    const results: SharedFileResponse[] = [];
    for (const doc of docs) {
      const src = await MachineModel.findById(doc.sourceMachineId).lean();
      results.push(this.toResponse(doc, src?.name ?? ''));
    }
    return results;
  }

  // ─── List files uploaded BY a machine (sent files) ────────────────────────

  async listByMachine(agentId: string): Promise<SharedFileResponse[]> {
    const machine = await MachineModel.findOne({ agentId, deleted: { $ne: true } });
    if (!machine) throw new NotFoundError('Agent not found.');

    const docs = await SharedFileModel.find({
      sourceMachineId: machine._id,
      deleted: { $ne: true },
    }).sort({ createdAt: -1 });

    return docs.map((d) => this.toResponse(d, machine.name));
  }

  // ─── Admin: all shared files for their account ────────────────────────────

  async listForAdmin(adminId: mongoose.Types.ObjectId): Promise<SharedFileResponse[]> {
    const docs = await SharedFileModel.find({
      adminId,
      deleted: { $ne: true },
    }).sort({ createdAt: -1 });

    const results: SharedFileResponse[] = [];
    for (const doc of docs) {
      const src = await MachineModel.findById(doc.sourceMachineId).lean();
      results.push(this.toResponse(doc, src?.name ?? ''));
    }
    return results;
  }

  // ─── Download ──────────────────────────────────────────────────────────────

  async getDownloadStream(
    fileId: string,
    agentId: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number | null;
    fileName: string;
  }> {
    const machine = await MachineModel.findOne({ agentId, deleted: { $ne: true } });
    if (!machine) throw new NotFoundError('Agent not found.');

    const doc = await SharedFileModel.findById(fileId);
    if (!doc || doc.deleted) throw new NotFoundError('Shared file not found.');

    // Access allowed for source machine or any target machine
    const isSource = doc.sourceMachineId.toString() === machine._id.toString();
    const isTarget = doc.sharedWithMachineIds.some(
      (id) => id.toString() === machine._id.toString(),
    );
    if (!isSource && !isTarget) {
      throw new ForbiddenError('This file is not shared with your machine.');
    }

    const { stream, contentType, contentLength } = await seaweedfsService.download(
      doc.storageRef,
    );

    logger.info('[SharedFiles] Download', {
      fileId,
      fileName:   doc.fileName,
      machineId:  machine._id.toString(),
      isSource,
      permission: doc.permission,
    });

    return { stream, contentType, contentLength, fileName: doc.fileName };
  }

  // ─── Admin portal download ─────────────────────────────────────────────────

  async adminGetDownloadStream(
    fileId: string,
    adminId: mongoose.Types.ObjectId,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number | null;
    fileName: string;
  }> {
    const doc = await SharedFileModel.findById(fileId);
    if (!doc || doc.deleted) throw new NotFoundError('Shared file not found.');
    if (doc.adminId.toString() !== adminId.toString()) throw new ForbiddenError('Access denied.');

    const { stream, contentType, contentLength } = await seaweedfsService.download(doc.storageRef);
    return { stream, contentType, contentLength, fileName: doc.fileName };
  }

  // ─── Update permissions / target VMs ──────────────────────────────────────

  async updateShare(
    fileId: string,
    agentId: string,
    permission?: SharedFilePermission,
    sharedWithMachineIds?: string[],
  ): Promise<SharedFileResponse> {
    const machine = await MachineModel.findOne({ agentId, deleted: { $ne: true } });
    if (!machine) throw new NotFoundError('Agent not found.');

    const doc = await SharedFileModel.findById(fileId);
    if (!doc || doc.deleted) throw new NotFoundError('Shared file not found.');
    if (doc.sourceMachineId.toString() !== machine._id.toString()) {
      throw new ForbiddenError('Only the source machine can update sharing settings.');
    }

    if (permission)           doc.permission = permission;
    if (sharedWithMachineIds) {
      doc.sharedWithMachineIds = sharedWithMachineIds.map(
        (id) => new mongoose.Types.ObjectId(id),
      );
    }
    await doc.save();

    logger.info('[SharedFiles] Share updated', {
      fileId,
      permission,
      targets: sharedWithMachineIds?.length,
    });

    if (sharedWithMachineIds) {
      await this.notifyTargets(
        fileId,
        doc.fileName,
        doc.permission,
        machine.name,
        sharedWithMachineIds,
        'shared_file_updated',
      );
    }

    return this.toResponse(doc, machine.name);
  }

  // ─── Delete (by source machine) ────────────────────────────────────────────

  async deleteFile(fileId: string, agentId: string): Promise<void> {
    const machine = await MachineModel.findOne({ agentId, deleted: { $ne: true } });
    if (!machine) throw new NotFoundError('Agent not found.');

    const doc = await SharedFileModel.findById(fileId);
    if (!doc || doc.deleted) throw new NotFoundError('Shared file not found.');
    if (doc.sourceMachineId.toString() !== machine._id.toString()) {
      throw new ForbiddenError('Only the source machine can delete this file.');
    }

    await seaweedfsService.delete(doc.storageRef);
    doc.deleted = true;
    await doc.save();

    await this.notifyTargets(
      fileId,
      doc.fileName,
      doc.permission,
      machine.name,
      doc.sharedWithMachineIds.map((id) => id.toString()),
      'shared_file_deleted',
    );

    logger.info('[SharedFiles] File deleted', { fileId, fileName: doc.fileName });
  }

  // ─── Admin delete (portal) ─────────────────────────────────────────────────

  async adminDeleteFile(
    fileId: string,
    adminId: mongoose.Types.ObjectId,
  ): Promise<void> {
    const doc = await SharedFileModel.findById(fileId);
    if (!doc || doc.deleted) throw new NotFoundError('Shared file not found.');
    if (doc.adminId.toString() !== adminId.toString()) throw new ForbiddenError('Access denied.');

    await seaweedfsService.delete(doc.storageRef);
    doc.deleted = true;
    await doc.save();

    await this.notifyTargets(
      fileId,
      doc.fileName,
      doc.permission,
      '',
      doc.sharedWithMachineIds.map((id) => id.toString()),
      'shared_file_deleted',
    );

    logger.info('[SharedFiles] Admin deleted file', { fileId });
  }

  // ─── WebSocket notifications ───────────────────────────────────────────────

  private async notifyTargets(
    fileId: string,
    fileName: string,
    permission: SharedFilePermission,
    sourceMachineName: string,
    machineIds: string[],
    eventType: string,
  ): Promise<void> {
    try {
      const { wsManager } = await import('../machine-manager/websocket/wsManager');
      for (const machineId of machineIds) {
        const machine = await MachineModel.findById(machineId).lean();
        if (!machine?.agentId || !wsManager.isConnected(machine.agentId)) continue;

        const payload = JSON.stringify({
          type: eventType,
          payload: { fileId, fileName, permission, sourceMachineName },
        });

        // Use the same pushJob pattern — direct ws.send via the connection map
        const conn = (wsManager as unknown as {
          connections: Map<string, { ws: { send: (d: string) => void; readyState: number } }>;
        }).connections.get(machine.agentId);

        conn?.ws.send(payload);
      }
    } catch (err) {
      logger.warn('[SharedFiles] Failed to notify targets via WS (non-fatal)', { err });
    }
  }
}

export const sharedFilesService = new SharedFilesService();
