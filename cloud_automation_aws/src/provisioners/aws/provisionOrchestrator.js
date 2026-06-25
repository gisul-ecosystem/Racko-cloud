import Request from '../../models/Request.js';
import { resolveLabAccount } from './accountProvisioner.js';
import { assignUsersToAccount, rollbackAssignments } from './accountAssignmentProvisioner.js';
import { sendCredentialsEmail } from './emailProvisioner.js';
import {
  createIdentityCenterUser,
  createIdentityCenterUsers,
  rollbackIdentityUsers,
} from './identityProvisioner.js';
import {
  createPermissionSet,
  createPermissionSets,
  rollbackPermissionSets,
} from './permissionSetProvisioner.js';
import {
  applyScpRestrictions,
  isScpStepComplete,
  rollbackScpResources,
} from './scpProvisioner.js';
import { deriveRequestAccountName } from '../../config/scpPolicies.js';
import { initializeIdentityCenter } from '../../config/ssoConfig.js';
import { isPerUserCosting } from '../../utils/costingMode.js';
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

function getPermissionSetArnsForRollback(request) {
  const arns = new Set(request.permissionSetArns || []);

  for (const account of request.provisionedResources?.accounts || []) {
    if (account.permissionSetArn) arns.add(account.permissionSetArn);
  }

  for (const user of request.identityUsers || []) {
    if (user.permissionSetArn) arns.add(user.permissionSetArn);
  }

  return [...arns];
}

async function rollbackProvisionedResources(request) {
  const assignments = (request.provisionedResources?.assignments || []).map((entry) => ({
    ...entry,
    targetAccountId: entry.targetAccountId || request.awsAccountId,
  }));

  await rollbackAssignments(assignments);
  await rollbackPermissionSets(getPermissionSetArnsForRollback(request));
  await rollbackIdentityUsers(request.identityUsers || []);
  await rollbackScpResources(request.provisionedResources || {});
}

async function resetRequestAfterFailure(requestId) {
  await Request.findByIdAndUpdate(requestId, {
    awsAccountId: null,
    awsAccountIds: [],
    accountCreationRequestId: null,
    permissionSetArns: [],
    identityUsers: [],
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

function accountCountFor(request) {
  return Number(request.accountCount) || 1;
}

function buildPerUserAccountSlots(request, labAccount) {
  const totalUsers = accountCountFor(request);
  const slots = [];

  for (let userIndex = 0; userIndex < totalUsers; userIndex += 1) {
    slots.push({
      userIndex,
      awsAccountId: labAccount.awsAccountId,
      accountName: deriveRequestAccountName(request, userIndex),
      scpPolicyIds: [],
      permissionSetArn: null,
    });
  }

  return slots;
}

async function runSharedProvisioning(requestId) {
  let request = await Request.findById(requestId);

  if (!request.awsAccountId) {
    const accountResult = await runStep(
      requestId,
      'ACCOUNT',
      'Prepare lab account',
      1,
      () => resolveLabAccount(request)
    );

    request = await Request.findByIdAndUpdate(
      requestId,
      {
        awsAccountId: accountResult.awsAccountId,
        awsAccountIds: [accountResult.awsAccountId],
        updatedAt: new Date(),
      },
      { new: true }
    );
  }

  if (!isScpStepComplete(request.provisionedResources)) {
    const scpResult = await runStep(
      requestId,
      'SCP',
      'Apply SCP restrictions',
      2,
      () => applyScpRestrictions(request, request.awsAccountId)
    );

    request = await Request.findByIdAndUpdate(
      requestId,
      {
        provisionedResources: {
          ...request.provisionedResources,
          ou: scpResult.ou,
          scps: scpResult.scps,
          targetAccountId: scpResult.targetAccountId,
          scpSkipped: Boolean(scpResult.skipped),
          scpSkipReason: scpResult.skipReason || null,
          assignments: request.provisionedResources?.assignments || [],
          accounts: request.provisionedResources?.accounts || [],
        },
        updatedAt: new Date(),
      },
      { new: true }
    );
  }

  if (!request.identityUsers?.length) {
    const users = await runStep(
      requestId,
      'IDENTITY',
      'Create Identity Center users',
      3,
      () => createIdentityCenterUsers(request)
    );

    request = await Request.findByIdAndUpdate(
      requestId,
      { identityUsers: users, updatedAt: new Date() },
      { new: true }
    );
  }

  if (!request.permissionSetArns?.length) {
    const permissionResult = await runStep(
      requestId,
      'PERMISSION_SET',
      'Create permission sets',
      4,
      () =>
        createPermissionSets(request, request.awsAccountId, {
          username: `request-${String(request._id).slice(-6)}`,
          userIndex: 0,
        })
    );

    request = await Request.findByIdAndUpdate(
      requestId,
      { permissionSetArns: permissionResult.permissionSetArns, updatedAt: new Date() },
      { new: true }
    );
  }

  if (!request.provisionedResources?.assignments?.length) {
    const assignments = await runStep(
      requestId,
      'ASSIGNMENT',
      'Assign users to account',
      5,
      () =>
        assignUsersToAccount(
          request,
          request.awsAccountId,
          request.identityUsers,
          request.permissionSetArns
        )
    );

    request = await Request.findByIdAndUpdate(
      requestId,
      {
        provisionedResources: {
          ...request.provisionedResources,
          assignments,
        },
        updatedAt: new Date(),
      },
      { new: true }
    );
  }

  if (!request.credentialsSent) {
    await runStep(requestId, 'EMAIL', 'Send credentials email', 6, () =>
      sendCredentialsEmail(request, {
        awsAccountId: request.awsAccountId,
        identityUsers: request.identityUsers,
        costingMode: request.costingMode,
      })
    );
  }

  return complete(requestId);
}

async function runPerUserProvisioning(requestId) {
  let request = await Request.findById(requestId);
  const totalUsers = accountCountFor(request);
  let accounts = request.provisionedResources?.accounts || [];

  if (!request.awsAccountId || accounts.length < totalUsers) {
    const labAccount = await runStep(
      requestId,
      'ACCOUNT',
      'Prepare lab account',
      1,
      () => resolveLabAccount(request)
    );

    accounts = buildPerUserAccountSlots(request, labAccount);

    request = await Request.findByIdAndUpdate(
      requestId,
      {
        awsAccountId: labAccount.awsAccountId,
        awsAccountIds: [labAccount.awsAccountId],
        provisionedResources: {
          ...request.provisionedResources,
          accounts,
          assignments: request.provisionedResources?.assignments || [],
          scps: request.provisionedResources?.scps || [],
          ou: request.provisionedResources?.ou || null,
          targetAccountId: request.provisionedResources?.targetAccountId || labAccount.awsAccountId,
        },
        updatedAt: new Date(),
      },
      { new: true }
    );
  }

  if (!isScpStepComplete(request.provisionedResources)) {
    const scpResult = await runStep(
      requestId,
      'SCP',
      'Apply SCP restrictions',
      2,
      () => applyScpRestrictions(request, request.awsAccountId)
    );

    accounts = accounts.map((entry) => ({
      ...entry,
      scpPolicyIds: scpResult.scps,
    }));

    request = await Request.findByIdAndUpdate(
      requestId,
      {
        provisionedResources: {
          ...request.provisionedResources,
          accounts,
          scps: scpResult.scps,
          ou: scpResult.ou,
          targetAccountId: scpResult.targetAccountId,
          scpSkipped: Boolean(scpResult.skipped),
          scpSkipReason: scpResult.skipReason || null,
          assignments: request.provisionedResources?.assignments || [],
        },
        updatedAt: new Date(),
      },
      { new: true }
    );
  }

  if ((request.identityUsers?.length || 0) < totalUsers) {
    const users = await runStep(
      requestId,
      'IDENTITY',
      'Create Identity Center users',
      3,
      async () => {
        const existingUsers = [...(request.identityUsers || [])];

        for (const account of accounts) {
          if (existingUsers.some((entry) => entry.userIndex === account.userIndex)) {
            continue;
          }

          const user = await createIdentityCenterUser(request, account.userIndex, {
            awsAccountId: account.awsAccountId,
          });
          existingUsers.push(user);
        }

        return existingUsers.sort((a, b) => (a.userIndex ?? 0) - (b.userIndex ?? 0));
      }
    );

    request = await Request.findByIdAndUpdate(
      requestId,
      { identityUsers: users, updatedAt: new Date() },
      { new: true }
    );
  }

  const accountsMissingPermissionSets = accounts.filter((entry) => !entry.permissionSetArn);
  if (accountsMissingPermissionSets.length > 0) {
    const updatedAccounts = await runStep(
      requestId,
      'PERMISSION_SET',
      'Create permission sets',
      4,
      async () => {
        const nextAccounts = [...accounts];
        const permissionSetArns = [...(request.permissionSetArns || [])];

        for (const account of accountsMissingPermissionSets) {
          const identityUser = (request.identityUsers || []).find(
            (entry) => entry.userIndex === account.userIndex
          );
          const permissionResult = await createPermissionSet(request, account.awsAccountId, {
            nameSuffix: `-u${account.userIndex + 1}`,
            username: identityUser?.username,
            userIndex: account.userIndex,
          });

          const index = nextAccounts.findIndex((entry) => entry.userIndex === account.userIndex);
          if (index >= 0) {
            nextAccounts[index] = {
              ...nextAccounts[index],
              permissionSetArn: permissionResult.permissionSetArn,
            };
          }

          permissionSetArns.push(permissionResult.permissionSetArn);
        }

        return {
          accounts: nextAccounts,
          permissionSetArns: [...new Set(permissionSetArns)],
        };
      }
    );

    accounts = updatedAccounts.accounts;
    const identityUsers = (request.identityUsers || []).map((user) => {
      const account = accounts.find((entry) => entry.userIndex === user.userIndex);
      return account?.permissionSetArn
        ? { ...user, permissionSetArn: account.permissionSetArn }
        : user;
    });

    request = await Request.findByIdAndUpdate(
      requestId,
      {
        permissionSetArns: updatedAccounts.permissionSetArns,
        identityUsers,
        provisionedResources: {
          ...request.provisionedResources,
          accounts,
        },
        updatedAt: new Date(),
      },
      { new: true }
    );
  }

  if ((request.provisionedResources?.assignments?.length || 0) < totalUsers) {
    const assignments = await runStep(
      requestId,
      'ASSIGNMENT',
      'Assign users to account',
      5,
      () =>
        assignUsersToAccount(
          request,
          request.awsAccountId,
          request.identityUsers,
          request.permissionSetArns
        )
    );

    request = await Request.findByIdAndUpdate(
      requestId,
      {
        provisionedResources: {
          ...request.provisionedResources,
          accounts,
          assignments,
        },
        updatedAt: new Date(),
      },
      { new: true }
    );
  }

  if (!request.credentialsSent) {
    await runStep(requestId, 'EMAIL', 'Send credentials email', 6, () =>
      sendCredentialsEmail(request, {
        awsAccountId: request.awsAccountId,
        awsAccountIds: [request.awsAccountId],
        identityUsers: request.identityUsers,
        costingMode: request.costingMode,
      })
    );
  }

  return complete(requestId);
}

export async function run(requestId) {
  let request = await Request.findById(requestId);
  if (!request) {
    throw new Error('Request not found');
  }

  if (['Completed', 'Expired'].includes(request.status)) {
    return request;
  }

  await initializeIdentityCenter();

  try {
    if (isPerUserCosting(request.costingMode)) {
      return runPerUserProvisioning(requestId);
    }

    return runSharedProvisioning(requestId);
  } catch (err) {
    request = await Request.findById(requestId);
    await fail(requestId, err.message || 'Provisioning failed');

    if (request) {
      await rollbackProvisionedResources(request);
      await resetRequestAfterFailure(requestId);
    }

    throw err;
  }
}
