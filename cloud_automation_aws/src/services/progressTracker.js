import ProvisionLog from '../models/ProvisionLog.js';
import Request from '../models/Request.js';
import { PROVISION_STEPS } from '../config/provisioning.js';

const STEP_MESSAGES = {
  0: 'Waiting to start provisioning.',
  1: 'Preparing lab account access…',
  2: 'Applying SCP service restrictions…',
  3: 'Creating IAM Identity Center users…',
  4: 'Creating permission sets and attaching policies…',
  5: 'Assigning users to the AWS account…',
  6: 'Sending credentials email…',
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

  return updateProgress(requestId, stepConfig.step, stepConfig.progress, extra);
}

export async function updateProgress(requestId, currentStep, progress, extra = {}) {
  return Request.findByIdAndUpdate(
    requestId,
    {
      currentStep,
      progress,
      updatedAt: new Date(),
      ...extra,
    },
    { new: true }
  );
}

export async function fail(requestId, failureReason) {
  return Request.findByIdAndUpdate(
    requestId,
    {
      status: 'Failed',
      failureReason,
      updatedAt: new Date(),
    },
    { new: true }
  );
}

export async function complete(requestId, extra = {}) {
  return Request.findByIdAndUpdate(
    requestId,
    {
      status: 'Completed',
      currentStep: PROVISION_STEPS.EMAIL.step,
      progress: PROVISION_STEPS.EMAIL.progress,
      credentialsSent: true,
      updatedAt: new Date(),
      ...extra,
    },
    { new: true }
  );
}

export function getStatusMessage(request) {
  if (request.status === 'Completed') {
    return 'Provisioning completed. Credentials have been sent.';
  }

  if (request.status === 'Failed') {
    return request.failureReason || 'Provisioning failed.';
  }

  if (request.status === 'Pending') {
    return STEP_MESSAGES[0];
  }

  return STEP_MESSAGES[request.currentStep] || 'Provisioning in progress…';
}

export async function getProvisionLogs(requestId) {
  return ProvisionLog.find({ requestId }).sort({ startedAt: 1 }).lean();
}

export function buildStepStatuses(request) {
  const steps = [
    { key: 'account', label: 'Account', step: 1 },
    { key: 'scp', label: 'SCP', step: 2 },
    { key: 'users', label: 'Users', step: 3 },
    { key: 'permissions', label: 'Permissions', step: 4 },
    { key: 'assignment', label: 'Assignment', step: 5 },
    { key: 'email', label: 'Email', step: 6 },
  ];

  const current = request.currentStep || 0;
  const isFailed = request.status === 'Failed';
  const isComplete = request.status === 'Completed';

  return steps.map((entry) => {
    let state = 'pending';

    if (isComplete || current > entry.step) {
      state = 'completed';
    } else if (current === entry.step && request.status === 'Provisioning') {
      state = 'in_progress';
    } else if (isFailed && current === entry.step) {
      state = 'failed';
    }

    return { ...entry, state };
  });
}
