import { azureConfig, getAzureCredential } from '../../config/azure.js';

const ARM_SCOPE = 'https://management.azure.com/.default';
const ARM_BASE = 'https://management.azure.com';

export async function getAzureArmToken() {
  const credential = getAzureCredential();
  const token = await credential.getToken(ARM_SCOPE);
  if (!token?.token) {
    throw Object.assign(new Error('Failed to acquire Azure management token.'), { statusCode: 503 });
  }
  return token.token;
}

/**
 * @param {string} path - Absolute URL or path under management.azure.com
 * @param {{ apiVersion?: string, method?: string, body?: unknown }} [opts]
 */
export async function azureArmRequest(path, { apiVersion, method = 'GET', body } = {}) {
  if (!azureConfig.subscriptionId && !path.includes('/subscriptions/')) {
    throw Object.assign(new Error('AZURE_SUBSCRIPTION_ID not set'), { statusCode: 503 });
  }

  let url = path.startsWith('http') ? path : `${ARM_BASE}${path}`;
  if (apiVersion && !url.includes('api-version=')) {
    url += `${url.includes('?') ? '&' : '?'}api-version=${encodeURIComponent(apiVersion)}`;
  }

  const token = await getAzureArmToken();

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        const message =
          data?.error?.message || data?.message || `Azure ARM ${method} failed (${res.status})`;
        throw Object.assign(new Error(message), { statusCode: res.status >= 500 ? 502 : res.status });
      }

      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
