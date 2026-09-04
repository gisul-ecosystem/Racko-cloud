/**
 * Human-readable Azure marketplace / compute image SKU labels (Portal-style).
 * Targets Azure MarketplaceOffersBlade naming, e.g.
 * "Enterprise multi-session, version 22H2 - x64 Gen 2"
 */

function titleCaseWords(text) {
  return String(text || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word)) return word.toUpperCase();
      if (/^(lts|ltsc|ltsb|avd|evd|sql)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractGeneration(sku) {
  const skuText = String(sku || '');
  if (/-g2\b|_g2\b|gen2/i.test(skuText)) return 'Gen 2';
  if (/-g1\b|_g1\b|gen1/i.test(skuText)) return 'Gen 1';
  // Desktop SKUs without -g2 are Gen 1 in Azure Portal
  if (/^win(10|11)-/i.test(skuText) || /^\d{2}h\d-/i.test(skuText)) return 'Gen 1';
  return null;
}

function stripGeneration(sku) {
  return String(sku || '')
    .replace(/-g[12]\b/gi, '')
    .replace(/_g[12]\b/gi, '')
    .replace(/-gen[12]\b/gi, '')
    .replace(/_gen[12]\b/gi, '')
    .replace(/gen[12]$/i, '');
}

function isWindowsDesktop(publisher, offer) {
  const pub = String(publisher || '').toLowerCase();
  const off = String(offer || '').toLowerCase();
  return (
    pub.includes('microsoftwindowsdesktop') ||
    /^windows-1[01]/.test(off) ||
    off.includes('windows-10') ||
    off.includes('windows-11')
  );
}

function isWindowsServer(publisher, offer) {
  const pub = String(publisher || '').toLowerCase();
  const off = String(offer || '').toLowerCase();
  if (isWindowsDesktop(publisher, offer)) return false;
  return (
    pub.includes('microsoftwindowsserver') ||
    pub.includes('windowsserver') ||
    off === 'windowsserver' ||
    off.includes('windowsserver')
  );
}

function desktopEditionFromSku(sku) {
  const s = stripGeneration(sku).toLowerCase();

  if (/\b(avd|evd|multisession|multi-session|ent-for-vd|enterprise-for-virtual)\b/.test(s)) {
    return 'Enterprise multi-session';
  }
  if (/\bentn\b|enterprise-?n\b/.test(s)) return 'Enterprise N';
  if (/\bpron\b|pro-?n\b/.test(s)) return 'Pro N';
  if (/\bent\b|enterprise\b/.test(s)) return 'Enterprise';
  if (/\bpro\b/.test(s)) return 'Pro';
  if (/\bhome\b/.test(s)) return 'Home';
  return null;
}

function desktopChannelFromSku(sku) {
  const s = stripGeneration(sku).toLowerCase();

  // LTSC / LTSB first (Portal omits "version" word for these)
  if (/\bltsb\b/.test(s) || /2016.*ltsb|ltsb.*2016/.test(s)) {
    const year = s.match(/(20\d{2})/)?.[1] || '2016';
    return { kind: 'ltsb', year };
  }

  if (/\bltsc\b/.test(s) || /ent-ltsc|entn-ltsc/.test(s)) {
    let year = s.match(/ltsc[_\-]?(20\d{2})/)?.[1] || s.match(/(20\d{2})[_\-]?ltsc/)?.[1];
    if (!year && /\b19h2\b|\b1809\b|\b2019\b/.test(s)) year = '2019';
    if (!year && /\b1607\b|\b2016\b/.test(s)) year = '2016';
    if (!year && /\b21h2\b|\b2021\b/.test(s)) year = '2021';
    if (!year && /\b24h2\b|\b2024\b/.test(s)) year = '2024';
    year = year || '2021';
    return { kind: 'ltsc', year };
  }

  const channel = s.match(/\b(\d{2})h(\d)\b/i);
  if (channel) {
    return { kind: 'channel', label: `${channel[1].toUpperCase()}H${channel[2]}` };
  }

  // Older style: 20h2-pro-g2
  const old = s.match(/^(\d{2})h(\d)/i);
  if (old) {
    return { kind: 'channel', label: `${old[1].toUpperCase()}H${old[2]}` };
  }

  return null;
}

/**
 * Azure Portal Windows 10 / Windows 11 plan row, e.g.
 * "Enterprise multi-session, version 22H2 - x64 Gen 2"
 */
function formatWindowsDesktopSku(sku) {
  const edition = desktopEditionFromSku(sku) || 'Enterprise';
  const channel = desktopChannelFromSku(sku);
  const generation = extractGeneration(sku) || 'Gen 1';
  const arch = /arm/i.test(String(sku)) ? 'Arm64' : 'x64';

  let mid = '';
  if (channel?.kind === 'channel') {
    mid = `, version ${channel.label}`;
  } else if (channel?.kind === 'ltsc') {
    // Portal: "Enterprise LTSC 2021" or "Enterprise 2019 LTSC"
    if (channel.year === '2019' || channel.year === '2016') {
      return `${edition} ${channel.year} LTSC - ${arch} ${generation}`;
    }
    return `${edition} LTSC ${channel.year} - ${arch} ${generation}`;
  } else if (channel?.kind === 'ltsb') {
    return `${edition} ${channel.year} LTSB - ${arch} ${generation}`;
  }

  return `${edition}${mid} - ${arch} ${generation}`;
}

/**
 * Azure Portal Windows Server plan row, e.g.
 * "Windows Server 2022 Datacenter: Azure Edition Hotpatch - x64 Gen 2"
 * or simpler "Datacenter - x64 Gen 2" when product name is already known.
 */
function formatWindowsServerSku(sku, offer) {
  const raw = String(sku || '');
  const base = stripGeneration(raw).toLowerCase();
  const generation = extractGeneration(raw);
  const arch = /arm/i.test(raw) ? 'Arm64' : 'x64';

  const smalldisk = /smalldisk/i.test(base);
  const year =
    String(offer || '').match(/(20\d{2})/)?.[1] ||
    base.match(/^(20\d{2})/)?.[1] ||
    base.match(/(20\d{2})/)?.[1] ||
    '';

  let edition = 'Datacenter';
  if (/azure-edition-hotpatch|azureeditionhotpatch|hotpatch/i.test(base)) {
    edition = 'Datacenter: Azure Edition Hotpatch';
  } else if (/azure-edition-core|azureeditioncore/i.test(base)) {
    edition = 'Datacenter: Azure Edition Core';
  } else if (/azure-edition|azureedition/i.test(base)) {
    edition = 'Datacenter: Azure Edition';
  } else if (/datacenter-core|datacenter_core|server.core|servercore/i.test(base) || /\bcore\b/.test(base)) {
    edition = 'Datacenter Server Core';
  } else if (/datacenter/i.test(base)) {
    edition = 'Datacenter';
  } else if (/standard-core/i.test(base)) {
    edition = 'Standard Server Core';
  } else if (/standard/i.test(base)) {
    edition = 'Standard';
  }

  const prefix = smalldisk ? '[smalldisk] ' : '';
  const yearBit = year ? `Windows Server ${year} ` : 'Windows Server ';
  const genBit = generation ? ` - ${arch} ${generation}` : ` - ${arch} Gen 2`;
  return `${prefix}${yearBit}${edition}${genBit}`;
}

function formatUbuntuSku(sku) {
  const base = stripGeneration(sku);
  const generation = extractGeneration(sku);
  const ltsMatch = base.match(/^(\d{2})[_.-]?(\d{2})-lts/i);
  let title;
  if (ltsMatch) {
    title = `${ltsMatch[1]}.${ltsMatch[2]} LTS`;
  } else {
    const versionMatch = base.match(/^(\d{2})[_.-]?(\d{2})/);
    title = versionMatch
      ? `${versionMatch[1]}.${versionMatch[2]}`
      : titleCaseWords(base.replace(/_/g, '.'));
  }
  return generation ? `${title} - x64 ${generation}` : title;
}

function formatRhelSku(sku) {
  const base = stripGeneration(sku);
  const generation = extractGeneration(sku);
  const match = base.match(/(\d+(?:\.\d+)?)/);
  const title = match ? `RHEL ${match[1]}` : titleCaseWords(base);
  return generation ? `${title} - x64 ${generation}` : title;
}

function productNameFromPublisherOffer(publisher, offer) {
  const pub = String(publisher || '').toLowerCase();
  const off = String(offer || '').toLowerCase();

  if (isWindowsDesktop(publisher, offer)) {
    if (off.includes('windows-11') || off.includes('win11')) return 'Windows 11';
    if (off.includes('windows-10') || off.includes('win10')) return 'Windows 10';
    return 'Windows';
  }
  if (isWindowsServer(publisher, offer)) return 'Windows Server';
  if (/canonical/i.test(pub) || off.includes('ubuntu')) return 'Ubuntu Server';
  if (/redhat/i.test(pub) || off.includes('rhel')) return 'Red Hat Enterprise Linux';
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

/**
 * Portal-style plan row title.
 * Windows Desktop returns the full Portal string (edition + channel + arch/gen).
 */
export function formatAzureImagePlanLabel({ publisher, offer, sku, productDisplayName } = {}) {
  if (isWindowsDesktop(publisher, offer)) {
    return formatWindowsDesktopSku(sku);
  }

  if (isWindowsServer(publisher, offer)) {
    return formatWindowsServerSku(sku, offer);
  }

  const product = productDisplayName || productNameFromPublisherOffer(publisher, offer);
  const pub = String(publisher || '').toLowerCase();
  const off = String(offer || '').toLowerCase();

  let version;
  if (/canonical/i.test(pub) || off.includes('ubuntu')) {
    version = formatUbuntuSku(sku);
  } else if (/redhat/i.test(pub) || off.includes('rhel')) {
    version = formatRhelSku(sku);
  } else {
    const generation = extractGeneration(sku);
    const base = titleCaseWords(stripGeneration(sku).replace(/_/g, '.'));
    version = generation ? `${base} - x64 ${generation}` : base;
  }

  if (version.toLowerCase().includes(String(product).toLowerCase())) {
    return version;
  }

  return `${product} ${version}`.trim();
}

/**
 * Secondary line under the plan. Portal already embeds channel in the title for
 * Windows Desktop, so skip noisy raw image build numbers there.
 */
export function formatAzureImageVersionLabel(version, { publisher, offer, sku } = {}) {
  if (isWindowsDesktop(publisher, offer) || isWindowsServer(publisher, offer)) {
    return null;
  }
  const text = String(version || '').trim();
  if (!text) return null;
  // Prefer not to show long OS build stamps (e.g. 19045.6456.251117)
  if (/^\d+\.\d+\.\d+/.test(text)) return null;
  return `Version ${text}`;
}

export function buildAzureImagePlanSummary({ publisher, offer, sku, version, marketplaceSummary } = {}) {
  if (marketplaceSummary) return marketplaceSummary;
  const bits = [publisher, offer, sku].filter(Boolean);
  if (version) bits.push(`latest ${version}`);
  return bits.join(' · ');
}
