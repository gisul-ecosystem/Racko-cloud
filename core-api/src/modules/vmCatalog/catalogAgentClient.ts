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
