/**
 * Services that exist in the catalog/API but must not appear in the main UI yet.
 * Toggle entries here when a cloud provider becomes ready.
 */
export const HIDDEN_SERVICE_KEYS = [] as const;

export type HiddenServiceKey = (typeof HIDDEN_SERVICE_KEYS)[number];

export function isServiceHiddenFromUi(serviceKey: string | null | undefined): boolean {
  if (!serviceKey) return false;
  return (HIDDEN_SERVICE_KEYS as readonly string[]).includes(serviceKey);
}
