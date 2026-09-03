/**
 * Human-readable Azure marketplace / compute image SKU labels (Portal-style).
 */

function titleCaseWords(text) {
  return String(text || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function extractGeneration(sku) {
  const skuText = String(sku || '');
  if (/gen2/i.test(skuText)) return 'Gen 2';
  if (/gen1/i.test(skuText)) return 'Gen 1';
  return null;
}

function stripGeneration(sku) {
  return String(sku || '')
    .replace(/-gen[12]/gi, '')
    .replace(/_gen[12]/gi, '')
    .replace(/gen[12]$/i, '');
}

function formatUbuntuSku(sku) {
  const base = stripGeneration(sku);
  const ltsMatch = base.match(/^(\d{2})[_.-]?(\d{2})-lts/i);
  if (ltsMatch) {
    return `${ltsMatch[1]}.${ltsMatch[2]} LTS`;
  }
  const versionMatch = base.match(/^(\d{2})[_.-]?(\d{2})/);
  if (versionMatch) {
    return `${versionMatch[1]}.${versionMatch[2]}`;
  }
  return titleCaseWords(base.replace(/_/g, '.'));
}

function formatWindowsSku(sku, offer) {
  const base = stripGeneration(sku);
  const offerText = String(offer || '');

  let edition = '';
  const yearMatch = offerText.match(/(\d{4})/) || base.match(/^(\d{4})/);
  const year = yearMatch?.[1] || '';

  if (/smalldisk/i.test(base)) edition = 'Smaller Disk';
  else if (/core/i.test(base)) edition = 'Core';
  else if (/datacenter/i.test(base)) edition = 'Datacenter';
  else if (/standard/i.test(base)) edition = 'Standard';

  const parts = ['Windows Server'];
  if (year) parts.push(year);
  if (edition) parts.push(edition);
  return parts.join(' ');
}

function formatRhelSku(sku) {
  const base = stripGeneration(sku);
  const match = base.match(/(\d+(?:\.\d+)?)/);
  if (match) return `RHEL ${match[1]}`;
  return titleCaseWords(base);
}

function productNameFromPublisherOffer(publisher, offer) {
  const pub = String(publisher || '').toLowerCase();
  const off = String(offer || '').toLowerCase();

  if (/microsoftwindows/i.test(pub) || off.includes('windowsserver')) {
    return 'Windows Server';
  }
  if (/canonical/i.test(pub) || off.includes('ubuntu')) {
    return 'Ubuntu Server';
  }
  if (/redhat/i.test(pub) || off.includes('rhel')) {
    return 'Red Hat Enterprise Linux';
  }
  if (/debian/i.test(pub)) return 'Debian';
  if (/oracle/i.test(pub)) return 'Oracle Linux';
  if (/suse/i.test(pub)) return 'SUSE Linux Enterprise Server';
  if (/credativ/i.test(pub)) return 'Debian';
  if (/almalinux/i.test(pub)) return 'AlmaLinux';
  if (/rockylinux/i.test(pub)) return 'Rocky Linux';

  const offerLabel = String(offer || '')
    .replace(/-+/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b0001 com\b/i, '')
    .trim();
  return titleCaseWords(offerLabel) || titleCaseWords(publisher);
}

function versionPhraseFromSku(publisher, offer, sku) {
  const pub = String(publisher || '').toLowerCase();
  const off = String(offer || '').toLowerCase();

  if (/microsoftwindows/i.test(pub) || off.includes('windowsserver')) {
    return formatWindowsSku(sku, offer);
  }
  if (/canonical/i.test(pub) || off.includes('ubuntu')) {
    return formatUbuntuSku(sku);
  }
  if (/redhat/i.test(pub) || off.includes('rhel')) {
    return formatRhelSku(sku);
  }

  return titleCaseWords(stripGeneration(sku).replace(/_/g, '.'));
}

/**
 * Portal-style plan row title, e.g. "Ubuntu Server 22.04 LTS (Gen 2)".
 */
export function formatAzureImagePlanLabel({ publisher, offer, sku, productDisplayName } = {}) {
  const product = productDisplayName || productNameFromPublisherOffer(publisher, offer);
  const version = versionPhraseFromSku(publisher, offer, sku);
  const generation = extractGeneration(sku);

  if (/windows server/i.test(product) && /windows server/i.test(version)) {
    return generation ? `${version} (${generation})` : version;
  }

  if (version.toLowerCase().includes(product.toLowerCase())) {
    return generation ? `${version} (${generation})` : version;
  }

  const label = `${product} ${version}`.trim();
  return generation ? `${label} (${generation})` : label;
}

export function formatAzureImageVersionLabel(version) {
  const text = String(version || '').trim();
  if (!text) return null;
  return `Version ${text}`;
}

export function buildAzureImagePlanSummary({ publisher, offer, sku, version, marketplaceSummary } = {}) {
  if (marketplaceSummary) return marketplaceSummary;
  const bits = [publisher, offer, sku].filter(Boolean);
  if (version) bits.push(`latest ${version}`);
  return bits.join(' · ');
}
