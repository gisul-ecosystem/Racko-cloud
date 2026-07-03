import mongoose from 'mongoose';
import { AdminVmTemplate } from './adminVmTemplate.model';
import { VM } from '../vm/vm.model';
import { proxmoxClient } from '../../utils/proxmoxClient';
import { pollTask } from '../vm/helpers/taskPoller';
import { runSysprepAndShutdown } from '../vm/helpers/softwareProvisioner';
import { logger } from '../../utils/logger';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import type { AdminVmTemplateBuildStep } from './adminVmTemplate.model';
import { emitTemplateBuildEvent } from './adminVmTemplate.events';

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
    buildStep: doc.buildStep ?? null,
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

    const setStep = (step: AdminVmTemplateBuildStep) => {
      emitTemplateBuildEvent(docId.toString(), { buildStep: step, status: 'creating' });
      return AdminVmTemplate.findByIdAndUpdate(docId, { buildStep: step });
    };

    try {
      // Step 1 — Stop source VM if running (ensures disk consistency)
      const statusResp = await proxmoxClient.get<{ data: { status: string } }>(
        `/nodes/${node}/qemu/${sourceVmid}/status/current`
      );
      const wasRunning = statusResp.data.data.status === 'running';

      if (wasRunning) {
        await setStep('stopping_source');
        const shutdownResp = await proxmoxClient.post<{ data: string }>(
          `/nodes/${node}/qemu/${sourceVmid}/status/shutdown`,
          {}
        );
        const shutdownPoll = await pollTask(shutdownResp.data.data, node);
        if (shutdownPoll.result !== 'success') {
          throw new Error('Failed to stop source VM before cloning.');
        }
        logger.info('[AdminVmTemplate] Source VM stopped before clone', {
          docId: docId.toString(), sourceVmid,
        });
      }

      // Step 2 — Full clone source VM into new VMID
      await setStep('cloning');
      const nextIdResp = await proxmoxClient.get<{ data: number }>('/cluster/nextid');
      newVmid = nextIdResp.data.data;

      const cloneResp = await proxmoxClient.post<{ data: string }>(
        `/nodes/${node}/qemu/${sourceVmid}/clone`,
        { newid: newVmid, name: `admin-tpl-${newVmid}`, full: 1 }
      );
      const clonePoll = await pollTask(cloneResp.data.data, node);
      if (clonePoll.result !== 'success') {
        throw new Error(`Proxmox clone task failed (${clonePoll.exitstatus ?? 'unknown'}).`);
      }

      // Step 3 — Restart source VM if it was running
      await setStep('starting_source');
      if (wasRunning) {
        try {
          const startResp = await proxmoxClient.post<{ data: string }>(
            `/nodes/${node}/qemu/${sourceVmid}/status/start`,
            {}
          );
          await pollTask(startResp.data.data, node);
          logger.info('[AdminVmTemplate] Source VM restarted after clone', {
            docId: docId.toString(), sourceVmid,
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

      // Detect OS type from the cloned VM config to decide whether Sysprep is needed.
      // Windows guests require Sysprep to generalize the image (strip SID, hostname, etc.).
      // Linux guests rely on cloud-init running on first boot — no equivalent step needed.
      const cloneConfigResp = await proxmoxClient.get<{ data: { ostype?: string } }>(
        `/nodes/${node}/qemu/${newVmid}/config`
      );
      const ostype = cloneConfigResp.data.data.ostype ?? '';
      const isWindows = /^win/i.test(ostype);

      logger.info('[AdminVmTemplate] Detected OS type from clone config', {
        docId: docId.toString(), newVmid, ostype, isWindows,
      });

      // Step 4 — Boot clone and run Sysprep (Windows only)
      if (isWindows) {
        await setStep('running_sysprep');
        await runSysprepAndShutdown(node, newVmid, docId.toString());
        logger.info('[AdminVmTemplate] Sysprep completed on clone', {
          docId: docId.toString(), newVmid, node,
        });
      } else {
        logger.info('[AdminVmTemplate] Skipping Sysprep — non-Windows OS, cloud-init will generalize on first boot', {
          docId: docId.toString(), newVmid, node, ostype,
        });
      }

      // Step 5 — Convert the shut-down Sysprep'd clone to a Proxmox template
      // Clear cloud-init fields inherited from the source VM before converting.
      // ipconfig0 and cipassword are instance-specific — the template must not carry them.
      // VMs created from this template will have their own IP and password injected at creation.
      await setStep('converting');
      await proxmoxClient.post(`/nodes/${node}/qemu/${newVmid}/config`, {
        delete: 'ipconfig0,cipassword',
      });
      logger.info('[AdminVmTemplate] Cleared cloud-init IP and password from clone', {
        docId: docId.toString(), newVmid, node,
      });

      await proxmoxClient.post(`/nodes/${node}/qemu/${newVmid}/template`, {});

      // Mark as ready and clear build step
      await AdminVmTemplate.findByIdAndUpdate(docId, {
        proxmoxVmid: newVmid,
        node,
        status: 'ready',
        buildStep: null,
        errorMessage: undefined,
      });
      emitTemplateBuildEvent(docId.toString(), { buildStep: null, status: 'ready' });

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
        docId: docId.toString(), sourceVmid, node, error: message,
      });

      // Clean up orphaned clone if it was created
      if (newVmid !== undefined) {
        try {
          // Ensure clone is stopped before deleting
          try {
            const cloneStatus = await proxmoxClient.get<{ data: { status: string } }>(
              `/nodes/${node}/qemu/${newVmid}/status/current`
            );
            if (cloneStatus.data.data.status === 'running') {
              const stopResp = await proxmoxClient.post<{ data: string }>(
                `/nodes/${node}/qemu/${newVmid}/status/stop`, {}
              );
              await pollTask(stopResp.data.data, node);
            }
          } catch {
            // best-effort stop
          }
          const delResp = await proxmoxClient.delete<{ data: string }>(
            `/nodes/${node}/qemu/${newVmid}`
          );
          await pollTask(delResp.data.data, node);
          logger.info('[AdminVmTemplate] Cleaned up orphaned clone after failure', {
            docId: docId.toString(), newVmid,
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
        buildStep: null,
        errorMessage: message,
      });
      emitTemplateBuildEvent(docId.toString(), { buildStep: null, status: 'failed', errorMessage: message });
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
