/**
 * TrackerService — server-side logic for:
 *   - Receiving + storing baseline snapshots from agents
 *   - Receiving + storing activity events from agents
 *   - Proxying file uploads to SeaweedFS
 *   - Proxying file downloads from SeaweedFS
 *   - Building clone replay manifests
 *   - Triggering clone replay on target machines
 *   - Clearing activity log on reset
 */

import mongoose from 'mongoose';
import { Readable } from 'stream';
import { MachineBaselineModel } from '../../models/machineBaseline.model';
import { MachineActivityModel, type ActivityType, type ActivityPayload } from '../../models/machineActivity.model';
import { MachineModel } from './machine-manager.model';
import { seaweedfsService } from '../../services/seaweedfs.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

// ─── Baseline ─────────────────────────────────────────────────────────────────

/**
 * Store or replace the baseline snapshot for a machine.
 * Supports chunked uploads: agent sends the file list in pages of 500.
 * Chunk 0 carries the full metadata + first file page.
 * Subsequent chunks carry only fileChunk + chunkIndex + totalChunks.
 */
export async function saveBaseline(
  agentId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const machine = await MachineModel.findOne({ agentId });
  if (!machine) {
    throw new NotFoundError(`Agent not found: ${agentId}`);
  }

  const chunkIndex  = (payload['chunkIndex']  as number) ?? 0;
  const totalChunks = (payload['totalChunks'] as number) ?? 1;
  const fileChunk   = (payload['fileChunk']   as unknown[]) ?? [];
  const baseline    = payload['baseline']     as Record<string, unknown> | null | undefined;

  if (chunkIndex === 0 && baseline) {
    // First chunk — create or replace the baseline document with metadata + first file page
    await MachineBaselineModel.findOneAndUpdate(
      { machineId: machine._id },
      {
        machineId:          machine._id,
        agentId,
        capturedAt:         baseline['capturedAt'] ?? new Date(),
        installedApps:      baseline['installedApps'] ?? [],
        files:              fileChunk,
        systemEnvVars:      baseline['systemEnvVars'] ?? [],
        userEnvVars:        baseline['userEnvVars'] ?? [],
        scheduledTasks:     baseline['scheduledTasks'] ?? [],
        services:           baseline['services'] ?? [],
        programFolders:     baseline['programFolders'] ?? [],
        programDataFolders: baseline['programDataFolders'] ?? [],
      },
      { upsert: true, new: true }
    );
  } else if (chunkIndex > 0 && fileChunk.length > 0) {
    // Subsequent chunks — append file entries to the existing baseline
    await MachineBaselineModel.findOneAndUpdate(
      { machineId: machine._id },
      { $push: { files: { $each: fileChunk } } }
    );
  }

  logger.info('[Tracker] Baseline chunk saved', {
    machineId:   machine._id.toString(),
    agentId,
    chunkIndex,
    totalChunks,
    fileCount:   fileChunk.length,
  });
}

// ─── Activity ─────────────────────────────────────────────────────────────────

/**
 * Append a single activity event for a machine.
 * The sequence number is auto-incremented per machine using MongoDB's
 * findOneAndUpdate + $inc pattern so events are always ordered correctly
 * even under concurrent writes.
 *
 * For file_rename events: automatically deletes the old path's S3 object
 * to prevent storage accumulation when files are renamed multiple times.
 */
export async function appendActivity(
  agentId: string,
  type: ActivityType,
  payload: ActivityPayload,
  timestamp: Date
): Promise<void> {
  const machine = await MachineModel.findOne({ agentId });
  if (!machine) {
    throw new NotFoundError(`Agent not found: ${agentId}`);
  }

  // Rename deduplication: when a file is renamed, delete the old S3 object
  // so storage doesn't accumulate with each rename. We find the most recent
  // file_write for the old path and delete its storageRef from S3.
  if (type === 'file_rename') {
    const renamePayload = payload as { oldPath?: string; newPath?: string };
    if (renamePayload.oldPath) {
      const oldActivity = await MachineActivityModel.findOne({
        machineId: machine._id,
        type: 'file_write',
        'payload.path': renamePayload.oldPath,
      }).sort({ sequence: -1 }); // most recent first

      if (oldActivity) {
        const oldPayload = oldActivity.payload as { storageRef?: string };
        if (oldPayload.storageRef) {
          // Delete from S3 — best-effort, non-fatal
          try {
            await seaweedfsService.delete(oldPayload.storageRef);
            logger.info('[Tracker] Deleted old S3 object on rename', {
              oldPath: renamePayload.oldPath,
              storageRef: oldPayload.storageRef,
            });
          } catch (err) {
            logger.warn('[Tracker] Could not delete old S3 object on rename (non-fatal)', {
              oldPath: renamePayload.oldPath,
              storageRef: oldPayload.storageRef,
              err,
            });
          }
        }
      }
    }
  }

  // Atomic sequence increment — stored in a small counter doc alongside activity
  const counter = await ActivityCounterModel.findOneAndUpdate(
    { machineId: machine._id },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  await MachineActivityModel.create({
    machineId: machine._id,
    agentId,
    sequence:  counter.seq,
    type,
    payload,
    timestamp,
  });
}

/**
 * Get the full activity log for a machine in sequence order.
 * Used by admins to inspect what changed, and by clone replay manifest builder.
 */
export async function getActivityLog(
  machineId: mongoose.Types.ObjectId,
  adminId: mongoose.Types.ObjectId
): Promise<unknown[]> {
  const machine = await MachineModel.findById(machineId);
  if (!machine) throw new NotFoundError('Machine not found.');
  if (machine.adminId.toString() !== adminId.toString()) {
    throw new ForbiddenError('You do not have permission to access this machine.');
  }

  const activities = await MachineActivityModel
    .find({ machineId })
    .sort({ sequence: 1 })
    .lean();

  return activities;
}

/**
 * Clear the activity log for a machine after a successful reset.
 * Also resets the sequence counter so the next activity starts from 1.
 */
export async function clearActivityLog(machineId: mongoose.Types.ObjectId): Promise<void> {
  await Promise.all([
    MachineActivityModel.deleteMany({ machineId }),
    ActivityCounterModel.deleteOne({ machineId }),
  ]);
  logger.info('[Tracker] Activity log cleared', { machineId: machineId.toString() });
}

/**
 * Generate a presigned S3 PUT URL for direct agent-to-SeaweedFS upload.
 * The agent uses this to upload files of any size directly, bypassing nginx.
 */
export async function getPresignedUploadUrl(
  agentId: string,
  sha256: string,
  filename: string,
  mimeType: string
): Promise<{ presignedUrl: string; storageRef: string }> {
  const machine = await MachineModel.findOne({ agentId });
  if (!machine) {
    throw new NotFoundError(`Agent not found: ${agentId}`);
  }

  return seaweedfsService.generatePresignedPutUrl(
    machine._id.toString(),
    sha256,
    filename,
    mimeType,
    3600 // 1 hour TTL
  );
}

// ─── File upload / download ───────────────────────────────────────────────────

/**
 * Receive a file stream from the agent, proxy it to SeaweedFS,
 * and return the storageRef (S3 object key).
 */
export async function uploadFile(
  agentId: string,
  filePath: string,
  stream: Readable,
  mimeType: string,
  sha256?: string
): Promise<{ storageRef: string; sizeBytes: number }> {
  const machine = await MachineModel.findOne({ agentId });
  if (!machine) {
    throw new NotFoundError(`Agent not found: ${agentId}`);
  }

  const filename = filePath.split('\\').pop() ?? filePath.split('/').pop() ?? 'file';

  // Collect stream into a buffer — multer already buffered it in memory
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const buffer = Buffer.concat(chunks);

  // Use provided sha256 or fall back to a timestamp-based unique key segment
  const hashSegment = sha256 || Date.now().toString(16);

  const result = await seaweedfsService.upload(
    buffer,
    machine._id.toString(),
    hashSegment,
    filename,
    mimeType
  );

  logger.info('[Tracker] File uploaded to SeaweedFS', {
    machineId:  machine._id.toString(),
    filePath,
    storageRef: result.storageRef,
    sizeBytes:  result.sizeBytes,
  });

  return result;
}

/**
 * Proxy a file download from SeaweedFS to the agent during clone replay.
 * Returns a stream the route handler pipes directly to the HTTP response.
 */
export async function downloadFile(
  storageRef: string,
  agentId: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength: number | null }> {
  const machine = await MachineModel.findOne({ agentId });
  if (!machine) {
    throw new NotFoundError(`Agent not found: ${agentId}`);
  }

  if (!storageRef || typeof storageRef !== 'string') {
    throw new ValidationError('storageRef is required.');
  }

  return seaweedfsService.download(storageRef);
}

// ─── Clone replay ─────────────────────────────────────────────────────────────

/**
 * Build the clone replay manifest for a source machine and send it to the target
 * machine's agent via WebSocket.
 *
 * @param sourceMachineId  The machine whose activity log will be replayed
 * @param targetMachineId  The machine that will receive and replay the changes
 * @param adminId          Owning admin (for ownership checks)
 */
export async function triggerCloneReplay(
  sourceMachineId: mongoose.Types.ObjectId,
  targetMachineId: mongoose.Types.ObjectId,
  adminId: mongoose.Types.ObjectId,
  sessionId: string
): Promise<{ accepted: boolean; reason?: string }> {
  // Ownership checks
  const source = await MachineModel.findById(sourceMachineId);
  if (!source) throw new NotFoundError('Source machine not found.');
  if (source.adminId.toString() !== adminId.toString()) {
    throw new ForbiddenError('You do not own the source machine.');
  }

  const target = await MachineModel.findById(targetMachineId);
  if (!target) throw new NotFoundError('Target machine not found.');
  if (target.adminId.toString() !== adminId.toString()) {
    throw new ForbiddenError('You do not own the target machine.');
  }

  if (!target.agentId) {
    return { accepted: false, reason: 'Target machine has no registered agent.' };
  }

  const { wsManager } = await import('./websocket/wsManager');
  if (!wsManager.isConnected(target.agentId)) {
    return { accepted: false, reason: 'Target agent is offline.' };
  }

  // Send clone_replay command to target agent
  wsManager.sendCloneReplay(target.agentId, sessionId, sourceMachineId.toString());

  logger.info('[Tracker] Clone replay triggered', {
    sourceMachineId: sourceMachineId.toString(),
    targetMachineId: targetMachineId.toString(),
    sessionId,
  });

  return { accepted: true };
}

/**
 * Build and return the clone manifest for a source machine.
 * Called by the agent on the target VM to fetch what it needs to replay.
 */
export async function getCloneManifest(
  sourceMachineId: string,
  sessionId: string,
  agentId: string
): Promise<unknown> {
  // Validate the requesting agent is a real machine
  const requestingMachine = await MachineModel.findOne({ agentId });
  if (!requestingMachine) {
    throw new NotFoundError(`Agent not found: ${agentId}`);
  }

  const sourceId = new mongoose.Types.ObjectId(sourceMachineId);
  const activities = await MachineActivityModel
    .find({ machineId: sourceId })
    .sort({ sequence: 1 })
    .lean();

  logger.info('[Tracker] Clone manifest requested', {
    sourceMachineId,
    sessionId,
    requestingAgentId: agentId,
    activityCount: activities.length,
  });

  return {
    sourceMachineId,
    sessionId,
    activities: activities.map((a) => ({
      type:      a.type,
      timestamp: a.timestamp,
      payload:   a.payload,
    })),
  };
}

/**
 * Handle clone-install request from the target agent.
 * Creates an install job for the software catalog item on the target machine.
 */
export async function createCloneInstallJob(
  agentId: string,
  softwareCatalogId: string
): Promise<void> {
  const machine = await MachineModel.findOne({ agentId });
  if (!machine) throw new NotFoundError(`Agent not found: ${agentId}`);

  const { JobModel } = await import('./machine-manager.model');
  const softwareObjectId = new mongoose.Types.ObjectId(softwareCatalogId);

  const existing = await JobModel.findOne({
    machineId: machine._id,
    softwareIds: [softwareObjectId],
    status: { $in: ['pending', 'installing'] },
  });
  if (existing) return; // already queued

  const job = await JobModel.create({
    machineId:   machine._id,
    softwareIds: [softwareObjectId],
    adminId:     machine.adminId,
  });

  // Push to agent immediately if connected
  const { wsManager } = await import('./websocket/wsManager');
  if (wsManager.isConnected(agentId)) {
    wsManager.pushJob(agentId, {
      _id:         job._id.toString(),
      machineId:   job.machineId.toString(),
      softwareIds: job.softwareIds.map((id) => id.toString()),
      status:      job.status,
      logs:        job.logs,
      attempts:    job.attempts,
    });
  }

  logger.info('[Tracker] Clone install job created', {
    machineId:         machine._id.toString(),
    softwareCatalogId,
    jobId:             job._id.toString(),
  });
}

// ─── Activity sequence counter (internal) ────────────────────────────────────
// A small MongoDB collection that tracks the last sequence number per machine.
// Using a dedicated doc + $inc ensures atomic increment without collisions.

interface IActivityCounter {
  machineId: mongoose.Types.ObjectId;
  seq: number;
}

const activityCounterSchema = new mongoose.Schema<IActivityCounter>({
  machineId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, unique: true },
  seq:       { type: Number, default: 0 },
});

const ActivityCounterModel = mongoose.model<IActivityCounter>(
  'ActivityCounter',
  activityCounterSchema
);
