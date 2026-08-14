/**
 * Create VM Catalog Agent — runs on a dedicated VM.
 *
 * Racko client-portal proxies here via CREATE_VM_AGENT_URL.
 * This process never ships to the portal; it only exposes HTTP APIs.
 *
 * GET  /api/health
 * GET  /api/pricing
 * GET  /api/pricing/:type          (linux | windows | gpu)
 * GET  /api/cart/:type/:planId?billing=&quantity=
 * GET  /api/cart/:type/:planId/buy-preview?billing=&quantity=&template=
 * GET  /api/cart/:type/:planId/templates?billing=
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from this agent folder even when started from another working dir.
const localEnvPath = path.resolve(__dirname, '.env');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else {
  dotenv.config();
}

const express = require('express');
const {
  PRICING_URLS,
  fetchPricingCategory,
  fetchAllPricing,
  fetchCartDetails,
  fetchBuyNowPreview,
  fetchTemplates,
  purchaseAndScrape,
  changeMachineOs,
  machinePowerControl,
  ensureBrowser,
  shutdown,
  getRateLimitInfo,
} = require('./lib/catalog-session');

const app = express();
app.use(express.json({ limit: '1mb' }));
const PORT = Number(process.env.PORT) || 3789;

app.get('/api/health', (_req, res) => {
  const rl = (typeof getRateLimitInfo === 'function' && getRateLimitInfo()) || { limited: false };
  res.json({
    ok: true,
    service: 'create-vm-catalog-agent',
    categories: Object.keys(PRICING_URLS),
    rateLimit: rl,
  });
});

app.get('/api/pricing', async (_req, res) => {
  try {
    const data = await fetchAllPricing();
    res.json(data);
  } catch (err) {
    console.error('[api] /api/pricing failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch pricing' });
  }
});

app.get('/api/pricing/:type', async (req, res) => {
  try {
    const data = await fetchPricingCategory(req.params.type);
    res.json(data);
  } catch (err) {
    console.error(`[api] /api/pricing/${req.params.type} failed:`, err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch pricing' });
  }
});

app.get('/api/cart/:type/:planId', async (req, res) => {
  try {
    const data = await fetchCartDetails(req.params.type, req.params.planId, {
      billing: req.query.billing || undefined,
      quantity: req.query.quantity || 1,
    });
    res.json(data);
  } catch (err) {
    console.error('[api] /api/cart failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch cart' });
  }
});

app.get('/api/cart/:type/:planId/buy-preview', async (req, res) => {
  try {
    const data = await fetchBuyNowPreview(req.params.type, req.params.planId, {
      billing: req.query.billing || undefined,
      quantity: req.query.quantity || 1,
      template: req.query.template || '',
    });
    res.json(data);
  } catch (err) {
    console.error('[api] /api/cart buy-preview failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to build buy preview' });
  }
});

app.get('/api/cart/:type/:planId/templates', async (req, res) => {
  try {
    const billing = req.query.billing || 'Monthly';
    const templates = await fetchTemplates(req.params.type, req.params.planId, billing);
    res.json({
      category: req.params.type,
      planId: Number(req.params.planId),
      billing,
      templates,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api] /api/cart templates failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch templates' });
  }
});

/**
 * POST /api/purchase
 * Body: { category, planId, planName, billing, template, quantity, scrapeOnly? }
 * Submits Webyne checkout (unless scrapeOnly) and scrapes /admin/server.
 */
app.post('/api/purchase', async (req, res) => {
  try {
    const body = req.body || {};
    const data = await purchaseAndScrape(body.category, {
      planId: body.planId,
      planName: body.planName,
      billing: body.billing,
      template: body.template,
      quantity: body.quantity,
      scrapeOnly: Boolean(body.scrapeOnly),
    });
    res.json(data);
  } catch (err) {
    console.error('[api] /api/purchase failed:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Purchase / scrape failed',
      code: err.code || undefined,
      purchase: err.purchase || undefined,
    });
  }
});

/**
 * POST /api/scrape
 * Body: { planName? } — scrape /admin/server only (no checkout). Waits for DataTable.
 */
app.post('/api/scrape', async (req, res) => {
  try {
    const body = req.body || {};
    const data = await purchaseAndScrape(body.category || 'linux', {
      planId: body.planId || '0',
      planName: body.planName || '',
      billing: body.billing || 'Monthly',
      template: body.template || '',
      quantity: body.quantity || 1,
      scrapeOnly: true,
    });
    res.json(data);
  } catch (err) {
    console.error('[api] /api/scrape failed:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Scrape failed',
      code: err.code || undefined,
    });
  }
});

/**
 * POST /api/change-os
 * Body: { externalRef, targetOs?: 'windows'|'ubuntu'|..., template? }
 * Opens machineshow and runs OS/template Setup.
 */
app.post('/api/change-os', async (req, res) => {
  try {
    const body = req.body || {};
    const data = await changeMachineOs({
      externalRef: body.externalRef,
      targetOs: body.targetOs || 'windows',
      template: body.template,
    });
    res.json(data);
  } catch (err) {
    console.error('[api] /api/change-os failed:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Change OS failed',
      code: err.code || undefined,
    });
  }
});

/**
 * POST /api/power
 * Body: { externalRef, action: 'virtualizor'|'start'|'stop'|'reboot' }
 */
app.post('/api/power', async (req, res) => {
  try {
    const body = req.body || {};
    const data = await machinePowerControl({
      externalRef: body.externalRef,
      action: body.action,
    });
    res.json(data);
  } catch (err) {
    console.error('[api] /api/power failed:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Power action failed',
      code: err.code || undefined,
    });
  }
});

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[catalog-agent] Listening on 0.0.0.0:${PORT}`);
    console.log(`[catalog-agent] Health:  GET http://127.0.0.1:${PORT}/api/health`);
    console.log(`[catalog-agent] Pricing: GET http://127.0.0.1:${PORT}/api/pricing/:type`);
    console.log(`[catalog-agent] Scrape:  POST http://127.0.0.1:${PORT}/api/scrape`);
  });

  console.log('[catalog-agent] Warming provider session…');
  try {
    if (String(process.env.SKIP_CATALOG_AGENT_WARMUP || 'false').toLowerCase() !== 'true') {
      await ensureBrowser();
    } else {
      console.log('[catalog-agent] SKIP_CATALOG_AGENT_WARMUP=true — skipping warm-up login');
    }
  } catch (err) {
    console.warn('[catalog-agent] Warm-up failed (will retry on first request):', err.message);
  }
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

start().catch((err) => {
  console.error('[catalog-agent] Failed to start:', err);
  process.exit(1);
});
