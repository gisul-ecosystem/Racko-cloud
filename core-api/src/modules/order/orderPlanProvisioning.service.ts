import mongoose from 'mongoose';
import { Order, type IOrder, type BillingPeriod } from '../../models/order.model';
import { Tenant } from '../../models/tenant.model';
import { User } from '../../models/user.model';
import { VM } from '../vm/vm.model';
import { VMJob } from '../vm/vmJob.model';
import { Notification } from '../notification/notification.model';
import { logger } from '../../utils/logger';

export function computePeriodEndDate(start: Date, billingPeriod: BillingPeriod): Date {
  const end = new Date(start);
  if (billingPeriod === 'monthly') {
    end.setMonth(end.getMonth() + 1);
  } else if (billingPeriod === 'quarterly') {
    end.setMonth(end.getMonth() + 3);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

/**
 * After a VMJob finishes (completed/partial), stamp tenant/order/plan fields onto
 * VMs when the job was started from a fulfilled tenant order (provisionJobId).
 */
export async function stampOrderProvisionedVms(jobId: mongoose.Types.ObjectId): Promise<void> {
  const order = await Order.findOne({
    provisionJobId: jobId.toString(),
    status: 'fulfilled',
  });

  if (!order || order.periodStartDate) {
    return;
  }

  const job = await VMJob.findById(jobId).lean();
  if (!job || job.vmIds.length === 0) {
    return;
  }

  if (job.status !== 'completed' && job.status !== 'partial') {
    return;
  }

  const periodStart = new Date();
  const periodEnd = computePeriodEndDate(periodStart, order.billingPeriod);

  order.periodStartDate = periodStart;
  order.periodEndDate = periodEnd;
  await order.save();

  await VM.updateMany(
    { _id: { $in: job.vmIds } },
    {
      $set: {
        tenantId: order.tenantId,
        orderId: order._id,
        planPeriodEnd: periodEnd,
        planStatus: 'active',
        billingPeriod: order.billingPeriod,
      },
    }
  );

  logger.info('[OrderPlan] Stamped plan fields on provisioned VMs', {
    orderId: order._id.toString(),
    jobId: jobId.toString(),
    vmCount: job.vmIds.length,
    periodEnd: periodEnd.toISOString(),
    billingPeriod: order.billingPeriod,
  });
}

async function notifySuperAdminsProvisioningFailed(
  order: IOrder,
  jobId: mongoose.Types.ObjectId
): Promise<void> {
  const [tenant, superAdmins] = await Promise.all([
    Tenant.findById(order.tenantId).select('name slug').lean(),
    User.find({ role: 'super_admin', isActive: true }).select('_id').lean(),
  ]);

  const tenantLabel = tenant?.name ?? tenant?.slug ?? order.tenantId.toString();
  const title = 'Tenant VM order provisioning failed';
  const message = `${tenantLabel}: order ${order._id.toString()} failed VM provisioning (job ${jobId.toString()}). Manual investigation required.`;

  await Promise.all(
    superAdmins.map((admin) =>
      Notification.create({
        userId: admin._id,
        type: 'tenant_order',
        title,
        message,
        severity: 'error',
        read: false,
        metadata: {
          orderId: order._id.toString(),
          tenantId: order.tenantId.toString(),
          event: 'provisioning_failed',
          provisionJobId: jobId.toString(),
        },
      }).catch((err: unknown) => {
        logger.warn('Failed to create provisioning-failure notification', {
          orderId: order._id.toString(),
          userId: admin._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      })
    )
  );
}

/**
 * Transition order status after VMJob reaches a terminal state.
 * Called from finalizeJobStatus in bulkProcessor.ts.
 */
export async function finalizeOrderAfterProvisionJob(
  jobId: mongoose.Types.ObjectId,
  finalStatus: 'completed' | 'partial' | 'failed'
): Promise<void> {
  const order = await Order.findOne({
    provisionJobId: jobId.toString(),
    status: 'provisioning',
  });

  if (!order) {
    return;
  }

  if (finalStatus === 'completed' || finalStatus === 'partial') {
    order.status = 'fulfilled';
    await order.save();
    await stampOrderProvisionedVms(jobId);
    return;
  }

  logger.error('[OrderPlan] VM provisioning failed for tenant order — status remains provisioning', {
    orderId: order._id.toString(),
    jobId: jobId.toString(),
    finalStatus,
  });
  await notifySuperAdminsProvisioningFailed(order, jobId);
}
