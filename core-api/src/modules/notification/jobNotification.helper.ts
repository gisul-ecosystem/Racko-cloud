import type { NotificationSeverity } from './notification.model';

export interface JobNotificationSnapshot {
  type: 'single_create' | 'bulk_create' | 'bulk_delete' | 'bulk_start' | 'bulk_stop';
  status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed';
  total: number;
  completed: number;
  failed: number;
  requestedSpecs?: {
    templateName?: string;
    namePrefix?: string;
  };
}

interface JobNotificationContent {
  title: string;
  message: string;
  severity: NotificationSeverity;
}

function isCreateJob(type: JobNotificationSnapshot['type']): boolean {
  return type === 'single_create' || type === 'bulk_create';
}

function isDeleteJob(type: JobNotificationSnapshot['type']): boolean {
  return type === 'bulk_delete';
}

export function buildJobStartedNotification(job: JobNotificationSnapshot): JobNotificationContent {
  const total = job.total;
  const templateName = job.requestedSpecs?.templateName ?? 'template';
  const prefix = job.requestedSpecs?.namePrefix ?? 'vm';

  if (isDeleteJob(job.type)) {
    return {
      title: 'VM deletion started',
      message: `Deleting ${total} VM${total === 1 ? '' : 's'}.`,
      severity: 'info',
    };
  }

  if (isCreateJob(job.type)) {
    const label = job.type === 'single_create' ? 'VM' : `${total} VMs`;
    return {
      title: 'VM creation started',
      message: `Creating ${label} (${prefix}-*) from ${templateName}.`,
      severity: 'info',
    };
  }

  return {
    title: 'Job started',
    message: `Processing ${total} item${total === 1 ? '' : 's'}.`,
    severity: 'info',
  };
}

export function buildJobFinishedNotification(job: JobNotificationSnapshot): JobNotificationContent {
  const { completed, failed, total, status, type } = job;
  const templateName = job.requestedSpecs?.templateName ?? 'template';
  const prefix = job.requestedSpecs?.namePrefix ?? 'vm';

  if (isDeleteJob(type)) {
    if (status === 'completed') {
      return {
        title: 'VMs deleted',
        message: `${completed} VM${completed === 1 ? '' : 's'} deleted successfully.`,
        severity: 'success',
      };
    }
    if (status === 'partial') {
      return {
        title: 'VM deletion partially completed',
        message: `${completed} of ${total} VMs deleted. ${failed} failed.`,
        severity: 'warning',
      };
    }
    return {
      title: 'VM deletion failed',
      message: `Could not delete the selected VMs. ${failed} failed.`,
      severity: 'error',
    };
  }

  if (isCreateJob(type)) {
    if (status === 'completed') {
      const label = type === 'single_create' ? 'VM' : `${completed} VMs`;
      return {
        title: 'VMs created',
        message: `${label} (${prefix}-*) from ${templateName} ${type === 'single_create' ? 'is' : 'are'} ready.`,
        severity: 'success',
      };
    }
    if (status === 'partial') {
      return {
        title: 'VM creation partially completed',
        message: `${completed} of ${total} VMs created from ${templateName}. ${failed} failed.`,
        severity: 'warning',
      };
    }
    return {
      title: 'VM creation failed',
      message: `Could not create VMs (${prefix}-*) from ${templateName}.`,
      severity: 'error',
    };
  }

  if (status === 'completed') {
    return {
      title: 'Job completed',
      message: `${completed} of ${total} items processed successfully.`,
      severity: 'success',
    };
  }
  if (status === 'partial') {
    return {
      title: 'Job partially completed',
      message: `${completed} of ${total} succeeded. ${failed} failed.`,
      severity: 'warning',
    };
  }
  return {
    title: 'Job failed',
    message: `Job could not be completed. ${failed} failed.`,
    severity: 'error',
  };
}

export function jobActionUrl(jobId: string): string {
  return `/dashboard/admin/jobs/${jobId}`;
}
