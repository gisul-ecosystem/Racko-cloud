/** Auto-provision cloud providers compared by the reseller. */
export const CLOUD_PROVIDERS = ['aws', 'azure', 'oci', 'gcp'];

/**
 * Normalize provider filter from request body/query.
 * Accepts array (`["azure"]`), comma string (`"aws,azure"`), or single string (`"oci"`).
 * Omit or empty → all providers.
 */
export function normalizeProviders(input) {
  if (input == null || input === '') {
    return [...CLOUD_PROVIDERS];
  }

  let list = input;
  if (typeof input === 'string') {
    list = input.split(',');
  }
  if (!Array.isArray(list) || list.length === 0) {
    return [...CLOUD_PROVIDERS];
  }

  const normalized = [
    ...new Set(list.map((p) => String(p).trim().toLowerCase()).filter(Boolean)),
  ];

  const invalid = normalized.filter((p) => !CLOUD_PROVIDERS.includes(p));
  if (invalid.length) {
    const err = new Error(
      `Invalid providers: ${invalid.join(', ')}. Allowed: ${CLOUD_PROVIDERS.join(', ')}`
    );
    err.statusCode = 400;
    throw err;
  }

  return normalized;
}
