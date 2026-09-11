import mongoose from 'mongoose';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { ProjectModel, type IProject } from '../../models/project.model';
import { User } from '../../models/user.model';
import { TenantUser } from '../../models/tenantUser.model';
import { Tenant } from '../../models/tenant.model';
import { Notification } from '../notification/notification.model';
import { TenantNotification } from '../../models/tenantNotification.model';
import {
  sendProjectExpiryClientWarningEmail,
  sendProjectExpiryWarningEmail,
} from '../../utils/email/sender';
import { resolvePlatformEmailBrand, resolveTenantEmailBrand } from '../../utils/email/templates/emailBrand';
import type { EmailBrand } from '../../utils/email/templates/brandedLayout';
import { runProjectExpiryCleanup } from './projectExpiryCleanup.service';
import {
  summarizeProjectExpiryForAgent,
  summarizeProjectExpiryForClient,
} from './projectExpiryResources';
import {
  computeGracePeriodEndsAt,
  formatGracePeriodEndsLabel,
  formatProjectDateLabel,
  isGracePeriodComplete,
  isProjectEndDateOnWarningDay,
  isProjectOnOrAfterEndDate,
} from './projectExpiryDates';

let tickInProgress = false;

function projectManageUrl(doc: IProject): string {
  const base = config.FRONTEND_URL.replace(/\/$/, '');
  const id = doc._id.toString();
  if (doc.ownerType === 'tenant' && doc.tenantId) {
    return `${base}/console/dashboard/projects/${id}?edit=1`;
  }
  return `${base}/console/projects/${id}?edit=1`;
}

function projectArchiveUrl(doc: IProject): string {
  const base = config.FRONTEND_URL.replace(/\/$/, '');
  const id = doc._id.toString();
  if (doc.ownerType === 'tenant' && doc.tenantId) {
    return `${base}/console/dashboard/projects/${id}?action=archive`;
  }
  return `${base}/console/projects/${id}?action=archive`;
}

async function resolveProjectEmailBrand(doc: IProject): Promise<EmailBrand | undefined> {
  if (doc.ownerType === 'tenant' && doc.tenantId) {
    const tenant = await Tenant.findById(doc.tenantId).select('name domain branding').lean();
    if (tenant) {
      return resolveTenantEmailBrand({
        name: tenant.name,
        domain: tenant.domain,
        branding: tenant.branding,
      });
    }
    return undefined;
  }
  return resolvePlatformEmailBrand();
}

async function resolveSupportAgentEmail(doc: IProject): Promise<string | null> {
  if (!doc.supportAgentId) return null;
  const agent = await User.findById(doc.supportAgentId)
    .select('email isActive role')
    .lean();
  if (!agent?.isActive || agent.role !== 'support_agent') return null;
  return agent.email?.trim().toLowerCase() || null;
}

async function notifyOrgProjectExpiry(doc: IProject, daysRemaining: number): Promise<void> {
  if (!doc.orgId) return;
  const ownerId = new mongoose.Types.ObjectId(doc.orgId);
  const endDateLabel = doc.endDate ? formatProjectDateLabel(doc.endDate) : '';
  const dayLabel = daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`;
  const title = 'Project ending soon';
  const message = `"${doc.name}" (${doc.clientName}) ends ${dayLabel} (${endDateLabel}). Extend the end date or archive the project.`;
  const actionUrl = projectManageUrl(doc);

  await Notification.create({
    userId: ownerId,
    type: 'project_expiring_soon',
    title,
    message,
    severity: 'warning',
    read: false,
    actionUrl,
    metadata: {
      projectId: doc._id.toString(),
      event: 'project_expiring_soon',
      daysRemaining,
      endDate: doc.endDate?.toISOString(),
    },
  }).catch((err: unknown) => {
    logger.warn('[ProjectExpiry] Org in-app notification failed', {
      projectId: doc._id.toString(),
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function notifyTenantProjectExpiry(doc: IProject, daysRemaining: number): Promise<void> {
  if (!doc.tenantId) return;
  const tenantId = new mongoose.Types.ObjectId(doc.tenantId);
  const admins = await TenantUser.find({
    tenantId,
    role: 'tenant_admin',
    isActive: true,
  })
    .select('_id')
    .lean();

  const endDateLabel = doc.endDate ? formatProjectDateLabel(doc.endDate) : '';
  const dayLabel = daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`;
  const title = 'Project ending soon';
  const message = `"${doc.name}" (${doc.clientName}) ends ${dayLabel} (${endDateLabel}). Extend the end date or archive the project.`;

  await Promise.all(
    admins.map((admin) =>
      TenantNotification.create({
        tenantId,
        tenantUserId: admin._id,
        type: 'project_expiring_soon',
        title,
        message,
        severity: 'warning',
        read: false,
        metadata: {
          projectId: doc._id.toString(),
          event: 'project_expiring_soon',
          daysRemaining,
          endDate: doc.endDate?.toISOString(),
        },
      }).catch((err: unknown) => {
        logger.warn('[ProjectExpiry] Tenant in-app notification failed', {
          projectId: doc._id.toString(),
          tenantUserId: admin._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      })
    )
  );
}

async function notifyGracePeriodStarted(doc: IProject): Promise<void> {
  if (!doc.gracePeriodEndsAt) return;
  const graceLabel = formatGracePeriodEndsLabel(doc.gracePeriodEndsAt);
  const title = 'Project grace period started';
  const message = `"${doc.name}" reached its end date. Assigned VMs will be released and the project archived on ${graceLabel} unless you extend the end date.`;
  const actionUrl = projectManageUrl(doc);

  if (doc.ownerType === 'tenant' && doc.tenantId) {
    const tenantId = new mongoose.Types.ObjectId(doc.tenantId);
    const admins = await TenantUser.find({
      tenantId,
      role: 'tenant_admin',
      isActive: true,
    })
      .select('_id')
      .lean();
    await Promise.all(
      admins.map((admin) =>
        TenantNotification.create({
          tenantId,
          tenantUserId: admin._id,
          type: 'project_grace_period',
          title,
          message,
          severity: 'warning',
          read: false,
          metadata: {
            projectId: doc._id.toString(),
            event: 'project_grace_period',
            gracePeriodEndsAt: doc.gracePeriodEndsAt?.toISOString(),
          },
        }).catch(() => undefined)
      )
    );
    return;
  }

  if (doc.orgId) {
    await Notification.create({
      userId: new mongoose.Types.ObjectId(doc.orgId),
      type: 'project_grace_period',
      title,
      message,
      severity: 'warning',
      read: false,
      actionUrl,
      metadata: {
        projectId: doc._id.toString(),
        event: 'project_grace_period',
        gracePeriodEndsAt: doc.gracePeriodEndsAt?.toISOString(),
      },
    }).catch(() => undefined);
  }
}

async function sendProjectExpiryEmails(doc: IProject, daysRemaining: number): Promise<void> {
  if (!doc.endDate) return;

  const brand = await resolveProjectEmailBrand(doc);
  const endDateLabel = formatProjectDateLabel(doc.endDate);
  const manageUrl = projectManageUrl(doc);
  const archiveUrl = projectArchiveUrl(doc);
  const graceHours = config.PROJECT_GRACE_PERIOD_HOURS;

  const supportAgentEmail = await resolveSupportAgentEmail(doc);
  const sends: Promise<void>[] = [];
  const agentSummary = supportAgentEmail
    ? await summarizeProjectExpiryForAgent(doc)
    : undefined;

  if (supportAgentEmail) {
    sends.push(
      sendProjectExpiryWarningEmail({
        to: supportAgentEmail,
        projectName: doc.name,
        clientName: doc.clientName,
        endDateLabel,
        daysRemaining,
        graceHours,
        manageUrl,
        archiveUrl,
        agentSummary,
        brand,
      }).catch((err: unknown) => {
        logger.warn('[ProjectExpiry] Support agent email failed', {
          projectId: doc._id.toString(),
          to: supportAgentEmail,
          error: err instanceof Error ? err.message : String(err),
        });
      })
    );
  }

  const clientEmail = doc.clientEmail?.trim().toLowerCase();
  if (clientEmail) {
    const clientSummary = await summarizeProjectExpiryForClient(doc);
    sends.push(
      sendProjectExpiryClientWarningEmail({
        to: clientEmail,
        projectName: doc.name,
        clientName: doc.clientName,
        endDateLabel,
        daysRemaining,
        graceHours,
        clientSummary,
        brand,
      }).catch((err: unknown) => {
        logger.warn('[ProjectExpiry] Client email failed', {
          projectId: doc._id.toString(),
          to: clientEmail,
          error: err instanceof Error ? err.message : String(err),
        });
      })
    );
  }

  await Promise.all(sends);
}

async function archiveProjectAfterCleanup(doc: IProject): Promise<void> {
  doc.status = 'archived';
  doc.archivedReason = 'end_date_reached';
  doc.archivedAt = new Date();
  await doc.save();

  const title = 'Project archived';
  const message = `"${doc.name}" reached its end date. Assigned VMs were released during the grace period and the project was archived automatically.`;

  if (doc.ownerType === 'tenant' && doc.tenantId) {
    const tenantId = new mongoose.Types.ObjectId(doc.tenantId);
    const admins = await TenantUser.find({
      tenantId,
      role: 'tenant_admin',
      isActive: true,
    })
      .select('_id')
      .lean();
    await Promise.all(
      admins.map((admin) =>
        TenantNotification.create({
          tenantId,
          tenantUserId: admin._id,
          type: 'project_archived',
          title,
          message,
          severity: 'info',
          read: false,
          metadata: {
            projectId: doc._id.toString(),
            event: 'project_archived',
            reason: 'end_date_reached',
          },
        }).catch(() => undefined)
      )
    );
    return;
  }

  if (doc.orgId) {
    await Notification.create({
      userId: new mongoose.Types.ObjectId(doc.orgId),
      type: 'project_archived',
      title,
      message,
      severity: 'info',
      read: false,
      actionUrl: projectManageUrl(doc),
      metadata: {
        projectId: doc._id.toString(),
        event: 'project_archived',
        reason: 'end_date_reached',
      },
    }).catch(() => undefined);
  }
}

async function runCleanupAndArchive(doc: IProject): Promise<void> {
  if (doc.expiryCleanupCompletedAt) return;

  await runProjectExpiryCleanup(doc);
  doc.expiryCleanupCompletedAt = new Date();
  await archiveProjectAfterCleanup(doc);

  logger.info('[ProjectExpiry] Grace cleanup + archive completed', {
    projectId: doc._id.toString(),
    gracePeriodEndsAt: doc.gracePeriodEndsAt?.toISOString(),
  });
}

async function enterGracePeriodIfNeeded(doc: IProject, now: Date): Promise<boolean> {
  if (!doc.endDate || doc.gracePeriodEndsAt || doc.autoArchiveEnabled === false) {
    return false;
  }
  if (!isProjectOnOrAfterEndDate(doc.endDate, now)) return false;

  doc.gracePeriodEndsAt = computeGracePeriodEndsAt(
    doc.endDate,
    config.PROJECT_GRACE_PERIOD_HOURS
  );
  await notifyGracePeriodStarted(doc);
  await doc.save();

  logger.info('[ProjectExpiry] Grace period started', {
    projectId: doc._id.toString(),
    endDate: doc.endDate.toISOString(),
    gracePeriodEndsAt: doc.gracePeriodEndsAt.toISOString(),
  });
  return true;
}

export async function runProjectExpiryCheck(): Promise<void> {
  const now = new Date();
  const warningDays = config.PROJECT_EXPIRY_WARNING_DAYS;

  const activeWithEnd = await ProjectModel.find({
    status: 'active',
    endDate: { $exists: true, $ne: null },
  });

  for (const doc of activeWithEnd) {
    if (!doc.endDate) continue;

    try {
      if (
        doc.autoArchiveEnabled !== false &&
        doc.gracePeriodEndsAt &&
        !doc.expiryCleanupCompletedAt &&
        isGracePeriodComplete(doc.gracePeriodEndsAt, now)
      ) {
        await runCleanupAndArchive(doc);
        continue;
      }

      const enteredGrace = await enterGracePeriodIfNeeded(doc, now);
      if (enteredGrace) {
        if (
          doc.gracePeriodEndsAt &&
          isGracePeriodComplete(doc.gracePeriodEndsAt, now) &&
          !doc.expiryCleanupCompletedAt
        ) {
          await runCleanupAndArchive(doc);
        }
        continue;
      }

      if (doc.gracePeriodEndsAt) {
        continue;
      }

      if (!isProjectEndDateOnWarningDay(doc.endDate, warningDays, now)) {
        continue;
      }

      const sentForMs = doc.expiryWarningSentFor?.getTime();
      const endMs = doc.endDate.getTime();
      if (sentForMs === endMs) {
        continue;
      }

      await Promise.all([
        doc.ownerType === 'tenant'
          ? notifyTenantProjectExpiry(doc, warningDays)
          : notifyOrgProjectExpiry(doc, warningDays),
        sendProjectExpiryEmails(doc, warningDays),
      ]);

      doc.expiryWarningSentFor = doc.endDate;
      await doc.save();

      logger.info('[ProjectExpiry] Sent expiry warning', {
        projectId: doc._id.toString(),
        warningDays,
        endDate: doc.endDate.toISOString(),
      });
    } catch (err) {
      logger.error('[ProjectExpiry] Failed to process project', {
        projectId: doc._id.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function startProjectExpiryScheduler(): void {
  const intervalMs = config.PROJECT_EXPIRY_CHECK_INTERVAL_MS;

  setInterval(() => {
    if (tickInProgress) return;
    tickInProgress = true;
    void runProjectExpiryCheck()
      .catch((err: unknown) => {
        logger.error('[ProjectExpiry] Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        tickInProgress = false;
      });
  }, intervalMs);

  logger.info('[ProjectExpiry] Scheduler started', {
    intervalMs,
    warningDays: config.PROJECT_EXPIRY_WARNING_DAYS,
    graceHours: config.PROJECT_GRACE_PERIOD_HOURS,
  });
}
