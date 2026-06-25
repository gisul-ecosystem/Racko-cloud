import { deriveRequestAccountName } from '../../config/scpPolicies.js';

/**
 * Resolve the shared lab AWS account (like Azure uses an existing subscription).
 * Does not create new Organization member accounts.
 */
export function resolveLabAccount(request, options = {}) {
  const { userIndex = null } = options;
  const awsAccountId = String(process.env.MASTER_ACCOUNT_ID || '').trim();

  if (!awsAccountId) {
    throw new Error('MASTER_ACCOUNT_ID is not configured');
  }

  return {
    awsAccountId,
    accountName: deriveRequestAccountName(request, userIndex),
    userIndex,
  };
}
