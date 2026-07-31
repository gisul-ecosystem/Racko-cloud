/**
 * Parse a CIDR string like "103.99.38.0/24" into an array of host IP strings
 * (network and broadcast addresses excluded). Shared by the admin IP-pool
 * management endpoints and any programmatic pool seeding (e.g. the private
 * custnet1 pool auto-seeded on first use).
 */
export function parseCidr(cidr: string): string[] {
  const [networkStr, prefixStr] = cidr.split('/');
  if (!networkStr || !prefixStr) throw new Error('Invalid CIDR format. Expected x.x.x.x/prefix.');

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 1 || prefix > 32) throw new Error('Invalid prefix length.');

  const parts = networkStr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error('Invalid IP address in CIDR.');
  }

  const networkInt =
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;

  const totalHosts = Math.pow(2, 32 - prefix);
  const firstHost = (networkInt + 1) >>> 0;
  const lastHost = (networkInt + totalHosts - 2) >>> 0;

  const ips: string[] = [];
  for (let i = firstHost; i <= lastHost; i++) {
    ips.push([
      (i >>> 24) & 0xff,
      (i >>> 16) & 0xff,
      (i >>> 8) & 0xff,
      i & 0xff,
    ].join('.'));
  }
  return ips;
}
