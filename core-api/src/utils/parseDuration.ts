/**
 * Parses a JWT-style duration string into milliseconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days)
 * Examples: '15m' → 900000, '7d' → 604800000, '2h' → 7200000
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected format: 15m, 7d, 2h, 30s`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default:  throw new Error(`Unknown duration unit: "${unit}"`);
  }
}
