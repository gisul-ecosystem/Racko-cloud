import type { Request } from 'express';

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

function parseBasicAuthorization(header: string | undefined): ClientCredentials | null {
  if (!header || !header.startsWith('Basic ')) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  const clientId = decoded.slice(0, colon);
  const clientSecret = decoded.slice(colon + 1);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function readBodyField(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * OAuth2 client credentials from HTTP Basic (preferred when present) or body fields.
 */
export function parseClientCredentials(req: Request): ClientCredentials | null {
  const basic = parseBasicAuthorization(req.headers.authorization);
  if (basic) return basic;

  const clientId = readBodyField(req.body, 'client_id');
  const clientSecret = readBodyField(req.body, 'client_secret');
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
}

export function readGrantType(req: Request): string | undefined {
  return readBodyField(req.body, 'grant_type');
}
