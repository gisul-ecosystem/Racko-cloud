/**
 * Export AWS / Azure / OCI pricing sheets from live reseller API data.
 * Prices shown in USD and INR (₹).
 *
 * Usage (reseller must be running on PORT):
 *   node scripts/exportProviderPricingExcel.js
 *
 * Optional env:
 *   USD_TO_INR=84   — fallback if live FX fetch fails
 *
 * Output: exports/pricing-aws.xlsx, pricing-azure.xlsx, pricing-oci.xlsx
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 3005;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = process.env.INTERNAL_SERVICE_SECRET || '';
const FALLBACK_USD_TO_INR = Number(process.env.USD_TO_INR) || 84;

/** Catalog templates — same rows as the reference spreadsheet. */
const TEMPLATES = [
  { name: 'PG LARGE', vcpu: 4, ram: 8, ssd: 250, category: 'linux' },
  { name: 'labsgisul4CORE16GB200GB', vcpu: 4, ram: 16, ssd: 200, category: 'linux' },
  { name: 'Cloud 2', vcpu: 8, ram: 16, ssd: 500, category: 'linux' },
  { name: 'GISUL8VCORE16GBRAM300GBDISK', vcpu: 8, ram: 16, ssd: 300, category: 'linux' },
  { name: 'GISUL 8VCPU 32GB RAM 500GB', vcpu: 8, ram: 32, ssd: 500, category: 'linux' },
  {
    name: 'GoldGsuilwindows8core64GBRAM500GBDISK',
    vcpu: 8,
    ram: 64,
    ssd: 500,
    category: 'windows',
  },
  { name: 'Cloud 5', vcpu: 10, ram: 20, ssd: 2000, category: 'linux' },
  { name: 'Package 4-10 CORE 20 GB RAM 500 GB DISK', vcpu: 10, ram: 20, ssd: 500, category: 'linux' },
  { name: 'Cloud 6', vcpu: 12, ram: 32, ssd: 4000, category: 'linux' },
  { name: 'Cloud 3', vcpu: 16, ram: 32, ssd: 1024, category: 'linux' },
  { name: 'Cloud 7', vcpu: 16, ram: 64, ssd: 6000, category: 'linux' },
];

const PROVIDERS = ['aws', 'azure', 'oci'];
const HOURS_PER_MONTH = 730;

const PRICING_HEADERS = [
  'Template',
  'Vcpu',
  'RAM',
  'SSD',
  'Hr_USD',
  'Mon_USD',
  'QTr_USD',
  'YEAR_USD',
  'Hr_INR',
  'Mon_INR',
  'QTr_INR',
  'YEAR_INR',
];

function canonicalSpec(vcpu, ram, ssd, category) {
  const base = `${vcpu}vcpu-${ram}gb-${ssd}gbssd`;
  return category === 'gpu' ? `${base}-gpu` : base;
}

function roundUsdHr(value) {
  if (value == null || !Number.isFinite(value)) return '';
  return Math.round(Number(value) * 100) / 100;
}

function roundUsdMoney(value) {
  if (value == null || !Number.isFinite(value)) return '';
  return Math.round(Number(value));
}

function roundInrHr(value) {
  if (value == null || !Number.isFinite(value)) return '';
  return Math.round(Number(value) * 100) / 100;
}

function roundInrMoney(value) {
  if (value == null || !Number.isFinite(value)) return '';
  return Math.round(Number(value));
}

function emptyPrices() {
  return {
    Hr_USD: '',
    Mon_USD: '',
    QTr_USD: '',
    YEAR_USD: '',
    Hr_INR: '',
    Mon_INR: '',
    QTr_INR: '',
    YEAR_INR: '',
  };
}

function pricesFromHourlyUsd(hrUsd, usdToInr) {
  if (hrUsd == null || !Number.isFinite(Number(hrUsd))) {
    return emptyPrices();
  }
  const h = Number(hrUsd);
  const mon = h * HOURS_PER_MONTH;
  const hrInr = h * usdToInr;
  const monInr = mon * usdToInr;
  return {
    Hr_USD: roundUsdHr(h),
    Mon_USD: roundUsdMoney(mon),
    QTr_USD: roundUsdMoney(mon * 3),
    YEAR_USD: roundUsdMoney(mon * 12),
    Hr_INR: roundInrHr(hrInr),
    Mon_INR: roundInrMoney(monInr),
    QTr_INR: roundInrMoney(monInr * 3),
    YEAR_INR: roundInrMoney(monInr * 12),
  };
}

async function fetchUsdToInr() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.INR;
    if (!rate || !Number.isFinite(rate)) throw new Error('No INR rate in response');
    console.log(`FX rate: 1 USD = ₹${rate} (live)`);
    return { rate, source: 'live (frankfurter.app)' };
  } catch (err) {
    console.warn(`FX live fetch failed (${err.message}), using USD_TO_INR=${FALLBACK_USD_TO_INR}`);
    return { rate: FALLBACK_USD_TO_INR, source: `fallback env/default (${FALLBACK_USD_TO_INR})` };
  }
}

async function fetchSelect(provider, template) {
  const body = {
    canonicalSpec: canonicalSpec(template.vcpu, template.ram, template.ssd, template.category),
    category: template.category,
    durationDays: 1,
    providers: [provider],
  };

  const res = await fetch(`${BASE_URL}/api/select`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Internal-Secret': SECRET,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.message || `HTTP ${res.status}`);
  }

  const data = json.data || {};
  if (data.provider !== provider || data.rawTotalPricePerHr == null) {
    return {
      hr: null,
      region: data.region,
      instanceType: data.instanceType,
      reason: data.reason || 'no_price',
    };
  }

  return {
    hr: data.rawTotalPricePerHr,
    region: data.region,
    instanceType: data.instanceType,
    reason: data.reason,
  };
}

async function buildSheetRows(provider, usdToInr) {
  const rows = [];
  console.log(`\n[${provider}] fetching live prices...`);

  for (const t of TEMPLATES) {
    process.stdout.write(`  ${t.name} ... `);
    let quote;
    try {
      quote = await fetchSelect(provider, t);
    } catch (err) {
      console.log(`error: ${err.message}`);
      quote = { hr: null, reason: err.message };
    }

    const prices = pricesFromHourlyUsd(quote.hr, usdToInr);
    rows.push({
      Template: t.name,
      Vcpu: t.vcpu,
      RAM: t.ram,
      SSD: t.ssd,
      ...prices,
      _region: quote.region || '',
      _instanceType: quote.instanceType || '',
      _reason: quote.reason || '',
    });

    if (quote.hr != null) {
      console.log(
        `$${prices.Hr_USD}/hr · ₹${prices.Hr_INR}/hr (${quote.region}, ${quote.instanceType})`
      );
    } else {
      console.log(`no price (${quote.reason})`);
    }
  }

  return rows;
}

function writeExcel(provider, rows, outDir, fxMeta) {
  const sheetRows = rows.map((r) =>
    Object.fromEntries(PRICING_HEADERS.map((h) => [h, r[h] ?? '']))
  );

  const ws = XLSX.utils.json_to_sheet(sheetRows, { header: PRICING_HEADERS });

  const metaRows = [
    ['Provider', provider.toUpperCase()],
    ['Generated', new Date().toISOString()],
    ['Source', `${BASE_URL}/api/select`],
    ['Cloud prices', 'USD list (rawTotalPricePerHr)'],
    ['USD to INR', fxMeta.rate],
    ['FX source', fxMeta.source],
    ['Monthly basis', `${HOURS_PER_MONTH} hours/month`],
    [],
  ];
  const wsMeta = XLSX.utils.aoa_to_sheet(metaRows);

  const detailHeader = [...PRICING_HEADERS, 'Region', 'InstanceType', 'Notes'];
  const detailRows = rows.map((r) => [
    ...PRICING_HEADERS.map((h) => r[h] ?? ''),
    r._region,
    r._instanceType,
    r._reason,
  ]);
  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pricing');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Details');
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Meta');

  const filename = path.join(outDir, `pricing-${provider}.xlsx`);
  try {
    XLSX.writeFile(wb, filename);
  } catch (err) {
    if (err?.code === 'EBUSY') {
      const alt = path.join(
        outDir,
        `pricing-${provider}-${Date.now()}.xlsx`
      );
      XLSX.writeFile(wb, alt);
      console.warn(`  (file locked — wrote ${path.basename(alt)} instead; close Excel and re-run)`);
      return alt;
    }
    throw err;
  }
  return filename;
}

async function main() {
  if (!SECRET) {
    console.error('INTERNAL_SERVICE_SECRET is not set in .env');
    process.exit(1);
  }

  const health = await fetch(`${BASE_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`Reseller not reachable at ${BASE_URL}. Start with: npm start`);
    process.exit(1);
  }

  const fxMeta = await fetchUsdToInr();
  const outDir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });

  const written = [];
  for (const provider of PROVIDERS) {
    const rows = await buildSheetRows(provider, fxMeta.rate);
    written.push(writeExcel(provider, rows, outDir, fxMeta));
  }

  console.log('\nDone:');
  for (const f of written) {
    console.log(`  ${f}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
