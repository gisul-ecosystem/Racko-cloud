import { CreateUserCommand, ListUsersCommand } from '@aws-sdk/client-identitystore';
import crypto from 'crypto';
import { identityStoreClient, IDENTITY_STORE_ID, formatIdentityCenterError } from '../../config/aws.js';
import { deriveAccountEmail, deriveUsername } from '../../config/scpPolicies.js';
import { withRetry } from '../../utils/retry.js';

function generateTemporaryPassword() {
  // Generated for reference only — AWS sends its own activation email; password is not set via API.
  const base = crypto.randomBytes(12).toString('base64url');
  return `Rk!${base}9a`;
}

function isDuplicateIdentityError(err) {
  const message = String(err?.message || '').toLowerCase();
  return (
    err?.name === 'ConflictException' ||
    message.includes('duplicate') ||
    message.includes('already exists')
  );
}

async function findIdentityCenterUserByUsername(username) {
  try {
    const response = await identityStoreClient.send(
      new ListUsersCommand({
        IdentityStoreId: IDENTITY_STORE_ID,
        Filters: [{ AttributePath: 'UserName', AttributeValue: username }],
        MaxResults: 1,
      })
    );

    return response.Users?.[0] || null;
  } catch (err) {
    throw formatIdentityCenterError(err, 'List Identity Center users');
  }
}

function buildIdentityUserRecord({ index, email, username, userId, temporaryPassword, context }) {
  return {
    userIndex: index,
    email,
    username,
    userId,
    temporaryPassword,
    needsActivation: temporaryPassword != null,
    reusedExistingUser: temporaryPassword == null,
    awsAccountId: context.awsAccountId || undefined,
    accountCreationRequestId: context.accountCreationRequestId || undefined,
    permissionSetArn: context.permissionSetArn || undefined,
  };
}

export async function createIdentityCenterUser(request, index, context = {}) {
  if (!IDENTITY_STORE_ID) {
    throw new Error('AWS_SSO_IDENTITY_STORE_ID is not configured');
  }

  const username = deriveUsername(request, index);
  const email = deriveAccountEmail(request, index);
  const existing = await findIdentityCenterUserByUsername(username);

  if (existing?.UserId) {
    console.info(
      `[identityProvisioner] Reusing existing Identity Center user ${username} (${existing.UserId})`
    );
    return buildIdentityUserRecord({
      index,
      email,
      username,
      userId: existing.UserId,
      temporaryPassword: null,
      context,
    });
  }

  const temporaryPassword = generateTemporaryPassword();
  const [givenName, familyName = 'Lab'] = username.split('-');

  try {
    const created = await withRetry(
      async () => {
        return identityStoreClient.send(
          new CreateUserCommand({
            IdentityStoreId: IDENTITY_STORE_ID,
            UserName: username,
            DisplayName: `${givenName} ${familyName}`.trim(),
            Name: {
              GivenName: givenName,
              FamilyName: familyName,
            },
            Emails: [{ Value: email, Primary: true, Type: 'work' }],
          })
        );
      },
      { maxAttempts: 3, delayMs: 2000 }
    );

    return buildIdentityUserRecord({
      index,
      email,
      username,
      userId: created.UserId,
      temporaryPassword,
      context,
    });
  } catch (err) {
    if (!isDuplicateIdentityError(err)) {
      throw err;
    }

    const recovered = await findIdentityCenterUserByUsername(username);
    if (!recovered?.UserId) {
      throw err;
    }

    console.info(
      `[identityProvisioner] Reusing Identity Center user after duplicate create: ${username}`
    );
    return buildIdentityUserRecord({
      index,
      email,
      username,
      userId: recovered.UserId,
      temporaryPassword: null,
      context,
    });
  }
}

export async function createIdentityCenterUsers(request) {
  if (!IDENTITY_STORE_ID) {
    throw new Error('AWS_SSO_IDENTITY_STORE_ID is not configured');
  }

  const accountCount = Number(request.accountCount) || 1;
  const users = [];

  for (let index = 0; index < accountCount; index += 1) {
    users.push(await createIdentityCenterUser(request, index));
  }

  return users;
}

export async function rollbackIdentityUsers(users = []) {
  const { DeleteUserCommand } = await import('@aws-sdk/client-identitystore');
  if (!IDENTITY_STORE_ID) return;

  for (const user of users) {
    if (!user?.userId) continue;
    try {
      await identityStoreClient.send(
        new DeleteUserCommand({
          IdentityStoreId: IDENTITY_STORE_ID,
          UserId: user.userId,
        })
      );
    } catch (err) {
      console.error(`Identity user rollback failed for ${user.userId}:`, err.message);
    }
  }
}
