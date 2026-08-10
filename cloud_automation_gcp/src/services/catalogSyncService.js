import { ensureDefaultCatalog } from './catalogSeedService.js';

export async function syncGcpCatalog() {
  return ensureDefaultCatalog();
}
