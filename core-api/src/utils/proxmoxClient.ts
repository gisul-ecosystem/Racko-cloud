import axios, { type AxiosInstance, type AxiosError } from 'axios';
import https from 'https';
import { config } from '../config';
import { logger } from './logger';
import { ProxmoxConnectionError, ProxmoxAuthError } from './errors';

/**
 * Singleton Axios instance for all Proxmox VE API calls.
 *
 * Auth: PVE API Token — sent as Authorization header on every request.
 * SSL:  Configurable via PROXMOX_VERIFY_SSL (false = allow self-signed certs).
 * Timeout: 10 seconds — never hangs indefinitely.
 *
 * NEVER log PROXMOX_TOKEN_SECRET anywhere.
 */

function createProxmoxClient(): AxiosInstance {
  const httpsAgent = new https.Agent({
    rejectUnauthorized: config.PROXMOX_VERIFY_SSL,
  });

  const instance = axios.create({
    baseURL: `${config.PROXMOX_HOST}/api2/json`,
    timeout: config.PROXMOX_REQUEST_TIMEOUT_MS,
    headers: {
      // Format: PVEAPIToken=<TOKEN_ID>=<TOKEN_SECRET>
      Authorization: `PVEAPIToken=${config.PROXMOX_TOKEN_ID}=${config.PROXMOX_TOKEN_SECRET}`,
      'Content-Type': 'application/json',
    },
    httpsAgent,
  });

  // Response error interceptor — maps Proxmox errors to structured AppErrors
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ errors?: Record<string, string>; message?: string }>) => {
      // Log full error internally — never expose host or token secret
      logger.error('Proxmox API error', {
        status: error.response?.status,
        endpoint: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        proxmoxMessage: error.response?.data?.message ?? error.message,
        proxmoxErrors: error.response?.data?.errors ?? null,
        proxmoxData: error.response?.data ?? null,
        // Deliberately omit: baseURL (contains internal IP), headers (contains token)
      });

      const proxmoxMessage = (): string => {
        const data = error.response?.data;
        if (data?.message) return data.message;
        if (data?.errors) return Object.values(data.errors).join('; ');
        return error.message;
      };

      if (!error.response) {
        throw new ProxmoxConnectionError(
          `Proxmox unreachable: ${error.message}`,
          error.config?.url,
          0
        );
      }

      const { status } = error.response;
      const detail = proxmoxMessage();

      if (status === 401) {
        throw new ProxmoxAuthError(
          `Proxmox authentication failed (401) — check PROXMOX_TOKEN_ID`,
          error.config?.url
        );
      }

      if (status === 403) {
        throw new ProxmoxAuthError(
          `Proxmox permission denied (403) — token lacks required permissions`,
          error.config?.url
        );
      }

      throw new ProxmoxConnectionError(detail, error.config?.url, status);
    }
  );

  return instance;
}

// Singleton — one instance shared across all service calls
export const proxmoxClient: AxiosInstance = createProxmoxClient();
