import mongoose from 'mongoose';
import { AdminVmTemplate } from './adminVmTemplate.model';
import { VM } from '../vm/vm.model';
import { proxmoxClient } from '../../utils/proxmoxClient';
import { pollTask } from '../vm/helpers/taskPoller';
import { logger } from '../../utils/logger';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';

function serialize(doc: InstanceType<typeof AdminVmTemplate>) {
  return {
    _id: doc._id.toString(),
    adminId: doc.adminId.toString(),
    name: doc.name,
    sourceVmId: doc.sourceVmId.toString(),
    sourceVmName: doc.sourceVmName,
    proxmoxVmid: doc.proxmoxVmid ?? null,
    node: doc.node ?? null,
    status: doc.status,
    errorMessage: doc.errorMessage ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class AdminVmTemplateService {
  async list(adminId: string) {
    const docs = await AdminVmTemplate.find({
      adminId: new mongoose.Types.ObjectId(adminId),
    })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((d) => serialize(d as InstanceType<typeof AdminVmTemplate>));
  }

  async create(adminId: string, sourceVmId: string, name: string) {
    const adminObjectId = new mongoose.Types.ObjectId(adminId);

    // Fix 3 — block concurrent creations
    const inProgress = await AdminVmTemplate.exists({
      adminId: adminObjectId,
      status: 'creating',
    });
    if (inProgress) {
      throw new ValidationError(
        'A template is already being created. Please wait for it to finish.'
      );
    }

    const vm = await VM.findOne({
      _id: new mongoose.Types.ObjectId(sourceVmId),
      adminId: adminObjectId,
      status: { $nin: ['deleting', 'deleted'] },
    });

    if (!vm) {
      throw new NotFoundError('VM not found or not accessible.');
    }

    if (['creating', 'deleting', 'deleted', 'delete_failed'].includes(vm.status)) {
      throw new ValidationError(`Cannot create a template from a VM in '${vm.status}' state.`);
    }

    // Create the DB record immediately so the UI shows 'creating'
    const doc = await AdminVmTemplate.create({
      adminId: adminObjectId,
      name: name.trim(),
      sourceVmId: vm._id,
      sourceVmName: vm.name,
      status: 'creating',
    });

    // Fire async — do not await
    void this.buildTemplate(doc._id, vm.vmid, vm.node, adminObjectId);

    return serialize(doc);
  }

  private async buildTemplate(
    docId: mongoose.Types.ObjectId,
    sourceVmid: number,
    node: string,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    let newVmid: number | undefined;

    try {
      // 1. Stop source VM if running — ensures disk consistency before clone
      const statusResp = await proxmoxClient.get<{ data: { status: string } }>(
        `/nodes/${node}/qemu/${sourceVmid}/status/current`
      );
      const wasRunning = statusResp.data.data.status === 'running';

      if (wasRunning) {
        const shutdownResp = await proxmoxClient.post<{ data: string }>(
          `/nodes/${node}/qemu/${sourceVmid}/status/shutdown`,
          {}
        );
        const shutdownPoll = await pollTask(shutdownResp.data.data, node);
        if (shutdownPoll.result !== 'success') {
          throw new Error('Failed to stop source VM before cloning.');
        }
        logger.info('[AdminVmTemplate] Source VM stopped before clone', {
          docId: docId.toString(),
          sourceVmid,
        });
      }

      // 2. Get next available Proxmox VMID
      const nextIdResp = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
      newVmid = nextIdResp.data.data;

      // 3. Full clone of the source VM into a new VMID
      const cloneResp = await proxmoxClient.post<{ data: string }>(
        `/nodes/${node}/qemu/${sourceVmid}/clone`,
        { newid: newVmid, name: `admin-tpl-${newVmid}`, full: 1 }
      );
      const clonePoll = await pollTask(cloneResp.data.data, node);

      if (clonePoll.result !== 'success') {
        throw new Error(`Proxmox clone task failed (${clonePoll.exitstatus ?? 'unknown'}).`);
      }

      // 4. Restart source VM if it was running before
      if (wasRunning) {
        try {
          const startResp = await proxmoxClient.post<{ data: string }>(
            `/nodes/${node}/qemu/${sourceVmid}/status/start`,
            {}
          );
          await pollTask(startResp.data.data, node);
          logger.info('[AdminVmTemplate] Source VM restarted after clone', {
            docId: docId.toString(),
            sourceVmid,
          });
        } catch (restartErr) {
          // Non-fatal — template clone succeeded, log and continue
          logger.warn('[AdminVmTemplate] Failed to restart source VM after clone', {
            docId: docId.toString(),
            sourceVmid,
            error: restartErr instanceof Error ? restartErr.message : String(restartErr),
          });
        }
      }

      // 5. Convert the clone to a template
      await proxmoxClient.post(`/nodes/${node}/qemu/${newVmid}/template`, {});

      // 6. Mark as ready
      await AdminVmTemplate.findByIdAndUpdate(docId, {
        proxmoxVmid: newVmid,
        node,
        status: 'ready',
        errorMessage: undefined,
      });

      logger.info('[AdminVmTemplate] Template created', {
        docId: docId.toString(),
        adminId: adminId.toString(),
        sourceVmid,
        newVmid,
        node,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AdminVmTemplate] Template creation failed', {
        docId: docId.toString(),
        sourceVmid,
        node,
        error: message,
      });

      // If clone succeeded but convert failed, clean up the orphaned clone
      if (newVmid !== undefined) {
        try {
          const delResp = await proxmoxClient.delete<{ data: string }>(
            `/nodes/${node}/qemu/${newVmid}`
          );
          await pollTask(delResp.data.data, node);
          logger.info('[AdminVmTemplate] Cleaned up orphaned clone after failure', {
            docId: docId.toString(),
            newVmid,
          });
        } catch (cleanupErr) {
          logger.warn('[AdminVmTemplate] Failed to clean up orphaned clone', {
            docId: docId.toString(),
            newVmid,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
      }

      await AdminVmTemplate.findByIdAndUpdate(docId, {
        status: 'failed',
        errorMessage: message,
      });
    }
  }

  async delete(adminId: string, templateId: string) {
    const doc = await AdminVmTemplate.findById(templateId);
    if (!doc) throw new NotFoundError('Template not found.');
    if (doc.adminId.toString() !== adminId) {
      throw new ForbiddenError('You do not have permission to delete this template.');
    }

    // Fix 5 — attempt Proxmox cleanup for both 'ready' and 'failed' states
    // (failed templates may have a proxmoxVmid if clone succeeded before convert failed)
    if (doc.proxmoxVmid && doc.node && ['ready', 'failed'].includes(doc.status)) {
      try {
        const resp = await proxmoxClient.delete<{ data: string }>(
          `/nodes/${doc.node}/qemu/${doc.proxmoxVmid}`
        );
        await pollTask(resp.data.data, doc.node);
      } catch (err) {
        logger.warn('[AdminVmTemplate] Proxmox delete failed — removing DB record anyway', {
          templateId,
          proxmoxVmid: doc.proxmoxVmid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await doc.deleteOne();
  }
}

export const adminVmTemplateService = new AdminVmTemplateService();
