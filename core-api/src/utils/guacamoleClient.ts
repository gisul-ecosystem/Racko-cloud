import axios, { AxiosError, type AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { logger } from './logger';
import { InternalError } from './errors';

/**
 * Guacamole REST API client.
 *
 * - Logs in once with admin credentials (cached for ~50min).
 * - Maintains a cookie jar so HAProxy GUACSRV sticky-session cookies
 *   from login are sent on all subsequent API calls to the same backend.
 * - Creates/updates a Guacamole connection per VM (idempotent by name).
 * - Builds a one-shot browser URL using GUACAMOLE_PUBLIC_URL (nginx-proxied),
 *   never the internal Docker hostname.
 *
 * REST surface used:
 *   POST   /api/tokens
 *   GET    /api/session/data/{dataSource}/connections
 *   POST   /api/session/data/{dataSource}/connections
 *   PUT    /api/session/data/{dataSource}/connections/{id}
 *   GET    /api/session/data/{dataSource}/activeConnections
 *   PATCH  /api/session/data/{dataSource}/activeConnections  (JSON Patch remove)
 *
 * Tested against Guacamole 1.5.x.
 *
 * NEVER log GUACAMOLE_PASSWORD, VM passwords, or SSH private keys.
 */

// ─── Env (read lazily; validated on first use) ────────────────────────────────

interface GuacamoleEnv {
  baseUrl: string;    // internal,  e.g. http://guac_app:8080/guacamole
  publicUrl: string;  // browser,   e.g. https://dev.racko.ai/guacamole
  username: string;
  password: string;
  requestTimeoutMs: number;
}

let cachedEnv: GuacamoleEnv | null = null;

function getEnv(): GuacamoleEnv {
  if (cachedEnv) return cachedEnv;

  const baseUrl = process.env['GUACAMOLE_BASE_URL'];
  const publicUrl = process.env['GUACAMOLE_PUBLIC_URL'];
  const username = process.env['GUACAMOLE_USERNAME'];
  const password = process.env['GUACAMOLE_PASSWORD'];

  if (!baseUrl) throw new InternalError('GUACAMOLE_BASE_URL is not configured.');
  if (!publicUrl) throw new InternalError('GUACAMOLE_PUBLIC_URL is not configured.');
  if (!username) throw new InternalError('GUACAMOLE_USERNAME is not configured.');
  if (!password) throw new InternalError('GUACAMOLE_PASSWORD is not configured.');

  cachedEnv = {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    publicUrl: publicUrl.replace(/\/+$/, ''),
    username,
    password,
    requestTimeoutMs: 10_000,
  };
  return cachedEnv;
}

// ─── HTTP instance ────────────────────────────────────────────────────────────

let cachedHttp: AxiosInstance | null = null;
const guacamoleCookieJar = new CookieJar();

function http(): AxiosInstance {
  if (cachedHttp) return cachedHttp;
  const env = getEnv();
  cachedHttp = wrapper(
    axios.create({
      baseURL: env.baseUrl,
      timeout: env.requestTimeoutMs,
      headers: { Accept: 'application/json' },
      jar: guacamoleCookieJar,
      withCredentials: true,
    })
  );
  return cachedHttp;
}

// ─── REST response shapes ────────────────────────────────────────────────────

interface TokenResponse {
  authToken: string;
  username: string;
  dataSource: string;
  availableDataSources: string[];
}

interface GuacConnection {
  identifier: string;
  name: string;
  parentIdentifier: string;
  protocol: string;
}

type GuacConnectionListResponse = Record<string, GuacConnection>;

/** Guacamole active tunnel (admin session view). */
export interface GuacActiveConnection {
  /** Active tunnel id (used in PATCH remove path). */
  identifier: string;
  /** Underlying connection definition id. */
  connectionIdentifier: string;
  /** Guacamole auth username that owns the tunnel. */
  username?: string;
  startDate?: number;
  remoteHost?: string;
}

type GuacActiveConnectionListResponse = Record<string, GuacActiveConnection>;

// ─── Public types ─────────────────────────────────────────────────────────────

export type GuacamoleProtocol = 'rdp' | 'ssh' | 'vnc';

export interface GuacConnectionParams {
  hostname: string;          // VM private IP (e.g. 10.10.10.192)
  port: number;              // 3389 / 22 / 5900
  username?: string;
  password?: string;
  privateKey?: string;       // SSH PEM
  passphrase?: string;
  ignoreCert?: boolean;      // RDP, default true (self-signed)
  securityMode?: 'any' | 'nla' | 'tls' | 'rdp';
  width?: number;
  height?: number;
}

export interface ConsoleSession {
  protocol: GuacamoleProtocol;
  clientUrl: string;         // browser-facing URL (GUACAMOLE_PUBLIC_URL)
  connectionId: string;
  expiresInSec: number;      // approx token lifetime
}

// ─── Cached admin token ───────────────────────────────────────────────────────

interface CachedToken {
  authToken: string;
  dataSource: string;
  expiresAt: number;
  /** HAProxy backend name from GUACSRV cookie (e.g. "guac1"), for sticky browser routing. */
  srvName: string;
}

let cachedToken: CachedToken | null = null;
// Guacamole token lifetime is 1h by default — refresh proactively after 50m.
const TOKEN_TTL_MS = 50 * 60 * 1000;

async function login(): Promise<CachedToken> {
  const env = getEnv();
  const body = new URLSearchParams({
    username: env.username,
    password: env.password,
  });

  try {
    const res = await http().post<TokenResponse>('/api/tokens', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.data?.authToken || !res.data?.dataSource) {
      throw new InternalError('Guacamole login returned no authToken.');
    }

    // GUACSRV is set by HAProxy for sticky sessions (e.g. "guac1|abc123") — keep the name only.
    const cookies = await guacamoleCookieJar.getCookies(env.baseUrl);
    const guacSrv = cookies.find((c) => c.key === 'GUACSRV')?.value;
    const srvName = guacSrv?.split('|')[0] ?? '';

    logger.info('Guacamole login sticky cookie captured', {
      guacSrv: guacSrv ?? null,
      srvName: srvName || '(empty)',
      cookieCount: cookies.length,
      cookieKeys: cookies.map((c) => c.key),
    });

    return {
      authToken: res.data.authToken,
      dataSource: res.data.dataSource,
      expiresAt: Date.now() + TOKEN_TTL_MS,
      srvName,
    };
  } catch (err) {
    const status = err instanceof AxiosError ? err.response?.status : undefined;
    logger.error('Guacamole login failed', {
      status,
      message: err instanceof Error ? err.message : String(err),
    });
    throw new InternalError('Guacamole authentication failed.');
  }
}

async function getToken(forceRefresh = false): Promise<CachedToken> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken;
  }
  cachedToken = await login();
  return cachedToken;
}

/**
 * Run a call with the current token. On 401/403 (token revoked/expired),
 * refresh once and retry. Any other error bubbles up.
 */
async function withToken<T>(call: (t: CachedToken) => Promise<T>): Promise<T> {
  let token = await getToken();
  try {
    return await call(token);
  } catch (err) {
    const status = err instanceof AxiosError ? err.response?.status : undefined;
    if (status === 401 || status === 403) {
      logger.info('Guacamole token expired, refreshing and retrying');
      token = await getToken(true);
      return call(token);
    }
    throw err;
  }
}

// ─── Connection helpers ───────────────────────────────────────────────────────

function dsPath(dataSource: string): string {
  return `/api/session/data/${encodeURIComponent(dataSource)}`;
}

async function findConnectionByName(name: string): Promise<GuacConnection | null> {
  return withToken(async (t) => {
    try {
      const res = await http().get<GuacConnectionListResponse>(
        `${dsPath(t.dataSource)}/connections`,
        { params: { token: t.authToken } }
      );
      const list = res.data ?? {};
      for (const id of Object.keys(list)) {
        const conn = list[id];
        if (conn && conn.name === name) return conn;
      }
      return null;
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      // Re-throw 401/403 so withToken can retry
      if (status === 401 || status === 403) throw err;
      logger.error('Guacamole list connections failed', {
        status,
        message: err instanceof Error ? err.message : String(err),
      });
      throw new InternalError('Failed to list Guacamole connections.');
    }
  });
}

function buildPayload(
  name: string,
  protocol: GuacamoleProtocol,
  params: GuacConnectionParams
): {
  name: string;
  parentIdentifier: string;
  protocol: GuacamoleProtocol;
  attributes: Record<string, string>;
  parameters: Record<string, string>;
} {
  const parameters: Record<string, string> = {
    hostname: params.hostname,
    port: String(params.port),
  };

  if (params.username) parameters['username'] = params.username;
  if (params.password) parameters['password'] = params.password;

  if (protocol === 'rdp') {
    // Display-quality parameters are set entirely by core-api — the
    // PostgreSQL display-quality trigger (003_display_quality_trigger.sql)
    // has been removed, so there is no other writer of these fields anymore.
    parameters['ignore-cert'] = String(params.ignoreCert ?? true);
    parameters['security'] = params.securityMode ?? 'any';
    parameters['resize-method'] = 'display-update';
    parameters['server-layout'] = 'en-us-qwerty';
    parameters['cursor'] = 'local';
    parameters['color-depth'] = '32';
    parameters['dpi'] = '96';
    parameters['enable-font-smoothing'] = 'true';
    parameters['enable-desktop-composition'] = 'true';
    parameters['disable-gfx'] = 'false';
    parameters['enable-wallpaper'] = 'true';
    parameters['enable-theming'] = 'true';
    parameters['enable-full-window-drag'] = 'false';
    parameters['enable-menu-animations'] = 'false';
    if (params.width) parameters['width'] = String(params.width);
    if (params.height) parameters['height'] = String(params.height);
  }

  if (protocol === 'ssh') {
    if (params.privateKey) parameters['private-key'] = params.privateKey;
    if (params.passphrase) parameters['passphrase'] = params.passphrase;
  }

  if (protocol === 'vnc') {
    parameters['color-depth'] = '16';
    parameters['cursor'] = 'remote';
    parameters['read-only'] = 'false';
    // Let Guacamole push browser size via SetDesktopSize when the server
    // supports it; unsupported servers (e.g. macOS Screen Sharing) scale in
    // place — never use RDP-style reconnect resize here.
    parameters['disable-display-resize'] = 'false';
    if (params.width) parameters['width'] = String(params.width);
    if (params.height) parameters['height'] = String(params.height);
  }

  return {
    name,
    parentIdentifier: 'ROOT',
    protocol,
    attributes: {
      'max-connections': '1',
      'max-connections-per-user': '1',
    },
    parameters,
  };
}

async function upsertConnection(
  name: string,
  protocol: GuacamoleProtocol,
  params: GuacConnectionParams
): Promise<GuacConnection> {
  const payload = buildPayload(name, protocol, params);
  const existing = await findConnectionByName(name);

  return withToken(async (t) => {
    try {
      if (existing) {
        await http().put(
          `${dsPath(t.dataSource)}/connections/${encodeURIComponent(existing.identifier)}`,
          payload,
          { params: { token: t.authToken } }
        );
        return { ...existing, protocol };
      }

      const res = await http().post<GuacConnection>(
        `${dsPath(t.dataSource)}/connections`,
        payload,
        { params: { token: t.authToken } }
      );
      if (!res.data?.identifier) {
        throw new InternalError('Guacamole create connection returned no identifier.');
      }
      return res.data;
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      if (status === 401 || status === 403) throw err;
      logger.error('Guacamole upsert connection failed', {
        status,
        name,
        message: err instanceof Error ? err.message : String(err),
      });
      throw new InternalError('Failed to create/update Guacamole connection.');
    }
  });
}

/**
 * Build the browser URL.
 *
 * Format (Guacamole 1.x + HAProxy sticky routing):
 *   {publicUrl}/?srv={srvName}#/client/{base64(...)}?token={authToken}
 *
 * `srv` must sit in the query string (before `#`) so HAProxy can read it.
 * Guacamole's client route stays in the fragment.
 */
function buildClientUrl(
  connectionId: string,
  authToken: string,
  dataSource: string,
  srvName: string
): string {
  const env = getEnv();
  const raw = `${connectionId}\u0000c\u0000${dataSource}`;
  const idHash = Buffer.from(raw, 'utf8').toString('base64').replace(/=+$/, '');
  const srvParam = srvName ? `?srv=${encodeURIComponent(srvName)}` : '';

  logger.info('Building Guacamole client URL', {
    srvName,
    publicUrl: env.publicUrl,
    connectionId,
  });

  return `${env.publicUrl}/${srvParam}#/client/${idHash}?token=${encodeURIComponent(authToken)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class GuacamoleClient {
  private static readonly KILL_CONFIRM_MAX_ATTEMPTS = 8;
  private static readonly KILL_CONFIRM_DELAY_MS = 250;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Force-disconnect live tunnels on a connection and confirm they are gone
   * before minting a new client URL (last connection wins with max-connections=1).
   */
  private async clearActiveSessionsForConnectionId(connectionIdentifier: string): Promise<number> {
    let killedTotal = 0;

    for (let attempt = 1; attempt <= GuacamoleClient.KILL_CONFIRM_MAX_ATTEMPTS; attempt++) {
      const active = await this.listActiveConnections();
      const matching = active.filter((a) => a.connectionIdentifier === connectionIdentifier);
      if (matching.length === 0) {
        if (killedTotal > 0) {
          logger.info('Guacamole connection cleared for new session', {
            connectionIdentifier,
            killedTotal,
            attempt,
          });
        }
        return killedTotal;
      }

      const ids = matching.map((a) => a.identifier);
      await this.killActiveConnections(ids);
      killedTotal += ids.length;

      if (attempt < GuacamoleClient.KILL_CONFIRM_MAX_ATTEMPTS) {
        await this.sleep(GuacamoleClient.KILL_CONFIRM_DELAY_MS);
      }
    }

    const remaining = (await this.listActiveConnections()).filter(
      (a) => a.connectionIdentifier === connectionIdentifier
    );
    if (remaining.length > 0) {
      logger.error('Guacamole active sessions still open after kill retries', {
        connectionIdentifier,
        remaining: remaining.map((a) => a.identifier),
      });
      throw new InternalError('Could not disconnect existing console session. Please try again.');
    }

    return killedTotal;
  }

  /**
   * Create or update a connection for a VM, force-disconnect any existing live
   * tunnel (last connection wins), then return a browser-facing one-shot URL
   * containing an embedded admin auth token. The URL always points at
   * GUACAMOLE_PUBLIC_URL — never the internal docker hostname.
   *
   * `name` should be stable per VM (e.g. `vm-${vmId}`) so repeated calls update
   * the same connection instead of creating duplicates.
   */
  async openConsole(
    name: string,
    protocol: GuacamoleProtocol,
    params: GuacConnectionParams
  ): Promise<ConsoleSession> {
    if (!name) throw new InternalError('Guacamole connection name is required.');
    if (!params.hostname) throw new InternalError('hostname is required.');
    if (!params.port) throw new InternalError('port is required.');

    const connection = await upsertConnection(name, protocol, params);
    const displaced = await this.clearActiveSessionsForConnectionId(connection.identifier);
    const token = await getToken();
    const clientUrl = buildClientUrl(
      connection.identifier,
      token.authToken,
      token.dataSource,
      token.srvName
    );

    logger.info('Guacamole console session created', {
      name,
      protocol,
      connectionId: connection.identifier,
      displacedSessions: displaced,
    });

    return {
      protocol,
      clientUrl,
      connectionId: connection.identifier,
      expiresInSec: Math.max(0, Math.floor((token.expiresAt - Date.now()) / 1000)),
    };
  }

  /**
   * Resolve a Guacamole connection definition id by its stable name
   * (e.g. `vm-{id}` / `externalvm-{id}`).
   */
  async getConnectionIdentifierByName(name: string): Promise<string | null> {
    const conn = await findConnectionByName(name);
    return conn?.identifier ?? null;
  }

  /**
   * List live tunnels: GET /api/session/data/{ds}/activeConnections
   */
  async listActiveConnections(): Promise<GuacActiveConnection[]> {
    return withToken(async (t) => {
      try {
        const res = await http().get<GuacActiveConnectionListResponse>(
          `${dsPath(t.dataSource)}/activeConnections`,
          { params: { token: t.authToken } }
        );
        const map = res.data ?? {};
        return Object.keys(map).map((id) => {
          const row = map[id]!;
          return {
            identifier: row.identifier || id,
            connectionIdentifier: row.connectionIdentifier,
            username: row.username,
            startDate: row.startDate,
            remoteHost: row.remoteHost,
          };
        });
      } catch (err) {
        const status = err instanceof AxiosError ? err.response?.status : undefined;
        if (status === 401 || status === 403) throw err;
        logger.error('Guacamole list activeConnections failed', {
          status,
          message: err instanceof Error ? err.message : String(err),
        });
        throw new InternalError('Failed to list Guacamole active connections.');
      }
    });
  }

  /**
   * Force-kill live tunnels: PATCH .../activeConnections with JSON Patch removes.
   * Uses the cached admin token.
   */
  async killActiveConnections(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) return;

    return withToken(async (t) => {
      const body = unique.map((id) => ({
        op: 'remove' as const,
        path: `/${id}`,
      }));

      try {
        await http().patch(`${dsPath(t.dataSource)}/activeConnections`, body, {
          params: { token: t.authToken },
          headers: { 'Content-Type': 'application/json' },
        });
        logger.info('Guacamole active connections killed', {
          count: unique.length,
          ids: unique,
        });
      } catch (err) {
        const status = err instanceof AxiosError ? err.response?.status : undefined;
        if (status === 401 || status === 403) throw err;
        logger.error('Guacamole kill activeConnections failed', {
          status,
          count: unique.length,
          message: err instanceof Error ? err.message : String(err),
        });
        throw new InternalError('Failed to kill Guacamole active connections.');
      }
    });
  }

  /**
   * Kill active tunnels for a named connection (optional Guacamole username filter).
   * Returns how many tunnels were targeted.
   */
  async killActiveSessionsForConnection(
    connectionName: string,
    options?: { username?: string }
  ): Promise<number> {
    const connectionIdentifier = await this.getConnectionIdentifierByName(connectionName);
    if (!connectionIdentifier) {
      logger.info('Guacamole kill skipped — connection not found', { connectionName });
      return 0;
    }

    const active = await this.listActiveConnections();
    const username = options?.username?.trim();
    const ids = active
      .filter((a) => a.connectionIdentifier === connectionIdentifier)
      .filter((a) => !username || a.username === username)
      .map((a) => a.identifier);

    if (ids.length === 0) return 0;
    await this.killActiveConnections(ids);
    return ids.length;
  }

  /**
   * Remove a Guacamole connection definition by stable name (e.g. externalvm-{id}).
   * No-op if the connection does not exist.
   */
  async deleteConnectionByName(connectionName: string): Promise<boolean> {
    const existing = await findConnectionByName(connectionName);
    if (!existing) {
      logger.info('Guacamole delete skipped — connection not found', { connectionName });
      return false;
    }

    return withToken(async (t) => {
      try {
        await http().delete(
          `${dsPath(t.dataSource)}/connections/${encodeURIComponent(existing.identifier)}`,
          { params: { token: t.authToken } }
        );
        logger.info('Guacamole connection deleted', {
          connectionName,
          connectionId: existing.identifier,
        });
        return true;
      } catch (err) {
        const status = err instanceof AxiosError ? err.response?.status : undefined;
        if (status === 401 || status === 403) throw err;
        if (status === 404) return false;
        logger.error('Guacamole delete connection failed', {
          status,
          connectionName,
          message: err instanceof Error ? err.message : String(err),
        });
        throw new InternalError('Failed to delete Guacamole connection.');
      }
    });
  }

  /**
   * Force a fresh admin token. Useful for tests and on rotation.
   */
  async refreshToken(): Promise<void> {
    await getToken(true);
  }
}

export const guacamoleClient = new GuacamoleClient();
