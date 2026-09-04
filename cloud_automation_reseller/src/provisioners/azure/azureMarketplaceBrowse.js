import { ComputeManagementClient } from '@azure/arm-compute';

import { azureConfig, getAzureCredential, validateAzureConfig } from '../../config/azure.js';

import { azureArmRequest } from './azureArmClient.js';

import { normalizeAzureRegion } from './azureSkuAvailability.js';

import { formatAzureImagePlanLabel, buildAzureImagePlanSummary } from './azureImageSkuLabels.js';



const MARKETPLACE_API = '2023-01-01-preview';

const MARKETPLACE_TRY_MS = 8_000;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const MARKETPLACE_SKIP_MS = 60 * 60 * 1000;



const offerCardsCache = new Map();

const buildInFlight = new Map();

let marketplaceApiSkipUntil = 0;



const PREFERRED_PUBLISHERS = {

  windows: [

    'MicrosoftWindowsServer',

    'MicrosoftWindowsDesktop',

    'microsoftwindowsdesktop',

    'MicrosoftSQLServer',

  ],

  linux: [

    'Canonical',

    'RedHat',

    'RedHat-RHUI',

    'Debian',

    'OpenLogic',

    'Oracle-Linux',

    'suse',

    'almalinux',

    'rockylinux',

  ],

};



function asResourceList(result) {

  return Array.isArray(result) ? result : [];

}



function publisherMatchesOsType(publisher, osType) {

  const p = String(publisher).toLowerCase();

  const isWindows =

    p.includes('windows') || p.includes('windowsserver') || p.startsWith('microsoftwindows');

  return osType === 'windows' ? isWindows : !isWindows;

}



function prioritizePublishers(names, osType) {

  const preferred = PREFERRED_PUBLISHERS[osType] || [];

  const rank = (name) => {

    const idx = preferred.findIndex((p) => p.toLowerCase() === String(name).toLowerCase());

    return idx >= 0 ? idx : preferred.length + 1;

  };

  return [...names].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));

}



function formatDisplayName(publisher, offer) {

  const pub = String(publisher || '');

  const off = String(offer || '');

  const offLower = off.toLowerCase();

  // Match Azure Portal MarketplaceOffersBlade product titles where possible
  if (/^windowsserver$/i.test(off)) return 'Windows Server';
  if (/^windows-11$/i.test(off)) return 'Windows 11';
  if (/^windows-10$/i.test(off)) return 'Windows 10';
  if (/windows-11.*arm|arm64/i.test(off)) return 'Windows 11 Arm64';
  if (/sql.*2025|sql2025/i.test(off)) return 'SQL Server 2025 on Windows Server 2025';
  if (/sql.*2022|sql2022/i.test(off)) return 'SQL Server 2022 on Windows Server 2022';
  if (/sql.*2019|sql2019/i.test(off)) return 'SQL Server 2019 on Windows Server 2019';
  if (/visualstudio2022|visual-studio-2022/i.test(off)) {
    return 'Visual Studio 2022 (Microsoft Dev Box compatible)';
  }
  if (/office-365|multisession|windows-11-office|win11-.*office/i.test(off)) {
    return 'Windows multi-session + Microsoft 365 Apps';
  }
  if (/windows-365|cloudpc|cloud-pc/i.test(off)) return 'Windows 365 Cloud PC image template';
  if (/azure-linux|cbl-mariner|azurelinux/i.test(off)) return 'Azure Linux 4.0';
  if (/noble|24_04|ubuntu-24/i.test(offLower)) {
    return 'Ubuntu 24.04 LTS - all plans including Ubuntu Pro';
  }
  if (/26_04|ubuntu-26/i.test(offLower)) return 'Ubuntu 26.04 LTS';
  if (/jammy|22_04|ubuntu-22/i.test(offLower)) {
    return 'Ubuntu 22.04 LTS - all plans including Ubuntu Pro';
  }
  if (/trixie|debian-13/i.test(offLower)) return 'Debian 13 "Trixie"';
  if (/bookworm|debian-12/i.test(offLower)) return 'Debian 12 "Bookworm"';
  if (/almalinux/i.test(offLower) || /almalinux/i.test(pub)) {
    return 'AlmaLinux OS (x86_64/AMD64)';
  }
  if (/oracle/i.test(pub) || /oracle.?linux/i.test(offLower)) return 'Oracle Linux';
  if (/redhat/i.test(pub) || /\brhel\b/i.test(offLower)) {
    return 'Red Hat Enterprise Linux (RHEL) for Microsoft Azure';
  }

  if (/microsoftwindows/i.test(pub)) {

    return off.replace(/-/g, ' ').replace(/windows/i, 'Windows').trim() || 'Windows Server';

  }

  if (/canonical/i.test(pub)) {
    return off.includes('ubuntu') ? `Ubuntu (${off})` : off;
  }

  if (/debian/i.test(pub)) return off.replace(/-/g, ' ') || 'Debian';

  return off.replace(/-/g, ' ').replace(/_/g, ' ') || `${pub} ${off}`;

}



function parsePublisherOfferSkuFromPlan(plan) {

  const ref =

    plan?.altStackReference ||

    plan?.altstackReference ||

    plan?.skuId ||

    plan?.planId ||

    plan?.name ||

    '';

  const parts = String(ref).split(':');

  if (parts.length >= 3) {

    return { publisher: parts[0], offer: parts[1], sku: parts[2] };

  }

  return null;

}



function mapMarketplaceProduct(product) {

  const plans = Array.isArray(product?.plans) ? product.plans : [];

  const mappedPlans = plans

    .map((plan) => {

      const refs = parsePublisherOfferSkuFromPlan(plan);

      return {

        planId: plan.planId || plan.name || plan.displayName,

        displayName:

          plan.displayName ||

          formatAzureImagePlanLabel({

            publisher: refs?.publisher,

            offer: refs?.offer,

            sku: refs?.sku || plan.skuId,

            productDisplayName: product.displayName,

          }),

        publisher: refs?.publisher,

        offer: refs?.offer,

        sku: refs?.sku || plan.skuId,

        summary: plan.summary || plan.description || plan.longSummary || null,

      };

    })

    .filter((p) => p.sku || p.planId);



  const firstWithRefs = mappedPlans.find((p) => p.publisher && p.offer && p.sku);



  return {

    id: product.uniqueProductId || product.productId || product.id,

    displayName: product.displayName || product.productId,

    publisher: product.publisherDisplayName || product.publisherId || firstWithRefs?.publisher,

    publisherId: product.publisherId || firstWithRefs?.publisher,

    offer: firstWithRefs?.offer || null,

    sku: firstWithRefs?.sku || null,

    summary: product.summary || product.longSummary || product.description || '',

    iconUrl:

      product.smallIconUri ||

      product.mediumIconUri ||

      product.largeIconUri ||

      product.wideIconUri ||

      null,

    operatingSystems: product.operatingSystems || [],

    productType: product.productType || 'VirtualMachine',

    plans: mappedPlans,

    source: 'marketplace',

  };

}



function marketplaceApiEnabled() {

  const mode = String(process.env.AZURE_MARKETPLACE_PRODUCTS_API || 'compute')

    .trim()

    .toLowerCase();

  if (mode === 'disabled' || mode === 'compute') return false;

  if (Date.now() < marketplaceApiSkipUntil) return false;

  return true;

}



function noteMarketplaceApiFailure(err) {

  marketplaceApiSkipUntil = Date.now() + MARKETPLACE_SKIP_MS;

  console.warn(

    '[azure] Marketplace products API unavailable — using compute image catalog fallback:',

    err instanceof Error ? err.message : err

  );

}



async function searchViaMarketplaceApi({ query, osType, skip, take }) {

  if (!azureConfig.subscriptionId || !marketplaceApiEnabled()) return null;



  const filters = ["productType eq 'VirtualMachine'"];

  if (osType === 'windows') {

    filters.push("operatingSystems/any(o: o eq 'Windows')");

  } else if (osType === 'linux') {

    filters.push("operatingSystems/any(o: o eq 'Linux')");

  }



  const params = new URLSearchParams({

    'api-version': MARKETPLACE_API,

    language: 'en',

    $filter: filters.join(' and '),

    $top: String(take),

    $skip: String(skip),

  });

  if (query?.trim()) params.set('$search', query.trim());



  try {

    const data = await Promise.race([

      azureArmRequest(

        `/subscriptions/${azureConfig.subscriptionId}/providers/Microsoft.Marketplace/products?${params.toString()}`

      ),

      new Promise((_, reject) => {

        setTimeout(() => reject(new Error('Marketplace API timeout')), MARKETPLACE_TRY_MS);

      }),

    ]);

    const products = Array.isArray(data?.value) ? data.value : [];

    const cards = products.map(mapMarketplaceProduct).filter((c) => c.displayName);

    const total = Number(data?.['@odata.count']) || cards.length + skip;

    return {

      rows: cards,

      total:

        total > cards.length + skip

          ? total

          : cards.length + skip + (cards.length === take ? take : 0),

      source: 'marketplace-api',

    };

  } catch (err) {

    noteMarketplaceApiFailure(err);

    return null;

  }

}



async function runPool(taskFns, limit = 6) {

  const results = [];

  for (let i = 0; i < taskFns.length; i += limit) {

    const chunk = taskFns.slice(i, i + limit);

    const chunkResults = await Promise.all(chunk.map((fn) => fn()));

    results.push(...chunkResults);

  }

  return results;

}



async function buildPublisherCards(client, location, publisher, osType) {

  const cards = [];

  try {

    const offers = await client.virtualMachineImages.listOffers(location, publisher);

    for (const offer of asResourceList(offers)) {

      const offerName = offer.name || '';

      if (!offerName) continue;

      let skus = [];

      try {

        const skuRows = await client.virtualMachineImages.listSkus(location, publisher, offerName);

        skus = asResourceList(skuRows).map((s) => ({

          name: s.name,

          label: s.name,

        }));

      } catch {

        continue;

      }

      if (skus.length === 0) continue;



      const cardDisplayName = formatDisplayName(publisher, offerName);

      cards.push({

        id: `${publisher}:${offerName}`,

        displayName: cardDisplayName,

        publisher,

        publisherId: publisher,

        offer: offerName,

        sku: skus[0].name,

        summary: `${publisher} · ${offerName}`,

        iconUrl: null,

        operatingSystems: [osType === 'windows' ? 'Windows' : 'Linux'],

        productType: 'VirtualMachine',

        plans: skus.map((s) => ({

          planId: s.name,

          displayName: formatAzureImagePlanLabel({

            publisher,

            offer: offerName,

            sku: s.name,

            productDisplayName: cardDisplayName,

          }),

          publisher,

          offer: offerName,

          sku: s.name,

          summary: buildAzureImagePlanSummary({ publisher, offer: offerName, sku: s.name }),

        })),

        source: 'compute-api',

      });

    }

  } catch {

    /* publisher unavailable */

  }

  return cards;

}



async function buildOfferCardsFromComputeInner(location, osType) {

  const client = new ComputeManagementClient(getAzureCredential(), azureConfig.subscriptionId);

  const publishers = await client.virtualMachineImages.listPublishers(location);

  const publisherNames = prioritizePublishers(

    asResourceList(publishers)

      .map((p) => p.name)

      .filter(Boolean)

      .filter((name) => publisherMatchesOsType(name, osType)),

    osType

  );



  const publisherCap = osType === 'windows' ? 12 : 20;

  const batchResults = await runPool(

    publisherNames.slice(0, publisherCap).map(

      (publisher) => () => buildPublisherCards(client, location, publisher, osType)

    ),

    6

  );



  const cards = batchResults.flat().sort((a, b) => a.displayName.localeCompare(b.displayName));

  return cards;

}



async function buildOfferCardsFromCompute(location, osType) {

  const cacheKey = `${location}:${osType}`;

  const cached = offerCardsCache.get(cacheKey);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {

    return cached.rows;

  }



  if (buildInFlight.has(cacheKey)) {

    return buildInFlight.get(cacheKey);

  }



  const promise = buildOfferCardsFromComputeInner(location, osType)

    .then((rows) => {

      offerCardsCache.set(cacheKey, { at: Date.now(), rows });

      return rows;

    })

    .finally(() => {

      buildInFlight.delete(cacheKey);

    });



  buildInFlight.set(cacheKey, promise);

  return promise;

}



function filterCards(cards, query) {

  const q = String(query || '').trim().toLowerCase();

  if (!q) return cards;

  return cards.filter(

    (c) =>

      c.displayName?.toLowerCase().includes(q) ||

      c.publisher?.toLowerCase().includes(q) ||

      c.offer?.toLowerCase().includes(q) ||

      c.summary?.toLowerCase().includes(q)

  );

}



/**

 * Warm compute image browse cache at startup so the first wizard load is fast.

 */

export async function warmAzureMarketplaceBrowseCache() {

  if (!azureConfig.subscriptionId) return { windows: 0, linux: 0 };

  const browseLocation = normalizeAzureRegion(azureConfig.location);

  const [windows, linux] = await Promise.all([

    buildOfferCardsFromCompute(browseLocation, 'windows').catch(() => []),

    buildOfferCardsFromCompute(browseLocation, 'linux').catch(() => []),

  ]);

  return { windows: windows.length, linux: linux.length };

}



/**

 * Subscription-wide marketplace browse (OS + search filters only — no deploy region).

 */

/**
 * Azure Portal VM image picker "first page" order (MarketplaceOffersBlade).
 * Matched products are pinned to page 1; everything else follows.
 */
const AZURE_PORTAL_FIRST_PAGE = [
  { name: /^windows server$/i, offer: /^windowsserver$/i },
  { name: /^windows 11$/i, offer: /^windows-11$/i },
  { name: /^windows server 2022$/i, offer: /2022/i },
  { name: /ubuntu 24\.04/i, offer: /ubuntu.*noble|0001-com-ubuntu-server-noble|24_04|2404/i },
  { name: /^windows 10$/i, offer: /^windows-10$/i },
  { name: /ubuntu 26\.04/i, offer: /ubuntu.*26|26_04|2604/i },
  { name: /ubuntu 22\.04/i, offer: /ubuntu.*jammy|0001-com-ubuntu-server-jammy|22_04|2204/i },
  { name: /sql server 2022/i, offer: /sql.*2022|sql2022/i },
  { name: /red hat enterprise linux|\brhel\b/i, offer: /rhel|rh-rhel/i },
  { name: /debian 13|trixie/i, offer: /debian-13|trixie/i },
  { name: /sql server 2025/i, offer: /sql.*2025|sql2025/i },
  { name: /multi-session|microsoft 365 apps/i, offer: /multisession|office-365|windows-11-office/i },
  { name: /^azure linux/i, offer: /azure-linux|cbl-mariner|azurelinux/i },
  { name: /windows 11 arm64/i, offer: /windows-11-arm|arm64/i },
  { name: /visual studio 2022/i, offer: /visualstudio2022|visual-studio-2022/i },
  { name: /^oracle linux$/i, offer: /oracle.?linux|^ol[0-9]/i },
  { name: /sql server 2019/i, offer: /sql.*2019|sql2019/i },
  { name: /almalinux/i, offer: /almalinux/i },
  { name: /windows 365|cloud pc/i, offer: /windows-365|cloudpc|cloud-pc/i },
  { name: /debian 12|bookworm/i, offer: /debian-12|bookworm/i },
];

function portalPopularRank(card) {
  const name = String(card?.displayName || '').trim();
  const offer = String(card?.offer || '').trim();
  const hay = `${name} ${offer} ${card?.summary || ''}`.toLowerCase();

  for (let i = 0; i < AZURE_PORTAL_FIRST_PAGE.length; i += 1) {
    const rule = AZURE_PORTAL_FIRST_PAGE[i];
    if (rule.name.test(name) || rule.name.test(hay)) return i;
    if (offer && rule.offer?.test(offer)) {
      // Avoid "Windows Server" offer matching "Windows Server 2022" slot via loose offer rules
      if (i === 0 && /2022|2019|2016|2025/.test(offer)) continue;
      if (i === 1 && /arm/.test(offer)) continue;
      return i;
    }
  }
  return 10_000;
}

/** Pin Azure Portal popular images first; stable alphabetical after that. */
function sortCardsLikeAzurePortal(cards) {
  return [...cards].sort((a, b) => {
    const ra = portalPopularRank(a);
    const rb = portalPopularRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.displayName || '').localeCompare(String(b.displayName || ''));
  });
}

function normalizeMarketplaceOsType(osType) {
  const raw = String(osType || 'all').trim().toLowerCase();
  if (raw === 'windows' || raw === 'linux' || raw === 'all') return raw;
  return 'all';
}

/** Interleave Windows + Linux compute catalogs so browse looks like Azure Portal mix. */
async function buildOfferCardsFromComputeAll(location) {
  const [windowsCards, linuxCards] = await Promise.all([
    buildOfferCardsFromCompute(location, 'windows'),
    buildOfferCardsFromCompute(location, 'linux'),
  ]);
  const seen = new Set();
  const mixed = [];
  const maxLen = Math.max(windowsCards.length, linuxCards.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (windowsCards[i]) {
      const id = windowsCards[i].id || `${windowsCards[i].publisherId}/${windowsCards[i].offer}`;
      if (!seen.has(id)) {
        seen.add(id);
        mixed.push(windowsCards[i]);
      }
    }
    if (linuxCards[i]) {
      const id = linuxCards[i].id || `${linuxCards[i].publisherId}/${linuxCards[i].offer}`;
      if (!seen.has(id)) {
        seen.add(id);
        mixed.push(linuxCards[i]);
      }
    }
  }
  return mixed;
}

export async function searchAzureMarketplaceImages({
  query = '',
  osType = 'all',
  skip = 0,
  take = 24,
} = {}) {
  validateAzureConfig();

  const normalizedOs = normalizeMarketplaceOsType(osType);
  const pageSize = Math.min(Math.max(Number(take) || 24, 1), 50);
  const offset = Math.max(Number(skip) || 0, 0);
  const hasQuery = Boolean(String(query || '').trim());

  // Text search can use Marketplace products API. Empty browse uses the full
  // compute catalog so we can pin Azure Portal "most used" images on page 1.
  if (hasQuery) {
    const marketplace = await searchViaMarketplaceApi({
      query,
      osType: normalizedOs,
      skip: offset,
      take: pageSize,
    });

    if (marketplace) {
      return {
        rows: sortCardsLikeAzurePortal(marketplace.rows),
        total: marketplace.total,
        skip: offset,
        take: pageSize,
        source: marketplace.source,
      };
    }
  }

  const browseLocation = normalizeAzureRegion(azureConfig.location);

  if (!azureConfig.subscriptionId) {
    throw Object.assign(
      new Error('Azure subscription is not configured (AZURE_SUBSCRIPTION_ID).'),
      { statusCode: 503 }
    );
  }

  const allCards =
    normalizedOs === 'all'
      ? await buildOfferCardsFromComputeAll(browseLocation)
      : await buildOfferCardsFromCompute(browseLocation, normalizedOs);
  const filtered = hasQuery ? filterCards(allCards, query) : allCards;
  const ordered = sortCardsLikeAzurePortal(filtered);
  const rows = ordered.slice(offset, offset + pageSize);

  if (rows.length === 0 && ordered.length === 0) {
    throw Object.assign(
      new Error(
        'No Azure VM images found. Check Azure credentials and that the subscription can list images in the home region.'
      ),
      { statusCode: 503 }
    );
  }

  return {
    rows,
    total: ordered.length,
    skip: offset,
    take: pageSize,
    source: 'compute-api',
    fallback: true,
    browseLocation,
  };
}
