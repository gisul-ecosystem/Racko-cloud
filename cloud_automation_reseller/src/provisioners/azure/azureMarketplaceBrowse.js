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

  if (/microsoftwindows/i.test(pub)) {

    return off.replace(/-/g, ' ').replace(/windows/i, 'Windows').trim() || 'Windows Server';

  }

  if (/canonical/i.test(pub)) return off.includes('ubuntu') ? 'Ubuntu Server' : off;

  if (/redhat/i.test(pub)) return 'Red Hat Enterprise Linux';

  if (/debian/i.test(pub)) return 'Debian';

  if (/oracle/i.test(pub)) return 'Oracle Linux';

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

export async function searchAzureMarketplaceImages({

  query = '',

  osType = 'windows',

  skip = 0,

  take = 24,

} = {}) {

  validateAzureConfig();



  const normalizedOs = String(osType).toLowerCase() === 'windows' ? 'windows' : 'linux';

  const pageSize = Math.min(Math.max(Number(take) || 24, 1), 50);

  const offset = Math.max(Number(skip) || 0, 0);



  const marketplace = await searchViaMarketplaceApi({

    query,

    osType: normalizedOs,

    skip: offset,

    take: pageSize,

  });



  if (marketplace) {

    return {

      rows: marketplace.rows,

      total: marketplace.total,

      skip: offset,

      take: pageSize,

      source: marketplace.source,

    };

  }



  const browseLocation = normalizeAzureRegion(azureConfig.location);

  if (!azureConfig.subscriptionId) {

    throw Object.assign(

      new Error('Azure subscription is not configured (AZURE_SUBSCRIPTION_ID).'),

      { statusCode: 503 }

    );

  }



  const allCards = await buildOfferCardsFromCompute(browseLocation, normalizedOs);

  const filtered = filterCards(allCards, query);

  const rows = filtered.slice(offset, offset + pageSize);



  if (rows.length === 0 && filtered.length === 0) {

    throw Object.assign(

      new Error(

        'No Azure VM images found for this OS type. Check Azure credentials and that the subscription can list images in the home region.'

      ),

      { statusCode: 503 }

    );

  }



  return {

    rows,

    total: filtered.length,

    skip: offset,

    take: pageSize,

    source: 'compute-api',

    fallback: true,

    browseLocation,

  };

}


