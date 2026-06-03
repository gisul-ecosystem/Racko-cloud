import { logger } from '../../../utils/logger';
import { VM } from '../vm.model';
import { scheduleSoftwareInstall } from './softwareQueue';
import { config } from '../../../config';

/**
 * Finds VMs with software stuck in 'installing' (provisioner crashed mid-install)
 * and re-queues them. Runs on a fixed interval.
 *
 * 'pending' items are also re-queued if the initial provisioner never ran
 * (e.g. API restarted immediately after VM creation).
 */

const SWEEP_INTERVAL_MS = config.SOFTWARE_SWEEPER_INTERVAL_MS;
const STUCK_INSTALLING_MS = config.SOFTWARE_STUCK_INSTALLING_MS;
const STUCK_PENDING_MS = config.SOFTWARE_STUCK_PENDING_MS;
const SWEEP_BATCH = 25;

export function startSoftwareSweeper(): void {
  setInterval(() => {
    void sweepStuckSoftwareInstalls().catch((err: unknown) => {
      logger.warn('[Software] sweeper tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, SWEEP_INTERVAL_MS);
  logger.info('[Software] sweeper started', { intervalMs: SWEEP_INTERVAL_MS });
}

async function sweepStuckSoftwareInstalls(): Promise<void> {
  const stuckInstallingCutoff = new Date(Date.now() - STUCK_INSTALLING_MS);

  // VMs that have any install stuck in 'installing' for too long
  const stuckVms = await VM.find({
    softwareInstalls: {
      $elemMatch: {
        status: 'installing',
        // No installedAt means it was set to installing but never completed
        installedAt: { $exists: false },
      },
    },
    updatedAt: { $lt: stuckInstallingCutoff },
  })
    .select('_id node vmid name adminId softwareInstalls')
    .limit(SWEEP_BATCH)
    .lean();

  // VMs that have pending installs but were created long enough ago that
  // the initial provisioner should have run already
  const stuckPendingCutoff = new Date(Date.now() - STUCK_PENDING_MS);
  const pendingVms = await VM.find({
    'softwareInstalls.status': 'pending',
    status: { $in: ['running', 'stopped'] },
    createdAt: { $lt: stuckPendingCutoff },
  })
    .select('_id node vmid name adminId softwareInstalls')
    .limit(SWEEP_BATCH)
    .lean();

  const allVms = [
    ...stuckVms,
    // avoid duplicates
    ...pendingVms.filter((p) => !stuckVms.some((s) => s._id.equals(p._id))),
  ];

  for (const vm of allVms) {
    const maxAttempts = config.SOFTWARE_MAX_SWEEPER_ATTEMPTS;

    // Check if any package has exceeded max attempts — mark those as permanently failed
    const exceededIds = vm.softwareInstalls
      .filter((s) => (s.status === 'pending' || s.status === 'installing') && (s.sweeperAttempts ?? 0) >= maxAttempts)
      .map((s) => s.softwareId);

    if (exceededIds.length > 0) {
      await VM.updateOne(
        { _id: vm._id },
        {
          $set: {
            'softwareInstalls.$[el].status': 'failed',
            'softwareInstalls.$[el].lastError': `Install did not complete after ${maxAttempts} sweeper attempts. Check VM connectivity and script.`,
          },
        },
        { arrayFilters: [{ 'el.softwareId': { $in: exceededIds }, 'el.status': { $in: ['pending', 'installing'] } }] }
      );
      logger.warn('[Software] sweeper — max attempts reached, marking failed', {
        vmid: vm.vmid,
        node: vm.node,
        count: exceededIds.length,
      });
    }

    // For remaining stuck installs, increment attempt count and reset installing → pending
    const hasStuckInstalling = vm.softwareInstalls.some(
      (s) => s.status === 'installing' && (s.sweeperAttempts ?? 0) < maxAttempts
    );
    if (hasStuckInstalling) {
      await VM.updateOne(
        { _id: vm._id },
        {
          $set: { 'softwareInstalls.$[el].status': 'pending' },
          $inc: { 'softwareInstalls.$[el].sweeperAttempts': 1 },
        },
        { arrayFilters: [{ 'el.status': 'installing', 'el.sweeperAttempts': { $lt: maxAttempts } }] }
      );
      logger.info('[Software] sweeper — reset stuck installing → pending', { vmid: vm.vmid, node: vm.node });
    }

    // Increment attempt count for stuck pending items under the limit
    await VM.updateOne(
      { _id: vm._id },
      { $inc: { 'softwareInstalls.$[el].sweeperAttempts': 1 } },
      { arrayFilters: [{ 'el.status': 'pending', 'el.sweeperAttempts': { $lt: maxAttempts } }] }
    );

    // Only re-queue if there are still retryable items
    const hasRetryable = vm.softwareInstalls.some(
      (s) => (s.status === 'pending' || s.status === 'installing') && (s.sweeperAttempts ?? 0) < maxAttempts
    );
    if (!hasRetryable) continue;

    logger.info('[Software] sweeper — re-queuing install', {
      vmid: vm.vmid, node: vm.node,
    });
    scheduleSoftwareInstall({
      vmObjectId: vm._id,
      node: vm.node,
      vmid: vm.vmid,
      adminId: vm.adminId,
      vmName: vm.name,
    });
  }
}
