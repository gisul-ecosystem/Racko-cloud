import mongoose from 'mongoose';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { VM, type IVM } from '../vm.model';
import { vmService } from '../vm.service';
import { Tenant } from '../../../models/tenant.model';
import { User } from '../../../models/user.model';
import { Notification } from '../../notification/notification.model';

let tickInProgress = false;

async function notifySuperAdminsOfExpiredVm(vm: IVM): Promise<void> {
  const [tenant, superAdmins] = await Promise.all([
    vm.tenantId ? Tenant.findById(vm.tenantId).select('name slug').lean() : null,
    User.find({ role: 'super_admin', isActive: true }).select('_id').lean(),
  ]);

  const tenantLabel = tenant?.name ?? tenant?.slug ?? vm.tenantId?.toString() ?? 'unknown';
  const title = 'Tenant VM plan expired — VM stopped';
  const message = `${tenantLabel}: VM "${vm.name}" (vmid ${vm.vmid}) was stopped because its plan period ended.`;

  await Promise.all(
    superAdmins.map((admin) =>
      Notification.create({
        userId: admin._id,
        type: 'vm_plan_expired',
        title,
        message,
        severity: 'warning',
        read: false,
        metadata: {
          vmId: vm._id.toString(),
          vmid: vm.vmid,
          node: vm.node,
          tenantId: vm.tenantId?.toString() ?? null,
          orderId: vm.orderId?.toString() ?? null,
          planPeriodEnd: vm.planPeriodEnd?.toISOString() ?? null,
        },
      }).catch((err: unknown) => {
        logger.warn('Failed to create plan-expiry notification', {
          vmId: vm._id.toString(),
          userId: admin._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      })
    )
  );
}

export async function runPlanExpiryCheck(): Promise<void> {
  const now = new Date();
  const expiredVms = await VM.find({
    planStatus: 'active',
    planPeriodEnd: { $lt: now },
    status: { $nin: ['stopped', 'deleted', 'delete_failed', 'deleting'] },
  });

  for (const vm of expiredVms) {
    try {
      const adminId = vm.adminId ?? new mongoose.Types.ObjectId();
      await vmService.gracefulShutdownVm(vm, adminId, {
        ipAddress: 'plan-expiry-scheduler',
        userAgent: 'plan-expiry-scheduler',
      });

      vm.planStatus = 'expired';
      await vm.save();

      await notifySuperAdminsOfExpiredVm(vm);
    } catch (err) {
      logger.error('[PlanExpiry] Failed to stop expired VM', {
        vmId: vm._id.toString(),
        vmid: vm.vmid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (expiredVms.length > 0) {
    logger.info('[PlanExpiry] Processed expired VMs', { count: expiredVms.length });
  }
}

export function startPlanExpiryScheduler(): void {
  const intervalMs = config.PLAN_EXPIRY_CHECK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) {
      logger.debug('[PlanExpiry] Scheduler tick skipped — previous tick still running');
      return;
    }

    tickInProgress = true;
    void runPlanExpiryCheck()
      .catch((err: unknown) => {
        logger.error('[PlanExpiry] Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, intervalMs);

  logger.info('[PlanExpiry] Scheduler started', { intervalMs });
}
