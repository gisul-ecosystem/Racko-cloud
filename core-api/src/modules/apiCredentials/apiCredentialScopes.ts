import {
  DEFAULT_API_CREDENTIAL_SCOPES,
  type IApiCredential,
} from '../../models/apiCredential.model';

export const ALLOWED_API_CREDENTIAL_SCOPES: readonly string[] = DEFAULT_API_CREDENTIAL_SCOPES;

const allowedSet = new Set<string>(ALLOWED_API_CREDENTIAL_SCOPES);

export class ApiCredentialScopeError extends Error {
  readonly statusCode = 400;
  readonly error = 'invalid_request' as const;

  constructor(public readonly errorDescription: string) {
    super(errorDescription);
  }
}

export function resolveApiCredentialScopes(
  scopes: string[] | undefined
): IApiCredential['scopes'] {
  if (scopes === undefined || scopes.length === 0) {
    return [...DEFAULT_API_CREDENTIAL_SCOPES];
  }

  const unknown = scopes.filter((s) => !allowedSet.has(s));
  if (unknown.length > 0) {
    throw new ApiCredentialScopeError(
      `Unknown scope(s): ${unknown.join(', ')}. Allowed: ${ALLOWED_API_CREDENTIAL_SCOPES.join(', ')}.`
    );
  }

  const unique = [...new Set(scopes)];
  if (unique.length === 0) {
    return [...DEFAULT_API_CREDENTIAL_SCOPES];
  }

  return unique;
}
