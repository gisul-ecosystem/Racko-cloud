import { createLabRoles, rollbackLabRoles } from './iamRoleProvisioner.js';
import { createManagePortalSession } from '../../services/managePortalService.js';
import { sendCredentialsEmail } from './emailProvisioner.js';
import { resolveLabAccount } from './accountProvisioner.js';
import { applyScpRestrictions, isScpStepComplete, rollbackScpResources } from './scpProvisioner.js';
import Request from '../../models/Request.js';
import {
  complete,
  fail,
  logStepComplete,
  logStepFailed,
  logStepStart,
  updateStep,
} from '../../services/progressTracker.js';

async function runStep(requestId, stepKey, stepName, stepNumber, handler) {
  const log = await logStepStart(requestId, stepNumber, stepName);
  try {
    const result = await handler();
    await logStepComplete(log._id, result);
    await updateStep(requestId, stepKey);
    return result;
  } catch (err) {
    await logStepFailed(log._id, err);
    throw err;
  }
}

async function rollback(request, context) {
  if (context.labRoles?.length) await rollbackLabRoles(context.labRoles);
  if (context.scpResult && !context.scpResult.skipped) {
    await rollbackScpResources(context.scpResult);
  }
}

async function resetRequestAfterFailure(requestId) {
  await Request.findByIdAndUpdate(requestId, {
    awsAccountId: null,
    awsAccountIds: [],
    labRoles: [],
    provisionedResources: {
      ou: null,
      scps: [],
      assignments: [],
      accounts: [],
      targetAccountId: null,
      scpSkipped: false,
      scpSkipReason: null,
    },
    credentialsSent: false,
    currentStep: 0,
    progress: 0,
    updatedAt: new Date(),
  });
}

export async function run(requestId) {
  let request = await Request.findById(requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);

  if (['Completed', 'Expired'].includes(request.status)) {
    return request;
  }

  const context = {
    awsAccountId: null,
    scpResult: null,
    labRoles: [],
    portalSession: null,
  };

  try {
    if (!request.awsAccountId) {
      const accountResult = await runStep(requestId, 'ACCOUNT', 'Prepare lab account', 1, () =>
        resolveLabAccount(request)
      );
      context.awsAccountId = accountResult.awsAccountId;
      request = await Request.findByIdAndUpdate(
        requestId,
        {
          awsAccountId: context.awsAccountId,
          awsAccountIds: [context.awsAccountId],
          updatedAt: new Date(),
        },
        { new: true }
      );
    } else {
      context.awsAccountId = request.awsAccountId;
    }

    if (!isScpStepComplete(request.provisionedResources)) {
      context.scpResult = await runStep(requestId, 'SCP', 'Apply SCP restrictions', 2, async () => {
        try {
          return await applyScpRestrictions(request, context.awsAccountId);
        } catch (err) {
          return { skipped: true, skipReason: err.message, scps: [] };
        }
      });

      request = await Request.findByIdAndUpdate(
        requestId,
        {
          provisionedResources: {
            ...request.provisionedResources,
            ou: context.scpResult.ou,
            scps: context.scpResult.scps,
            targetAccountId: context.scpResult.targetAccountId,
            scpSkipped: Boolean(context.scpResult.skipped),
            scpSkipReason: context.scpResult.skipReason || null,
          },
          updatedAt: new Date(),
        },
        { new: true }
      );
    }

    if (!request.labRoles?.length) {
      context.labRoles = await runStep(requestId, 'ROLES', 'Create IAM lab roles', 3, () =>
        createLabRoles(request)
      );

      request = await Request.findByIdAndUpdate(
        requestId,
        { labRoles: context.labRoles, updatedAt: new Date() },
        { new: true }
      );
    } else {
      context.labRoles = request.labRoles;
    }

    await runStep(requestId, 'POLICY', 'Attach permissions', 4, async () => ({
      attached: true,
      roleCount: context.labRoles.length,
    }));

    if (!request.credentialsSent) {
      context.portalSession = await runStep(
        requestId,
        'PORTAL',
        'Create manage portal access',
        5,
        () => createManagePortalSession(request)
      );

      await runStep(requestId, 'EMAIL', 'Send credentials email', 6, () =>
        sendCredentialsEmail(request, {
          awsAccountId: context.awsAccountId,
          labRoles: context.labRoles,
          portalSession: context.portalSession,
        })
      );
    }

    console.log(`[orchestrator] Provisioning completed for request ${requestId}`);
    return complete(requestId);
  } catch (err) {
    console.error(`[orchestrator] Failed for ${requestId}:`, err.message);
    await fail(requestId, err.message || 'Provisioning failed');
    request = await Request.findById(requestId);
    if (request) {
      await rollback(request, context);
      await resetRequestAfterFailure(requestId);
    }
    throw err;
  }
}
