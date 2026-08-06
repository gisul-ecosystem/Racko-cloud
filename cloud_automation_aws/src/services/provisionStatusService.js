import mongoose from 'mongoose';
import Request from '../models/Request.js';
import {
  buildStepStatuses,
  getProvisionLogs,
  getStatusMessage,
} from './progressTracker.js';
import { isPerUserCosting } from '../utils/costingMode.js';

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function getStatus(requestId) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(requestId).lean();
  if (!request) {
    throw validationError('Request not found', 404);
  }

  const logs = await getProvisionLogs(requestId);

  return {
    status: request.status,
    currentStep: request.currentStep || 0,
    progress: request.progress || 0,
    message: getStatusMessage(request),
    steps: buildStepStatuses(request),
    costingMode: request.costingMode || 'shared',
    awsAccountId: request.awsAccountId || null,
    awsAccountIds: request.awsAccountIds?.length
      ? request.awsAccountIds
      : request.awsAccountId
        ? [request.awsAccountId]
        : [],
    perUserAccess: isPerUserCosting(request.costingMode),
    credentialsSent: Boolean(request.credentialsSent),
    spreadsheetAvailable: Boolean(request.credentialsSent || request.status === 'Completed'),
    guideAvailable: Boolean(request.credentialsSent || request.status === 'Completed'),
    failureReason: request.failureReason || null,
    logs: logs.map((entry) => ({
      step: entry.step,
      stepName: entry.stepName,
      status: entry.status,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      error: entry.error || null,
    })),
  };
}
