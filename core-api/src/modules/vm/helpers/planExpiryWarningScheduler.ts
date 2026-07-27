import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { VM, type IVM } from '../../vm/vm.model';
import { TenantUser } from '../../../models/tenantUser.model';
import { TenantNotification } from '../../../models/tenantNotification.model';

let tickInProgress = false;

async function notifyTenantAdminsPlanExpiringSoon(vm: IVM, daysRemaining: number): Promise<void> {
  const admins = await TenantUser.find({
    tenantId: vm.tenantId,
    role: 'tenant_admin',
    isActive: true,
  })
    .select('_id')
    .lean();

  const periodEndIso = vm.planPeriodEnd?.toISOString() ?? '';
  const title = 'VM plan expiring soon';
  const message = `VM "${vm.name}" (vmid ${vm.vmid}) plan ends in ${daysRemaining} day(s). Top up your wallet and extend usage to avoid interruption.`;

  await Promise.all(
    admins.map((admin) =>
      TenantNotification.create({
        tenantId: vm.tenantId!,
        tenantUserId: admin._id,
        type: 'vm_plan_expiring_soon',
        title,
        message,
        severity: 'warning',
        read: false,
        metadata: {
          vmId: vm._id.toString(),
          vmid: vm.vmid,
          planPeriodEnd: periodEndIso,
          daysRemaining,
        },
      }).catch((err: unknown) => {
        logger.warn('[PlanExpiryWarning] Failed to create tenant notification', {
          vmId: vm._id.toString(),
          tenantUserId: admin._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      })
    )
  );
}

export async function runPlanExpiryWarningCheck(): Promise<void> {
  const now = new Date();
  const warningMs = config.PLAN_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;
  const warningUntil = new Date(now.getTime() + warningMs);

  const candidates = await VM.find({
    planStatus: 'active',
    planPeriodEnd: { $gt: now, $lte: warningUntil },
    status: { $nin: ['deleted', 'delete_failed', 'deleting'] },
    tenantId: { $ne: null },
  });

  for (const vm of candidates) {
    if (!vm.planPeriodEnd || !vm.tenantId) {
      continue;
    }

    if (
      vm.planExpiryWarningFor &&
      vm.planExpiryWarningFor.getTime() === vm.planPeriodEnd.getTime()
    ) {
      continue;
    }

    const msLeft = vm.planPeriodEnd.getTime() - now.getTime();
    const daysRemaining = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

    try {
      await notifyTenantAdminsPlanExpiringSoon(vm, daysRemaining);
      vm.planExpiryWarningFor = vm.planPeriodEnd;
      await vm.save();
    } catch (err) {
      logger.error('[PlanExpiryWarning] Failed to process VM', {
        vmId: vm._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (candidates.length > 0) {
    logger.info('[PlanExpiryWarning] Processed soon-expiring VMs', {
      candidateCount: candidates.length,
      warningDays: config.PLAN_EXPIRY_WARNING_DAYS,
    });
  }
}

export function startPlanExpiryWarningScheduler(): void {
  const intervalMs = config.PLAN_EXPIRY_WARNING_CHECK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) {
      logger.debug('[PlanExpiryWarning] Scheduler tick skipped — previous tick still running');
      return;
    }

    tickInProgress = true;
    void runPlanExpiryWarningCheck()
      .catch((err: unknown) => {
        logger.error('[PlanExpiryWarning] Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, intervalMs);

  logger.info('[PlanExpiryWarning] Scheduler started', {
    intervalMs,
    warningDays: config.PLAN_EXPIRY_WARNING_DAYS,
  });
}
