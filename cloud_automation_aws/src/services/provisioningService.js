import mongoose from 'mongoose';
import Request from '../models/Request.js';
import { run } from '../provisioners/aws/provisionOrchestrator.js';
import { createLabRoles } from '../provisioners/aws/iamRoleProvisioner.js';

const activeRuns = new Set();

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function start(requestId) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(requestId);
  if (!request) {
    throw validationError('Request not found', 404);
  }

  if (request.status === 'Completed') {
    throw validationError('Request is already completed.');
  }

  if (request.status === 'Provisioning' && activeRuns.has(String(requestId))) {
    return { status: 'Provisioning' };
  }

  await Request.findByIdAndUpdate(requestId, {
    status: 'Provisioning',
    progress: 0,
    currentStep: 0,
    failureReason: null,
    updatedAt: new Date(),
  });

  activeRuns.add(String(requestId));

  setImmediate(() => {
    run(requestId)
      .catch((err) => {
        const detail = err.details ? ` (${JSON.stringify(err.details)})` : '';
        console.error(`Provisioning failed for request ${requestId}: ${err.message}${detail}`);
      })
      .finally(() => {
        activeRuns.delete(String(requestId));
      });
  });

  return { status: 'Provisioning' };
}

export async function retry(requestId) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(requestId);
  if (!request) {
    throw validationError('Request not found', 404);
  }

  if (request.status !== 'Failed') {
    throw validationError('Only failed requests can be retried.');
  }

  await Request.findByIdAndUpdate(requestId, {
    progress: 0,
    currentStep: 0,
    failureReason: null,
    updatedAt: new Date(),
  });

  return start(requestId);
}

export async function syncRolePolicies(requestId) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(requestId);
  if (!request) {
    throw validationError('Request not found', 404);
  }

  if (request.accessType === 'identity_center') {
    throw validationError('Role policy sync is only available for magic link requests.');
  }

  if (!request.labRoles?.length) {
    throw validationError('No lab roles found on this request.');
  }

  const labRoles = await createLabRoles(request);
  await Request.findByIdAndUpdate(requestId, {
    labRoles,
    updatedAt: new Date(),
  });

  return { labRoles };
}
