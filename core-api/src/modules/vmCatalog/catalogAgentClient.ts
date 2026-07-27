import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface CatalogAgentPurchaseInput {
  category: string;
  planId: string;
  planName: string;
  billing: string;
  template: string;
  quantity: number;
  scrapeOnly?: boolean;
}

export interface CatalogAgentServerDetails {
  hostname: string | null;
  ipAddress: string | null;
  username: string | null;
  password: string | null;
  protocol: 'ssh' | 'rdp' | null;
  externalRef: string | null;
  rawLabel: string | null;
}

export interface CatalogAgentPurchaseResult {
  purchased: boolean;
  purchase: unknown;
  server: CatalogAgentServerDetails;
  fetchedAt: string;
}

export type CatalogAgentError = Error & {
  status?: number;
  code?: string;
  purchase?: { status?: number; ok?: boolean; insufficientBalance?: boolean };
};

function agentBaseUrl(): string {
  return String(config.CREATE_VM_AGENT_URL || 'http://127.0.0.1:3789').replace(/\/$/, '');
}

async function postAgent(
  path: string,
  input: CatalogAgentPurchaseInput,
  logLabel: string
): Promise<CatalogAgentPurchaseResult> {
  const url = `${agentBaseUrl()}${path}`;
  logger.info(`[VmCatalog] Calling catalog agent ${logLabel}`, {
    url,
    category: input.category,
    planId: input.planId,
    scrapeOnly: Boolean(input.scrapeOnly),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as CatalogAgentPurchaseResult & {
      error?: string;
      code?: string;
      purchase?: CatalogAgentError['purchase'];
    };

    if (!res.ok) {
      const err: CatalogAgentError = new Error(
        data.error || `Catalog agent ${logLabel} failed (HTTP ${res.status})`
      );
      err.status = res.status;
      err.code = data.code;
      err.purchase = data.purchase;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function callCatalogAgentPurchase(
  input: CatalogAgentPurchaseInput
): Promise<CatalogAgentPurchaseResult> {
  return postAgent('/api/purchase', input, 'purchase');
}

/** Scrape /admin/server only — no Webyne checkout. */
export async function callCatalogAgentScrape(
  input: CatalogAgentPurchaseInput
): Promise<CatalogAgentPurchaseResult> {
  return postAgent('/api/scrape', { ...input, scrapeOnly: true }, 'scrape');
}

export interface CatalogAgentChangeOsInput {
  externalRef: string;
  targetOs?: string;
  template?: string;
}

export interface CatalogAgentChangeOsResult {
  changed: boolean;
  targetOs: string;
  template: string;
  externalRef: string;
  server: CatalogAgentServerDetails;
  fetchedAt: string;
}

export async function callCatalogAgentChangeOs(
  input: CatalogAgentChangeOsInput
): Promise<CatalogAgentChangeOsResult> {
  const url = `${agentBaseUrl()}/api/change-os`;
  logger.info('[VmCatalog] Calling catalog agent change-os', {
    url,
    externalRef: input.externalRef,
    targetOs: input.targetOs || 'windows',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as CatalogAgentChangeOsResult & {
      error?: string;
      code?: string;
    };

    if (!res.ok) {
      const err: CatalogAgentError = new Error(
        data.error || `Catalog agent change-os failed (HTTP ${res.status})`
      );
      err.status = res.status;
      err.code = data.code;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export type CatalogPowerAction = 'virtualizor' | 'start' | 'stop' | 'reboot';

export interface CatalogAgentPowerInput {
  externalRef: string;
  action: CatalogPowerAction;
}

export interface CatalogAgentPowerResult {
  ok: boolean;
  action: CatalogPowerAction;
  externalRef: string;
  panelUrl?: string;
  machineshowUrl?: string;
  fetchedAt: string;
}

export async function callCatalogAgentPower(
  input: CatalogAgentPowerInput
): Promise<CatalogAgentPowerResult> {
  const url = `${agentBaseUrl()}/api/power`;
  logger.info('[VmCatalog] Calling catalog agent power', {
    url,
    externalRef: input.externalRef,
    action: input.action,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as CatalogAgentPowerResult & {
      error?: string;
      code?: string;
    };

    if (!res.ok) {
      const err: CatalogAgentError = new Error(
        data.error || `Catalog agent power failed (HTTP ${res.status})`
      );
      err.status = res.status;
      err.code = data.code;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}
