import { ApiCredentialModel } from '../../models/apiCredential.model';
import { DUMMY_HASH, verifyPassword } from '../../utils/argon2';
import { API_ACCESS_TOKEN_EXPIRES_SEC, signApiAccessToken } from '../../utils/jwt';
import { OAuthError } from './oauth.errors';
import {
  assertInvalidClientAllowed,
  OAuthThrottleError,
  recordInvalidClient,
} from './oauthInvalidClientThrottle';
import type { ClientCredentials } from './parseClientCredentials';

export interface OAuthTokenSuccess {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

function invalidClient(): never {
  throw new OAuthError(401, 'invalid_client', 'Client authentication failed.');
}

function throttleKey(clientId: string | undefined, fallbackIp: string): string {
  return clientId?.trim() || `unknown:${fallbackIp}`;
}

export class OAuthService {
  async issueClientCredentialsToken(
    grantType: string | undefined,
    credentials: ClientCredentials | null,
    clientIp: string
  ): Promise<OAuthTokenSuccess> {
    if (!grantType) {
      throw new OAuthError(400, 'invalid_request', 'grant_type is required.');
    }

    if (grantType !== 'client_credentials') {
      throw new OAuthError(
        400,
        'unsupported_grant_type',
        'Only grant_type client_credentials is supported.'
      );
    }

    if (!credentials?.clientId || !credentials.clientSecret) {
      const key = throttleKey(credentials?.clientId, clientIp);
      try {
        await assertInvalidClientAllowed(key);
      } catch {
        throw new OAuthThrottleError();
      }
      await recordInvalidClient(key);
      invalidClient();
    }

    const key = throttleKey(credentials.clientId, clientIp);
    try {
      await assertInvalidClientAllowed(key);
    } catch {
      throw new OAuthThrottleError();
    }

    const doc = await ApiCredentialModel.findOne({ clientId: credentials.clientId });

    const hashToVerify = doc?.clientSecretHash ?? DUMMY_HASH;
    const secretOk = await verifyPassword(hashToVerify, credentials.clientSecret);

    if (!doc || !secretOk || doc.status !== 'active') {
      await recordInvalidClient(key);
      invalidClient();
    }

    const scope = doc.scopes.join(' ');
    const accessToken = signApiAccessToken({
      clientId: doc.clientId,
      credentialId: doc._id.toString(),
      ownerType: doc.ownerType,
      tenantId: doc.tenantId?.toString() ?? null,
      adminId: doc.adminId?.toString() ?? null,
      scopes: doc.scopes,
    });

    doc.lastUsedAt = new Date();
    await doc.save();

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: API_ACCESS_TOKEN_EXPIRES_SEC,
      scope,
    };
  }
}

export const oauthService = new OAuthService();
