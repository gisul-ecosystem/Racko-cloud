import ProvisionLog from '../models/ProvisionLog.js';
import Request from '../models/Request.js';
import { PROVISION_STEPS } from '../config/provisioning.js';

const STEP_MESSAGES = {
  0: 'Waiting to start provisioning.',
  1: 'Creating GCP lab project…',
  2: 'Applying organization policies…',
  3: 'Creating Cloud Identity users…',
  4: 'Assigning IAM roles…',
  5: 'Sending credentials email…',
};

export async function logStepStart(requestId, step, stepName, metadata = {}) {
  return ProvisionLog.create({
    requestId,
    step,
    stepName,
    status: 'started',
    startedAt: new Date(),
    metadata,
  });
}

export async function logStepComplete(logId, metadata = {}) {
  return ProvisionLog.findByIdAndUpdate(logId, {
    status: 'completed',
    finishedAt: new Date(),
    metadata,
  });
}

export async function logStepFailed(logId, error, metadata = {}) {
  return ProvisionLog.findByIdAndUpdate(logId, {
    status: 'failed',
    finishedAt: new Date(),
    error: error?.message || String(error),
    metadata,
  });
}

export async function updateStep(requestId, stepKey, extra = {}) {
  const stepConfig = PROVISION_STEPS[stepKey];
  if (!stepConfig) return null;

  const stepUpdate = {
    [`provisionStatus.steps.${stepKey}.status`]: 'completed',
    [`provisionStatus.steps.${stepKey}.completedAt`]: new Date(),
  };

  return Request.findByIdAndUpdate(
    requestId,
    {
      currentStep: stepConfig.step,
      progress: stepConfig.progress,
      updatedAt: new Date(),
      ...stepUpdate,
      ...extra,
    },
    { returnDocument: 'after' }
  );
}

export async function fail(requestId, failureReason) {
  return Request.findByIdAndUpdate(
    requestId,
    {
      status: 'Failed',
      'provisionStatus.overall': 'failed',
      failureReason,
      updatedAt: new Date(),
    },
    { returnDocument: 'after' }
  );
}

export async function complete(requestId, extra = {}) {
  return Request.findByIdAndUpdate(
    requestId,
    {
      status: 'Completed',
      progress: 100,
      'provisionStatus.overall': 'completed',
      updatedAt: new Date(),
      ...extra,
    },
    { returnDocument: 'after' }
  );
}

export async function getProvisionLogs(requestId) {
  return ProvisionLog.find({ requestId }).sort({ step: 1, startedAt: 1 }).lean();
}

export function buildStepStatuses(request) {
  return Object.entries(PROVISION_STEPS).map(([key, config]) => {
    const step = request?.provisionStatus?.steps?.[key] || {};
    return {
      key,
      label: config.label,
      status: step.status || 'pending',
      startedAt: step.startedAt || null,
      completedAt: step.completedAt || null,
      error: step.error || null,
    };
  });
}

export function getStatusMessage(request) {
  const step = Number(request?.currentStep || 0);
  return STEP_MESSAGES[step] || STEP_MESSAGES[0];
}
