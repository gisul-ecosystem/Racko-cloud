const SIMPLE_ICON_BASE = 'https://cdn.simpleicons.org';

const NAME_TO_ICON_SLUG: Array<{ test: RegExp; slug: string }> = [
  { test: /anaconda/i, slug: 'anaconda' },
  { test: /chrome/i, slug: 'googlechrome' },
  { test: /conduktor|kafka/i, slug: 'apachekafka' },
  { test: /docker/i, slug: 'docker' },
  { test: /eclipse/i, slug: 'eclipseide' },
  { test: /^git$/i, slug: 'git' },
  { test: /jdk|java/i, slug: 'openjdk' },
  { test: /webview2|edge/i, slug: 'microsoftedge' },
  { test: /mobaxterm/i, slug: 'windows' },
  { test: /mysql/i, slug: 'mysql' },
  { test: /offset\s*explorer/i, slug: 'apachekafka' },
  { test: /postman/i, slug: 'postman' },
  { test: /python/i, slug: 'python' },
  { test: /vs\s*code|visual\s*studio\s*code/i, slug: 'visualstudiocode' },
  { test: /virtualbox/i, slug: 'virtualbox' },
  { test: /wsl|windows\s*subsystem/i, slug: 'windows' },
  { test: /winscp/i, slug: 'winscp' },
];

function softwareMonogram(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return 'SW';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function fallbackMonogramDataUri(name: string): string {
  const letters = softwareMonogram(name);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="18" fill="#F3F4F6"/>` +
    `<text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"` +
    ` font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#374151">${letters}</text>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function inferIconSlug(name: string): string | null {
  for (const row of NAME_TO_ICON_SLUG) {
    if (row.test.test(name)) return row.slug;
  }
  return null;
}

export function resolveSoftwareIconUrl(name: string, iconUrl?: string | null): string {
  const explicit = iconUrl?.trim();
  if (explicit) return explicit;

  const slug = inferIconSlug(name);
  if (slug) return `${SIMPLE_ICON_BASE}/${slug}`;

  return fallbackMonogramDataUri(name);
}
