import { createLabRoles, rollbackLabRoles } from './iamRoleProvisioner.js';
import {
  provisionIdentityUsers,
  rollbackIdentityUsers,
} from './identityProvisioner.js';
import { createManagePortalSession } from '../../services/managePortalService.js';
import { sendCredentialsEmail } from './emailProvisioner.js';
import { resolveLabAccount } from './accountProvisioner.js';
import { applyScpRestrictions, isScpStepComplete, rollbackScpResources } from './scpProvisioner.js';
import { deployAutoTagger } from './autoTaggerProvisioner.js';
import { activateCostAllocationTags } from '../../services/costTrackingService.js';
import Request from '../../models/Request.js';
import {
  complete,
  fail,
  logStepComplete,
  logStepFailed,
  logStepStart,
  updateStep,
} from '../../services/progressTracker.js';
import { createNotification } from '../../services/notificationService.js';

function mapIdentityUsersForStorage(users = []) {
  return users.map((user) => ({
    userIndex: user.userIndex,
    username: user.username,
    email: user.email,
    userId: user.userId,
    password: user.password,
    accountId: user.accountId || user.awsAccountId,
    awsAccountId: user.awsAccountId || user.accountId,
    consoleUrl: user.consoleUrl,
    needsActivation: user.needsActivation ?? false,
    policies: user.policies || [],
    suspended: user.suspended ?? false,
    budgetExceeded: user.budgetExceeded ?? false,
    currentSpend: user.currentSpend ?? 0,
  }));
}

function buildLabAccounts(request, awsAccountId) {
  const ids = request.awsAccountIds?.length ? request.awsAccountIds : [awsAccountId];
  return ids.filter(Boolean).map((accountId, index) => ({
    accountId,
    accountName: `lab-${index + 1}`,
  }));
}

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

async function rollbackAll(request, context, isMagicLink) {
  try {
    if (!isMagicLink) {
      if (context.identityUsers?.length) {
        await rollbackIdentityUsers({
          identityUsers: context.identityUsers,
          awsAccountId: context.awsAccountId,
        });
      }
    } else if (context.labRoles?.length) {
      await rollbackLabRoles(context.labRoles);
    }

    if (context.scpResult && !context.scpResult.skipped) {
      await rollbackScpResources(context.scpResult);
    }
  } catch (err) {
    console.error('[orchestrator] Rollback error:', err.message);
  }
}

async function resetRequestAfterFailure(requestId) {
  await Request.findByIdAndUpdate(requestId, {
    awsAccountId: null,
    awsAccountIds: [],
    labRoles: [],
    identityUsers: [],
    permissionSetArns: [],
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

  const isMagicLink = request.accessType !== 'identity_center';
  const context = {
    awsAccountId: null,
    scpResult: null,
    labRoles: [],
    identityUsers: [],
    permSetArns: [],
    assignments: [],
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

    // Step 1b — Flag billing access requirement and activate cost allocation tags (once per request).
    if (!request.provisionStatus?.costAllocationTagsActivated) {
      // NOTE: IAM user access to billing CANNOT be activated via SDK.
      // It requires root account login → Account Settings →
      // "IAM User and Role Access to Billing Information" → Activate.
      // Future: CloudFormation StackSets can automate this via a custom resource.
      const billingWarning =
        'IAM billing access must be activated manually in each lab account root settings before cost tracking works.';

      await Request.findByIdAndUpdate(requestId, {
        $set: {
          'provisionStatus.billingIamAccessEnabled': false,
          'provisionStatus.billingWarning': billingWarning,
        },
        updatedAt: new Date(),
      });

      console.warn(`[Provisioner] Account ${context.awsAccountId} needs IAM billing access activated.`);
      console.warn(
        '[Provisioner] Root login → Account Settings → IAM User and Role Access to Billing → Activate'
      );

      const tagActivated = await activateCostAllocationTags(context.awsAccountId);
      if (!tagActivated) {
        await Request.findByIdAndUpdate(requestId, {
          $set: { 'provisionStatus.billingAccessWarning': true },
          updatedAt: new Date(),
        });
      } else {
        await Request.findByIdAndUpdate(requestId, {
          $set: {
            'provisionStatus.billingIamAccessEnabled': true,
            'provisionStatus.costAllocationTagsActivated': true,
            'provisionStatus.billingAccessWarning': false,
          },
          updatedAt: new Date(),
        });
      }

      request = await Request.findById(requestId);
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

    const labAccounts = buildLabAccounts(request, context.awsAccountId);
    await runStep(requestId, 'AUTOTAG', 'Deploy auto-tagger Lambda', 3, async () => {
      const deployments = [];
      for (const account of labAccounts) {
        const deployment = await deployAutoTagger(account.accountId, requestId);
        deployments.push(deployment);
      }
      console.log('[Orchestrator] Auto-tagger deployed to all lab accounts');
      return { accountCount: deployments.length, deployments };
    });

    const hasUsers = isMagicLink ? request.labRoles?.length : request.identityUsers?.length;

    if (!hasUsers) {
      context.identityUsers = [];
      context.labRoles = [];

      await runStep(requestId, 'ROLES', 'Create lab users/roles', 4, async () => {
        if (isMagicLink) {
          context.labRoles = await createLabRoles(request);
          await Request.findByIdAndUpdate(requestId, {
            labRoles: context.labRoles,
            updatedAt: new Date(),
          });
          return { count: context.labRoles.length, type: 'iam_roles' };
        }

        context.identityUsers = await provisionIdentityUsers(request, labAccounts);
        await Request.findByIdAndUpdate(requestId, {
          identityUsers: mapIdentityUsersForStorage(context.identityUsers),
          updatedAt: new Date(),
        });
        return { count: context.identityUsers.length, type: 'iam_users' };
      });
    } else if (isMagicLink) {
      context.labRoles = request.labRoles;
    } else {
      context.identityUsers = request.identityUsers;
    }

    if (!isMagicLink) {
      await runStep(requestId, 'POLICY', 'Assign permissions', 5, async () => {
        console.log('[Orchestrator] Step 4 skipped for IAM User path — policies attached in Step 3');
        return { skipped: true, reason: 'iam_user_inline_policies' };
      });
    } else if (isMagicLink) {
      await runStep(requestId, 'POLICY', 'Attach permissions', 5, async () => ({
        attached: true,
        roleCount: context.labRoles.length,
      }));
    }

    if (!request.credentialsSent) {
      context.portalSession = await runStep(
        requestId,
        'PORTAL',
        'Create manage portal access',
        6,
        () => createManagePortalSession(request)
      );

      await runStep(requestId, 'EMAIL', 'Send credentials email', 7, () =>
        sendCredentialsEmail(request, {
          awsAccountId: context.awsAccountId,
          labRoles: context.labRoles,
          identityUsers: context.identityUsers,
          portalSession: context.portalSession,
          accessType: request.accessType,
          isMagicLink,
        })
      );
    }

    console.log(`[orchestrator] Provisioning completed for ${requestId} (${request.accessType})`);
    const completedRequest = await complete(requestId);

    await createNotification({
      type: 'provisioning_complete',
      title: 'AWS Lab provisioned successfully',
      message: `Lab for ${completedRequest.customerEmail} provisioned — ${completedRequest.accountCount} users, ${completedRequest.region}, ${completedRequest.accessType === 'magic_link' ? 'Magic Link' : 'Identity Center'} access`,
      requestId: completedRequest._id,
    });

    return completedRequest;
  } catch (err) {
    console.error(`[orchestrator] Failed for ${requestId}:`, err.message);
    await fail(requestId, err.message || 'Provisioning failed');

    await createNotification({
      type: 'provisioning_failed',
      title: 'AWS Lab provisioning failed',
      message: `Lab for ${request.customerEmail} failed at step ${request.currentStep || 0}: ${err.message}`,
      requestId: request._id,
    });
    request = await Request.findById(requestId);
    if (request) {
      await rollbackAll(request, context, isMagicLink);
      await resetRequestAfterFailure(requestId);
    }
    throw err;
  }
}
