import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  EnablePolicyTypeCommand,
  ListRootsCommand,
} from '@aws-sdk/client-organizations';
import { orgsClient } from '../../config/aws.js';
import { buildScpDocument } from '../../config/scpPolicies.js';
import { pollUntil } from '../../utils/polling.js';

export function isScpPolicyTypeError(error) {
  const message = String(error?.message || error?.Error?.Message || '').toLowerCase();
  const code = String(error?.name || error?.Code || '');

  return (
    code === 'PolicyTypeNotEnabledException' ||
    message.includes('enabled policy types') ||
    message.includes('policytype not enabled')
  );
}

function isScpEnabled(status) {
  return String(status || '').toUpperCase() === 'ENABLED';
}

function buildSkippedScpResult(accountId, skipReason) {
  console.warn(
    `[scpProvisioner] Skipping SCP restrictions for account ${accountId}: ${skipReason}. ` +
      'Service access will be enforced via Identity Center permission sets only.'
  );

  return {
    ou: null,
    scps: [],
    policyName: null,
    targetAccountId: accountId,
    skipped: true,
    skipReason,
  };
}

async function getOrganizationRoot() {
  const response = await orgsClient.send(new ListRootsCommand({}));
  const root = response.Roots?.[0];

  if (!root?.Id) {
    throw new Error('Unable to resolve AWS Organizations root');
  }

  return root;
}

async function waitForScpPolicyTypeEnabled(rootId) {
  await pollUntil(
    async () => {
      const root = await getOrganizationRoot();
      const scpType = root.PolicyTypes?.find((entry) => entry.Type === 'SERVICE_CONTROL_POLICY');

      return {
        status: scpType?.Status || 'DISABLED',
      };
    },
    {
      intervalMs: 3000,
      timeoutMs: 2 * 60 * 1000,
      isComplete: (result) => isScpEnabled(result.status),
    }
  );
}

export async function ensureScpPolicyTypeEnabled() {
  const root = await getOrganizationRoot();
  const scpType = root.PolicyTypes?.find((entry) => entry.Type === 'SERVICE_CONTROL_POLICY');

  if (isScpEnabled(scpType?.Status)) {
    return root.Id;
  }

  await orgsClient.send(
    new EnablePolicyTypeCommand({
      RootId: root.Id,
      PolicyType: 'SERVICE_CONTROL_POLICY',
    })
  );

  await waitForScpPolicyTypeEnabled(root.Id);
  return root.Id;
}

async function createAndAttachScp(request, awsAccountId, options = {}) {
  const accountId = String(awsAccountId || '').trim();
  const { policyNameSuffix = '' } = options;

  const selectedNames = (request.selectedServices || []).map((entry) => entry.serviceName);
  const policyDocument = buildScpDocument(selectedNames);
  const policyName = `RackoLab-${String(request._id).slice(-8)}${policyNameSuffix}-${Date.now()}`;

  const createPolicyResponse = await orgsClient.send(
    new CreatePolicyCommand({
      Content: JSON.stringify(policyDocument),
      Description: `Lab SCP for request ${request._id}`,
      Name: policyName,
      Type: 'SERVICE_CONTROL_POLICY',
    })
  );

  const policyId = createPolicyResponse.Policy?.PolicySummary?.Id;
  if (!policyId) {
    throw new Error('Failed to create SCP policy');
  }

  await orgsClient.send(
    new AttachPolicyCommand({
      PolicyId: policyId,
      TargetId: accountId,
    })
  );

  return {
    ou: null,
    scps: [policyId],
    policyName,
    targetAccountId: accountId,
    skipped: false,
    skipReason: null,
  };
}

export async function applyScpRestrictions(request, awsAccountId, options = {}) {
  const accountId = String(awsAccountId || '').trim();
  if (!accountId) {
    throw new Error('AWS account ID is required to apply SCP restrictions');
  }

  if (process.env.ENABLE_SCP_RESTRICTIONS === 'false') {
    return buildSkippedScpResult(
      accountId,
      'SCP restrictions disabled via ENABLE_SCP_RESTRICTIONS=false'
    );
  }

  try {
    await ensureScpPolicyTypeEnabled();
    return await createAndAttachScp(request, accountId, options);
  } catch (err) {
    if (!isScpPolicyTypeError(err)) {
      throw err;
    }

    try {
      await ensureScpPolicyTypeEnabled();
      return await createAndAttachScp(request, accountId, options);
    } catch (retryErr) {
      return buildSkippedScpResult(
        accountId,
        retryErr?.message || err?.message || 'SCP policy type is not enabled in AWS Organizations'
      );
    }
  }
}

export function isScpStepComplete(provisionedResources = {}) {
  return Boolean(provisionedResources?.scpSkipped) || (provisionedResources?.scps?.length ?? 0) > 0;
}

export async function rollbackScpResources(provisionedResources = {}) {
  if (provisionedResources.scpSkipped) {
    return;
  }

  const { DeletePolicyCommand, DetachPolicyCommand } = await import('@aws-sdk/client-organizations');
  const policyIds = provisionedResources.scps || [];
  const detachTargetId =
    provisionedResources.targetAccountId || provisionedResources.ou || null;

  for (const policyId of policyIds) {
    try {
      if (detachTargetId) {
        await orgsClient.send(new DetachPolicyCommand({ PolicyId: policyId, TargetId: detachTargetId }));
      }
      await orgsClient.send(new DeletePolicyCommand({ PolicyId: policyId }));
    } catch (err) {
      console.error(`SCP rollback failed for ${policyId}:`, err.message);
    }
  }
}
