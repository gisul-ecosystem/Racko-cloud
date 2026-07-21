/**
 * Live Webyne session: login once, scrape pricing tables on demand.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOGIN_URL = 'https://cloud.webyne.com/login';
const WEBYNE_EMAIL = process.env.WEBYNE_EMAIL || 'sahil.goyal@gisul.co.in';
const WEBYNE_PASSWORD = process.env.WEBYNE_PASSWORD || 'Password@123';
// Persist Playwright storage in a dedicated directory to allow directory
// mounts from the host (avoid file-vs-directory bind mount issues).
const STORAGE_STATE_PATH = path.join(__dirname, '..', 'state', 'catalog-storage-state.json');

function ensureStorageDir() {
  const dir = path.dirname(STORAGE_STATE_PATH);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (e) {
      /* ignore creation errors; callers will surface failures */
    }
  }
}

const RATE_LIMIT_PATH = path.join(__dirname, '..', 'state', 'ratelimit.json');

function readRateLimit() {
  try {
    if (fs.existsSync(RATE_LIMIT_PATH)) {
      const txt = fs.readFileSync(RATE_LIMIT_PATH, 'utf8');
      const obj = JSON.parse(txt || '{}');
      return Number(obj.nextLoginAt) || 0;
    }
  } catch (e) {
    /* ignore */
  }
  return 0;
}

function writeRateLimit(ts) {
  try {
    ensureStorageDir();
    fs.writeFileSync(RATE_LIMIT_PATH, JSON.stringify({ nextLoginAt: Number(ts) || 0 }), 'utf8');
  } catch (e) {
    /* ignore */
  }
}

const PRICING_URLS = {
  linux: 'https://cloud.webyne.com/admin/linux/pricing',
  windows: 'https://cloud.webyne.com/admin/windows/pricing',
  gpu: 'https://cloud.webyne.com/admin/gpu/pricing',
};

/** Racko catalog plans that live on Webyne Linux pricing (not user-selected OS). */
const LINUX_PRICING_PLANS = [
  'PG LARGE',
  'GISUL 8VCPU 32GB RAM 500GB',
  'Package 4-10 CORE 20 GB RAM 500 GB DISK',
  'Gold Cloud 2',
  'Gold Cloud 3',
  'Gold Cloud 5',
  'Gold Cloud 6',
  'Gold Cloud 7',
];

function normalizePlanName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Pick Webyne pricing page from catalog plan name. All others use Windows pricing. */
function resolvePricingCategory(planName) {
  const target = normalizePlanName(planName);
  if (!target) return 'linux';
  const onLinux = LINUX_PRICING_PLANS.some((plan) => normalizePlanName(plan) === target);
  return onLinux ? 'linux' : 'windows';
}

function toWebyneBilling(billing) {
  const key = String(billing || 'monthly').toLowerCase();
  const map = {
    hourly: 'Hourly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  };
  return map[key] || String(billing || 'Monthly');
}

async function resolveWebynePlanId(pricingCategory, planName) {
  const data = await fetchPricingCategory(pricingCategory);
  const target = normalizePlanName(planName);
  const match = data.plans.find((row) => normalizePlanName(row.plan) === target);
  if (!match?.planId) {
    throw Object.assign(
      new Error(
        `Plan "${planName}" was not found on Webyne ${pricingCategory} pricing (${data.source})`
      ),
      { status: 404, code: 'WEBYNE_PLAN_NOT_FOUND' }
    );
  }
  return match.planId;
}

/** Webyne Buy Now POST targets (preview only — never called from this app). */
const CHECKOUT_URLS = {
  linux: 'https://cloud.webyne.com/admin/linux/saveplinux',
  windows: 'https://cloud.webyne.com/admin/windows/savepwindows',
  gpu: 'https://cloud.webyne.com/admin/gpu/savepgpu',
};

let browser = null;
let context = null;
let page = null;
let ready = false;
let loginPromise = null;
// timestamp (ms) when next login attempt should be tried (rate-limit reset)
let nextLoginAt = 0;
// hydrate persisted rate-limit if present
nextLoginAt = readRateLimit();

function emptyPrice(value) {
  if (value == null) return null;
  const t = String(value).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

async function scrapeTableFromPage(page) {
  return page.evaluate(() => {
    const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();

    const tables = Array.from(document.querySelectorAll('table'));
    let best = null;
    let bestScore = 0;

    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('thead th, tr th')).map((th) =>
        normalize(th.textContent)
      );
      const rows = Array.from(table.querySelectorAll('tbody tr')).filter((tr) => {
        const cells = tr.querySelectorAll('td');
        return cells.length >= 4;
      });
      const score = rows.length * 10 + headers.length;
      if (score > bestScore) {
        bestScore = score;
        best = { table, headers, rows };
      }
    }

    if (!best || !best.rows.length) {
      // Fallback: any table with Plan-like content
      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll('tr')).filter(
          (tr) => tr.querySelectorAll('td').length >= 5
        );
        if (rows.length) {
          best = {
            table,
            headers: ['S.No', 'Plan', 'CPU', 'RAM', 'Disk Space', 'Hourly', 'Monthly', 'Quarterly', 'Yearly', 'Action'],
            rows,
          };
          break;
        }
      }
    }

    if (!best) return [];

    const headerKeys = best.headers.map((h) => h.toLowerCase());
    const pick = (cells, names, indexFallback) => {
      for (const name of names) {
        const idx = headerKeys.findIndex((h) => h.includes(name));
        if (idx >= 0 && cells[idx]) return normalize(cells[idx].textContent);
      }
      if (indexFallback != null && cells[indexFallback]) {
        return normalize(cells[indexFallback].textContent);
      }
      return '';
    };

    return best.rows.map((tr, i) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const texts = cells.map((td) => normalize(td.textContent));
      const cartEl = tr.querySelector('[onclick*="edit_data"]');
      const onclick = cartEl?.getAttribute('onclick') || '';
      const idMatch = onclick.match(/edit_data\((\d+)\)/);
      return {
        planId: idMatch ? Number(idMatch[1]) : null,
        sno: pick(cells, ['s.no', 'sno', '#'], 0) || String(i + 1),
        plan: pick(cells, ['plan'], 1),
        cpu: pick(cells, ['cpu'], 2),
        ram: pick(cells, ['ram'], 3),
        disk: pick(cells, ['disk'], 4),
        hourly: pick(cells, ['hourly'], 5),
        monthly: pick(cells, ['monthly'], 6),
        quarterly: pick(cells, ['quarterly'], 7),
        yearly: pick(cells, ['yearly'], 8),
        action: pick(cells, ['action'], 9),
        _raw: texts,
      };
    }).filter((row) => row.plan);
  });
}

/** Template API billing codes used by Webyne's template_data() */
const BILLING_TEMPLATE_CODE = {
  Hourly: '2',
  Monthly: '0',
  Quarterly: '3',
  Yearly: '1',
};

function categoryBase(category) {
  const key = String(category || '').toLowerCase();
  if (!PRICING_URLS[key]) {
    throw Object.assign(new Error(`Unknown category: ${category}`), { status: 400 });
  }
  return `https://cloud.webyne.com/admin/${key}`;
}

function hasAmount(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function toNumber(v) {
  if (!hasAmount(v)) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function computeTotals(subtotal, quantity = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  const base = (toNumber(subtotal) || 0) * qty;
  const tax = (base * 18) / 100;
  return {
    quantity: qty,
    subtotal: Number(base.toFixed(2)),
    tax: Number(tax.toFixed(3)),
    taxRate: 0.18,
    total: Number((base + tax).toFixed(2)),
  };
}

function availableBillingCycles(plan) {
  const cycles = [];
  if (hasAmount(plan.hourlyamount)) cycles.push({ value: 'Hourly', amount: toNumber(plan.hourlyamount) });
  if (hasAmount(plan.monthlyamount)) cycles.push({ value: 'Monthly', amount: toNumber(plan.monthlyamount) });
  if (hasAmount(plan.quarterlyamount)) cycles.push({ value: 'Quarterly', amount: toNumber(plan.quarterlyamount) });
  if (hasAmount(plan.yearlyamount)) cycles.push({ value: 'Yearly', amount: toNumber(plan.yearlyamount) });
  return cycles;
}

function pickDefaultBilling(cycles) {
  // Same priority as Webyne edit_data(): Hourly → Monthly → Quarterly → Yearly
  const order = ['Hourly', 'Monthly', 'Quarterly', 'Yearly'];
  for (const key of order) {
    const hit = cycles.find((c) => c.value === key);
    if (hit) return hit.value;
  }
  return null;
}

function parseTemplateOptionsHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const options = [];
  const re = /<option([^>]*)>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    const text = (m[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const valueMatch = attrs.match(/\bvalue\s*=\s*(["'])(.*?)\1/i);
    const value = valueMatch ? valueMatch[2] : text;
    if (!text && !value) continue;
    options.push({
      value,
      label: text || value,
      selected: /\bselected\b/i.test(attrs),
    });
  }
  return options;
}

async function webyneGetJson(url) {
  await ensureBrowser();
  const res = await context.request.get(url, { timeout: 60000 });
  if (res.status() === 401 || res.url().includes('/login')) {
    ready = false;
    await ensureBrowser();
    const retry = await context.request.get(url, { timeout: 60000 });
    if (!retry.ok()) {
      throw Object.assign(new Error(`Webyne request failed (${retry.status()}): ${url}`), {
        status: retry.status(),
      });
    }
    return retry.json();
  }
  if (!res.ok()) {
    throw Object.assign(new Error(`Webyne request failed (${res.status()}): ${url}`), {
      status: res.status(),
    });
  }
  return res.json();
}

async function webyneGetText(url, { allowStatuses = [] } = {}) {
  await ensureBrowser();
  const res = await context.request.get(url, { timeout: 60000 });
  if (!res.ok() && !allowStatuses.includes(res.status())) {
    throw Object.assign(new Error(`Webyne request failed (${res.status()}): ${url}`), {
      status: res.status(),
    });
  }
  return { status: res.status(), text: await res.text() };
}

async function fetchPlanDetails(category, planId) {
  const base = categoryBase(category);
  const url = `${base}/pricing/edit/${planId}`;
  console.log(`[webyne] Live cart edit → ${url}`);
  return webyneGetJson(url);
}

async function fetchTemplates(_category, planId, billingCycle) {
  const code = BILLING_TEMPLATE_CODE[billingCycle];
  if (code == null) {
    throw Object.assign(new Error(`Unknown billing cycle: ${billingCycle}`), { status: 400 });
  }

  // Webyne windows/gpu UIs always load templates from the linux route.
  // /admin/windows|gpu/addonstemplate/* returns 404.
  const url = `https://cloud.webyne.com/admin/linux/addonstemplate/${planId}/${code}`;
  console.log(`[webyne] Live templates → ${url}`);
  const { status, text } = await webyneGetText(url, { allowStatuses: [404] });
  if (status === 404) {
    throw Object.assign(new Error(`Webyne request failed (404): ${url}`), { status: 404 });
  }
  return parseTemplateOptionsHtml(text);
}

function buildBuyNowPreview(category, cart, { template } = {}) {
  const key = String(category || '').toLowerCase();
  const endpoint = CHECKOUT_URLS[key];
  if (!endpoint) {
    throw Object.assign(new Error(`Unknown category: ${category}`), { status: 400 });
  }

  const templateValue = template != null ? String(template) : '';
  const templateLabel =
    cart.templates?.find((t) => t.value === templateValue)?.label || null;
  const qty = Math.max(1, Number(cart.quantity) || 1);
  const errors = [];

  if (!templateValue) errors.push('Select a template before Buy Now.');
  if (qty <= 0) errors.push('Quantity must be at least 1.');

  return {
    mode: 'preview-only',
    submitted: false,
    willSubmit: false,
    ready: errors.length === 0,
    validationErrors: errors,
    request: {
      method: 'POST',
      url: endpoint,
      contentType: 'multipart/form-data',
      fields: {
        id: String(cart.planId),
        billing: cart.selectedBilling,
        template: templateValue,
        quantity: String(qty),
        addons_cpu: '',
        addons_ram: '',
        addons_disk: '',
        _token: '(Webyne session CSRF token — required on real submit)',
      },
    },
    template: templateValue
      ? { value: templateValue, label: templateLabel || templateValue }
      : null,
    plan: {
      id: cart.planId,
      name: cart.name,
      specs: cart.specs,
    },
    pricing: cart.pricing,
    expectedOutcomes: {
      successStatus: 200,
      insufficientBalanceStatus: 202,
      redirectUrl: 'https://cloud.webyne.com/admin/server',
    },
    note: 'Preview only — this app never POSTs to Webyne checkout.',
  };
}

/**
 * Live Buy Now preview: same payload Webyne would receive, without submitting.
 */
async function fetchBuyNowPreview(category, planId, { billing, quantity = 1, template } = {}) {
  const cart = await fetchCartDetails(category, planId, { billing, quantity });
  const preview = buildBuyNowPreview(category, cart, { template });
  return {
    fetchedAt: new Date().toISOString(),
    category: String(category).toLowerCase(),
    ...preview,
  };
}

/**
 * Live shopping-cart payload for a plan (same data Webyne's Add to Cart modal uses).
 */
async function fetchCartDetails(category, planId, { billing, quantity = 1 } = {}) {
  const id = Number(planId);
  if (!Number.isFinite(id)) {
    throw Object.assign(new Error('planId is required'), { status: 400 });
  }

  const plan = await fetchPlanDetails(category, id);
  const cycles = availableBillingCycles(plan);
  const selectedBilling = billing || pickDefaultBilling(cycles);
  if (!selectedBilling) {
    throw Object.assign(new Error('No billing cycles available for this plan'), { status: 422 });
  }

  const cycle = cycles.find((c) => c.value === selectedBilling) || cycles[0];
  const amounts = {
    hourly: toNumber(plan.hourlyamount),
    monthly: toNumber(plan.monthlyamount),
    quarterly: toNumber(plan.quarterlyamount),
    yearly: toNumber(plan.yearlyamount),
  };
  const totals = computeTotals(cycle.amount, quantity);
  let templates = [];
  let templatesError = null;
  try {
    templates = await fetchTemplates(category, id, selectedBilling);
  } catch (err) {
    templatesError = err.message;
    console.warn('[webyne] templates unavailable:', err.message);
  }

  return {
    fetchedAt: new Date().toISOString(),
    category: String(category).toLowerCase(),
    planId: id,
    name: plan.name,
    specs: {
      cpu: `${plan.core} CPUs ${plan.processorss || ''}`.trim(),
      ram: `${plan.ram} GB ${plan.ramtypess || ''}`.trim(),
      disk: `${plan.disk} GB ${plan.disktypess || ''}`.trim(),
      core: plan.core,
      processor: plan.processorss,
      ramGb: plan.ram,
      ramType: plan.ramtypess,
      diskGb: plan.disk,
      diskType: plan.disktypess,
    },
    amounts,
    billingCycles: cycles,
    selectedBilling,
    quantity: totals.quantity,
    pricing: {
      currency: 'INR',
      subtotal: totals.subtotal,
      taxLabel: 'Tax 18% GST',
      tax: totals.tax,
      total: totals.total,
    },
    templates,
    templatesError,
    raw: plan,
  };
}

async function ensureBrowser() {
  if (browser && context && page && ready) return page;

  if (loginPromise) {
    await loginPromise;
    return page;
  }

  // If provider signalled a rate-limit reset window, defer attempts until then
  if (nextLoginAt && Date.now() < nextLoginAt) {
    const err = new Error(`Webyne rate limited until ${new Date(nextLoginAt).toISOString()}`);
    err.status = 429;
    err.resetAt = nextLoginAt;
    throw err;
  }

  loginPromise = (async () => {
    console.log('[webyne] Launching browser…');
    browser = await chromium.launch({
      headless: true,
    });

    const contextOptions = {
      viewport: { width: 1400, height: 900 },
    };
    // If a host directory is mounted at /app/state, STORAGE_STATE_PATH will
    // point inside that directory. Only set storageState if the file exists.
    if (fs.existsSync(STORAGE_STATE_PATH)) {
      contextOptions.storageState = STORAGE_STATE_PATH;
      console.log('[webyne] Reusing saved storage state');
    }

    context = await browser.newContext(contextOptions);
    page = await context.newPage();

    // Probe if session is valid — only treat real login redirects as needing auth
    await robustGoto(page, PRICING_URLS.linux, { waitUntil: 'domcontentloaded', timeout: 120000 });
    let needsLogin = page.url().includes('/login');
    if (!needsLogin) {
      // Some expired sessions land on a soft login form without changing the URL
      const pwdVisible = await page
        .locator('form input[type="password"]')
        .first()
        .isVisible()
        .catch(() => false);
      const emailVisible = await page
        .locator('form input[type="email"], form input[name="email"]')
        .first()
        .isVisible()
        .catch(() => false);
      needsLogin = Boolean(pwdVisible && emailVisible);
    }

    if (needsLogin) {
      console.log('[webyne] Logging in…');
      await robustGoto(page, LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForTimeout(1000);

      // Webyne rate-limits aggressive automation. Probe provider headers and
      // respect their reset window instead of busy-loop retrying.
      for (let rateTry = 0; rateTry < 6; rateTry += 1) {
        const blocked = await page.evaluate(() => {
          const t = `${document.title} ${document.body?.innerText || ''}`;
          return /429|too many requests/i.test(t);
        });
        if (!blocked) break;
        try {
          const pre = await context.request.get(LOGIN_URL, { timeout: 60000 });
          if (pre.status() === 429) {
            const headers = pre.headers();
            const resetHdr = headers['x-ratelimit-reset'] || headers['X-RateLimit-Reset'];
            const retryAfter = headers['retry-after'] || headers['Retry-After'];
            let resetTs = null;
            if (resetHdr && !Number.isNaN(Number(resetHdr))) {
              resetTs = Number(resetHdr) * 1000;
            } else if (retryAfter && !Number.isNaN(Number(retryAfter))) {
              resetTs = Date.now() + Number(retryAfter) * 1000;
            }
            if (resetTs) {
              nextLoginAt = resetTs + 1000;
              writeRateLimit(nextLoginAt);
              console.warn('[webyne] Rate limited (429). Respecting reset at', new Date(nextLoginAt).toISOString());
              throw Object.assign(new Error('Webyne rate limited'), { status: 429, resetAt: nextLoginAt });
            }
          }
          // No header — use exponential backoff with jitter to reduce pressure
          const base = 30_000;
          const maxWait = 5 * 60 * 1000;
          const waitMs = Math.min(maxWait, Math.floor(base * Math.pow(2, rateTry)));
          const jitter = Math.floor(Math.random() * 5000);
          const totalWait = waitMs + jitter;
          console.warn(`[webyne] Probe returned ${pre.status()} — waiting ${Math.round(totalWait/1000)}s before retry`);
          await page.waitForTimeout(totalWait);
          await robustGoto(page, LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
          await page.waitForTimeout(1000);
        } catch (e) {
          console.warn('[webyne] Rate probe failed or limited, aborting login attempts:', e.message || e);
          throw e;
        }
      }

      const emailInput = page
        .locator(
          'input[type="email"], input[name="email"], input[id*="email" i], input[placeholder*="email" i], input[name="username"]'
        )
        .first();
      const passwordInput = page.locator('input[type="password"]').first();
      const signInButton = page
        .getByRole('button', { name: /sign in|log in|login/i })
        .or(page.locator('button[type="submit"]'))
        .first();

      try {
        await emailInput.waitFor({ state: 'visible', timeout: 45000 });
      } catch (err) {
        // Stale storage / interstitial — clear cookies and retry once
        console.warn('[webyne] Login form not visible; clearing storage and retrying…');
        const debugPath = path.join(__dirname, '..', 'login-debug.txt');
        try {
          const snapshot = await page.evaluate(() => ({
            url: location.href,
            title: document.title,
            text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800),
            inputs: Array.from(document.querySelectorAll('input')).map((el) => ({
              type: el.getAttribute('type'),
              name: el.getAttribute('name'),
              id: el.id,
              placeholder: el.getAttribute('placeholder'),
            })),
          }));
          fs.writeFileSync(debugPath, JSON.stringify(snapshot, null, 2), 'utf8');
          console.warn('[webyne] Wrote login debug →', debugPath);
        } catch {
          /* ignore */
        }
        await context.clearCookies();
        if (fs.existsSync(STORAGE_STATE_PATH)) {
          try {
            fs.unlinkSync(STORAGE_STATE_PATH);
          } catch {
            /* ignore */
          }
        }
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 120000 }).catch(() =>
          page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
        );
        await page.waitForTimeout(1500);
        try {
          const snapshot2 = await page.evaluate(() => ({
            url: location.href,
            title: document.title,
            text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800),
            inputs: Array.from(document.querySelectorAll('input')).map((el) => ({
              type: el.getAttribute('type'),
              name: el.getAttribute('name'),
              id: el.id,
              placeholder: el.getAttribute('placeholder'),
            })),
          }));
          fs.writeFileSync(debugPath, JSON.stringify(snapshot2, null, 2), 'utf8');
        } catch {
          /* ignore */
        }
        await emailInput.waitFor({ state: 'visible', timeout: 45000 });
      }

      await emailInput.fill(WEBYNE_EMAIL);
      await passwordInput.fill(WEBYNE_PASSWORD);
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 120000 }),
        signInButton.click(),
      ]).catch(async () => {
        await signInButton.click();
        await page.waitForTimeout(5000);
      });

      if (page.url().includes('/login')) {
        throw new Error('Webyne login failed — still on /login after credentials');
      }

      // Ensure host-mounted directory exists before saving storage state
      try {
        ensureStorageDir();
        await context.storageState({ path: STORAGE_STATE_PATH });
        console.log('[webyne] Login OK, storage state saved');
      } catch (e) {
        console.warn('[webyne] Failed to save storage state:', e && e.message ? e.message : e);
      }
    } else {
      console.log('[webyne] Session already authenticated');
    }

    ready = true;
  })();

  try {
    await loginPromise;
  } catch (err) {
    ready = false;
    try {
      if (browser) await browser.close();
    } catch {
      /* ignore */
    }
    browser = null;
    context = null;
    page = null;
    // persist rate-limit info on fatal error so orchestrators can inspect it
    if (err && err.status === 429 && err.resetAt) {
      try {
        writeRateLimit(err.resetAt);
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    loginPromise = null;
  }

  return page;
}

// Expose rate-limit info for health checks
function getRateLimitInfo() {
  const now = Date.now();
  const resetAt = readRateLimit() || nextLoginAt || 0;
  return {
    limited: Boolean(resetAt && resetAt > now),
    resetAt: resetAt || null,
    now,
  };
}

module.exports.getRateLimitInfo = getRateLimitInfo;

async function robustGoto(p, url, options = {}) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await p.goto(url, options);
      return;
    } catch (err) {
      lastError = err;
      const message = String(err?.message || '').toLowerCase();
      const aborted = /net::err_aborted|err_aborted|aborted/.test(message);
      if (!aborted || attempt === maxAttempts) {
        throw err;
      }
      console.warn(`[webyne] page.goto aborted on attempt ${attempt} for ${url}. Retrying...`);
      await p.waitForTimeout(1000 * attempt);
    }
  }

  throw lastError;
}

async function fetchPricingCategory(category) {
  const key = String(category || '').toLowerCase();
  const url = PRICING_URLS[key];
  if (!url) {
    throw Object.assign(new Error(`Unknown category: ${category}`), { status: 400 });
  }

  const p = await ensureBrowser();
  console.log(`[webyne] Live scrape → ${url}`);
  await robustGoto(p, url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Wait for table rows to appear (DataTables / SPA)
  await p.waitForSelector('table tbody tr, table tr td', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(800);

  // If redirected to login, force re-auth once
  if (p.url().includes('/login')) {
    ready = false;
    await ensureBrowser();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForSelector('table tbody tr, table tr td', { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(800);
  }

  const rows = await scrapeTableFromPage(p);
  const plans = rows.map((row) => ({
    planId: row.planId,
    sno: row.sno,
    plan: row.plan,
    cpu: emptyPrice(row.cpu),
    ram: emptyPrice(row.ram),
    disk: emptyPrice(row.disk),
    hourly: emptyPrice(row.hourly),
    monthly: emptyPrice(row.monthly),
    quarterly: emptyPrice(row.quarterly),
    yearly: emptyPrice(row.yearly),
  }));

  return {
    category: key,
    source: url,
    fetchedAt: new Date().toISOString(),
    count: plans.length,
    plans,
  };
}

async function fetchAllPricing() {
  const categories = Object.keys(PRICING_URLS);
  const result = {
    fetchedAt: new Date().toISOString(),
    categories: {},
  };
  for (const cat of categories) {
    result.categories[cat] = await fetchPricingCategory(cat);
  }
  return result;
}

async function shutdown() {
  ready = false;
  if (browser) {
    await browser.close().catch(() => {});
  }
  browser = null;
  context = null;
  page = null;
}

async function extractCsrfToken() {
  const p = await ensureBrowser();
  return p.evaluate(() => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta?.getAttribute('content')) return meta.getAttribute('content');
    const input = document.querySelector('input[name="_token"]');
    if (input && 'value' in input) return String(input.value || '');
    return '';
  });
}

/**
 * Submit real Webyne Buy Now checkout (multipart), then scrape /admin/server.
 */
async function purchaseAndScrape(category, {
  planId,
  planName,
  billing,
  template,
  quantity = 1,
  scrapeOnly = false,
} = {}) {
  const requestedOs = String(category || 'linux').toLowerCase();
  const pricingCategory = planName ? resolvePricingCategory(planName) : requestedOs;
  const key = pricingCategory;
  const endpoint = CHECKOUT_URLS[key];
  if (!endpoint) {
    throw Object.assign(new Error(`Unknown pricing category: ${pricingCategory}`), { status: 400 });
  }

  let webynePlanId = planId;
  if (planName) {
    webynePlanId = await resolveWebynePlanId(pricingCategory, planName);
    console.log(
      `[webyne] Plan "${planName}" → ${pricingCategory} pricing (Webyne plan id ${webynePlanId})`
    );
  } else if (!Number.isFinite(Number(planId))) {
    throw Object.assign(new Error('planName or numeric planId is required'), { status: 400 });
  }

  const webyneBilling = toWebyneBilling(billing);

  const p = await ensureBrowser();
  let purchase = null;

  if (!scrapeOnly) {
    // Fresh CSRF from the pricing page where this plan actually lives
    await robustGoto(p, PRICING_URLS[key] || PRICING_URLS.linux, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    if (p.url().includes('/login')) {
      ready = false;
      await ensureBrowser();
      await robustGoto(p, PRICING_URLS[key] || PRICING_URLS.linux, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
    }

    const token = await extractCsrfToken();
    if (!token) {
      throw Object.assign(new Error('Could not read Webyne CSRF token for checkout'), {
        status: 502,
      });
    }

    console.log(`[webyne] Submitting checkout → ${endpoint}`);
    const res = await context.request.post(endpoint, {
      multipart: {
        id: String(webynePlanId),
        billing: String(webyneBilling),
        template: String(template || ''),
        quantity: String(Math.max(1, Number(quantity) || 1)),
        addons_cpu: '',
        addons_ram: '',
        addons_disk: '',
        _token: token,
      },
      timeout: 180000,
      maxRedirects: 0,
    });

    const status = res.status();
    const bodyText = await res.text().catch(() => '');
    purchase = {
      status,
      ok: status === 200,
      insufficientBalance: status === 202,
      bodySnippet: String(bodyText || '').slice(0, 500),
    };

    if (status === 202) {
      throw Object.assign(
        new Error('Webyne account has insufficient balance to complete purchase'),
        { status: 402, code: 'PROVIDER_INSUFFICIENT_BALANCE', purchase }
      );
    }
    if (status !== 200 && status !== 302 && status !== 301) {
      throw Object.assign(
        new Error(`Webyne checkout failed (HTTP ${status})`),
        { status: 502, purchase }
      );
    }

    // Allow Webyne to provision the row on /admin/server (Datatable often loads late)
    console.log('[webyne] Waiting 10s for server list to update…');
    await p.waitForTimeout(10_000);
  }

  const server = await scrapeLatestServer({
    planName: planName || '',
    initialWaitMs: scrapeOnly ? 2_000 : 0,
  });
  if (!server || (!server.ipAddress && !server.hostname && !server.externalRef)) {
    throw Object.assign(
      new Error(
        'Checkout may have succeeded but no server details were found on /admin/server. Use Fetch details to retry scrape without buying again.'
      ),
      { status: 502, code: 'SERVER_DETAILS_NOT_FOUND', purchase, server }
    );
  }

  const protocol =
    requestedOs === 'windows' ? 'rdp' : server.protocol || 'ssh';

  return {
    purchased: !scrapeOnly,
    purchase,
    pricingCategory,
    webynePlanId,
    server: {
      hostname: server.hostname || null,
      ipAddress: server.ipAddress || null,
      username: server.username || (protocol === 'rdp' ? 'Administrator' : 'root'),
      password: server.password || null,
      protocol,
      externalRef: server.externalRef || null,
      rawLabel: server.rawLabel || null,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Scrape https://cloud.webyne.com/admin/server for the newest / matching VM row.
 * Webyne uses a late-loading DataTable — poll until IPs appear.
 */
async function scrapeLatestServer({
  planName = '',
  initialWaitMs = 0,
  maxAttempts = 5,
  retryWaitMs = 4_000,
} = {}) {
  const p = await ensureBrowser();
  const url = 'https://cloud.webyne.com/admin/server';
  console.log(`[webyne] Scraping servers → ${url}`);
  await robustGoto(p, url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (p.url().includes('/login')) {
    ready = false;
    await ensureBrowser();
    await robustGoto(p, url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  }

  if (initialWaitMs > 0) {
    console.log(`[webyne] Initial scrape wait ${initialWaitMs}ms…`);
    await p.waitForTimeout(initialWaitMs);
  }

  // Wait for DataTables / AJAX rows (IP pattern or "Click Here To View")
  await p
    .waitForFunction(
      () => {
        const text = document.body?.innerText || '';
        const ipRe =
          /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/;
        return (
          ipRe.test(text) ||
          /click here to view/i.test(text) ||
          document.querySelectorAll('table tbody tr td').length > 2
        );
      },
      { timeout: 60_000 }
    )
    .catch(() => {});

  let preferred = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    preferred = await extractServerRows(p, planName);
    if (preferred && (preferred.ipAddress || preferred.externalRef)) {
      console.log(
        `[webyne] Server row found on attempt ${attempt}: id=${preferred.externalRef} ip=${preferred.ipAddress}`
      );
      break;
    }
    console.log(
      `[webyne] No server row yet (attempt ${attempt}/${maxAttempts}), waiting ${retryWaitMs}ms…`
    );
    await p.waitForTimeout(retryWaitMs);
    if (attempt < maxAttempts) {
      await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
      await p.waitForTimeout(1500);
    }
  }

  if (!preferred || (!preferred.ipAddress && !preferred.externalRef)) {
    const bodyText = await p.evaluate(() => document.body?.innerText || '');
    console.warn(
      '[webyne] scrape miss — page snippet:',
      String(bodyText || '').replace(/\s+/g, ' ').slice(0, 400)
    );
    return null;
  }

  // Prefer clicking the matching row's "Click Here To View" (opens machineshow Dashboard)
  try {
    const clicked = await p.evaluate(({ id, ip }) => {
      const rows = Array.from(document.querySelectorAll('table tbody tr, table tr'));
      for (const tr of rows) {
        const t = tr.innerText || '';
        if ((id && t.includes(String(id))) || (ip && t.includes(String(ip)))) {
          const a = Array.from(tr.querySelectorAll('a')).find((el) =>
            /click here to view/i.test(el.textContent || '')
          );
          if (a) {
            a.click();
            return true;
          }
        }
      }
      const fallback = Array.from(document.querySelectorAll('a')).find((el) =>
        /click here to view/i.test(el.textContent || '')
      );
      if (fallback) {
        fallback.click();
        return true;
      }
      return false;
    }, { id: preferred.externalRef, ip: preferred.ipAddress });

    if (clicked) {
      console.log('[webyne] Clicked "Click Here To View"…');
      await p.waitForURL(/machineshow|server|machine/i, { timeout: 45000 }).catch(() => {});
      await p.waitForTimeout(2000);
      preferred.href = p.url();
      console.log(`[webyne] Landed on detail → ${preferred.href}`);
    }
  } catch (err) {
    console.warn('[webyne] Click Here To View failed:', err.message);
  }

  let username = null;
  let password = null;
  let hostname = preferred.hostname;
  let ipAddress = preferred.ipAddress;
  let externalRef = preferred.externalRef;

  // Try several known detail URL shapes when href missing or IP/password still missing
  const detailCandidates = [];
  if (preferred.href && /machineshow|server|machine/i.test(preferred.href)) {
    detailCandidates.push(preferred.href);
  } else if (preferred.href) {
    detailCandidates.push(preferred.href);
  }
  if (preferred.externalRef) {
    detailCandidates.push(
      `/admin/server/view/${preferred.externalRef}`,
      `/admin/server/manage/${preferred.externalRef}`,
      `/admin/server/${preferred.externalRef}`
    );
  }

  // If we already clicked through to machineshow, parse current page first
  if (/machineshow/i.test(p.url())) {
    detailCandidates.unshift(p.url());
  }
  // Dedupe
  const seen = new Set();
  const uniqueCandidates = detailCandidates.filter((u) => {
    const key = String(u);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const detailHrefCandidate of uniqueCandidates) {
    const detailUrl = detailHrefCandidate.startsWith('http')
      ? detailHrefCandidate
      : `https://cloud.webyne.com${detailHrefCandidate.startsWith('/') ? '' : '/'}${detailHrefCandidate}`;
    try {
      if (p.url() !== detailUrl && !p.url().startsWith(detailUrl.split('?')[0])) {
        console.log(`[webyne] Opening server detail → ${detailUrl}`);
        await robustGoto(p, detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } else {
        console.log(`[webyne] Already on detail → ${p.url()}`);
      }
      if (p.url().includes('/login')) break;

      await p
        .waitForFunction(
          () => /IPV4|Password|Username|Login/i.test(document.body?.innerText || ''),
          { timeout: 15_000 }
        )
        .catch(() => {});
      await p.waitForTimeout(1000);

      // Reveal hidden password UI if present
      const reveal = p.locator(
        'button:has-text("Show"), a:has-text("Show"), [class*="eye"], [aria-label*="show" i]'
      );
      if ((await reveal.count().catch(() => 0)) > 0) {
        await reveal.first().click({ timeout: 2000 }).catch(() => {});
        await p.waitForTimeout(400);
      }

      const detail = await p.evaluate(() => {
        const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const text = document.body?.innerText || '';
        const html = document.body?.innerHTML || '';
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const flat = normalize(text);
        const ipRe =
          /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/;

        const valueAfterLabel = (labels) => {
          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            for (const label of labels) {
              const same = line.match(
                new RegExp(`^${label}\\s*[:.\\-]?\\s*(.+)$`, 'i')
              );
              if (same) {
                const v = normalize(same[1]);
                if (v && !new RegExp(`^${label}$`, 'i').test(v)) return v;
              }
              if (new RegExp(`^${label}\\s*[:.\\-]?\\s*$`, 'i').test(line)) {
                const next = lines[i + 1];
                if (
                  next &&
                  !labels.some((l) => new RegExp(`^${l}\\b`, 'i').test(next))
                ) {
                  return normalize(next);
                }
              }
            }
          }
          return null;
        };

        const pickMultiline = (label) => {
          const re = new RegExp(
            `${label}\\s*[:.\\-]?\\s*[\\r\\n]+\\s*([^\\r\\n]+)`,
            'i'
          );
          const m = text.match(re);
          return m ? normalize(m[1]) : null;
        };

        const ipv4Line = text.match(/IPV4\s*[:.]?\s*([^\s\n]+)/i);
        let ipAddress = null;
        if (ipv4Line && ipRe.test(ipv4Line[1])) {
          ipAddress = ipv4Line[1].match(ipRe)[0];
        } else {
          ipAddress = (text.match(ipRe) || [])[0] || null;
        }

        let hostname =
          valueAfterLabel(['Hostname', 'Server name', 'VM name']) ||
          pickMultiline('Hostname');
        if (hostname && /^(setup|active|dashboard|type here|completed)/i.test(hostname)) {
          hostname = null;
        }

        // machineshow LOGIN uses <input value="root"> / <input value="…"> —
        // page innerText after "Password" is often a brand word like "virtualizer".
        const BAD_CREDS =
          /^(virtualizer|password|username|login|network|ipv4|ipv6|show|hide|copy|active|dashboard|console|reboot|start|stop|setup|completed|type here)$/i;
        const looksLikeUsername = (s) =>
          Boolean(s) &&
          !BAD_CREDS.test(s) &&
          /^(root|administrator|[a-z][a-z0-9._-]{1,31})$/i.test(s);
        const looksLikePassword = (s) => {
          if (!s || s.length < 6 || s.length > 128 || BAD_CREDS.test(s)) return false;
          if (/^https?:\/\//i.test(s)) return false;
          return /[0-9]/.test(s) || (/[a-z]/.test(s) && /[A-Z]/.test(s));
        };

        const inputNearLabel = (labelNames) => {
          const nodes = Array.from(
            document.querySelectorAll(
              'label, span, div, p, h1, h2, h3, h4, h5, strong, b, td, th'
            )
          );
          for (const el of nodes) {
            const own = normalize(
              Array.from(el.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent)
                .join('')
            );
            const candidate =
              own || (el.children.length === 0 ? normalize(el.textContent) : '');
            if (!labelNames.some((l) => new RegExp(`^${l}$`, 'i').test(candidate))) {
              continue;
            }
            const scope =
              el.closest('.card, .form-group, .mb-3, form, section, li, td, tr, div') ||
              el.parentElement;
            if (!scope) continue;
            for (const input of Array.from(scope.querySelectorAll('input'))) {
              const v = String(input.value || input.getAttribute('value') || '').trim();
              if (v) return v;
            }
            let sib = el.nextElementSibling;
            for (let i = 0; i < 4 && sib; i += 1, sib = sib.nextElementSibling) {
              if (sib.tagName === 'INPUT') {
                const v = String(sib.value || sib.getAttribute('value') || '').trim();
                if (v) return v;
              }
              const nested = sib.querySelector?.('input');
              if (nested) {
                const v = String(
                  nested.value || nested.getAttribute('value') || ''
                ).trim();
                if (v) return v;
              }
            }
          }
          return null;
        };

        const filledInputValues = () =>
          Array.from(document.querySelectorAll('input'))
            .map((inp) => String(inp.value || inp.getAttribute('value') || '').trim())
            .filter(Boolean);

        let username = inputNearLabel(['Username', 'User name']);
        let password = inputNearLabel(['Password', 'Passwd', 'Root password']);

        if (!username || !password) {
          const vals = filledInputValues();
          if (!username) {
            username = vals.find((v) => looksLikeUsername(v)) || null;
          }
          if (!password) {
            password =
              vals.find((v) => looksLikePassword(v) && v !== username) || null;
          }
          // Typical LOGIN card: first filled = root, second = secret
          if ((!username || !password) && vals.length >= 2) {
            if (!username && looksLikeUsername(vals[0])) username = vals[0];
            if (!password && looksLikePassword(vals[1])) password = vals[1];
          }
        }

        // Text-line fallback only when it looks like a real secret (skip "virtualizer")
        if (!username) {
          const u =
            valueAfterLabel(['Username', 'User name']) || pickMultiline('Username');
          if (looksLikeUsername(u)) username = u;
        }
        if (!password) {
          const pw =
            valueAfterLabel(['Password', 'Passwd', 'Root password']) ||
            pickMultiline('Password');
          if (looksLikePassword(pw)) password = pw;
        }

        if (!password) {
          const htmlPass = html.match(
            /Password[\s\S]{0,160}?(?:<\/[^>]+>\s*){0,4}([A-Za-z0-9!@#$%^&*._+=\-]{8,64})/i
          );
          if (htmlPass && looksLikePassword(htmlPass[1])) password = htmlPass[1];
        }
        if (!username) {
          const htmlUser = html.match(
            /Username[\s\S]{0,160}?(?:<\/[^>]+>\s*){0,4}(root|administrator|[A-Za-z0-9._-]{2,32})/i
          );
          if (htmlUser && looksLikeUsername(htmlUser[1])) username = htmlUser[1];
        }

        if (username && !looksLikeUsername(username)) username = null;
        if (password && !looksLikePassword(password)) password = null;

        if (!password) {
          const clip = document.querySelector(
            '[data-clipboard-text], [data-password], [data-copy]'
          );
          const clipVal =
            clip?.getAttribute('data-clipboard-text') ||
            clip?.getAttribute('data-password') ||
            clip?.getAttribute('data-copy');
          if (clipVal && looksLikePassword(String(clipVal))) {
            password = String(clipVal);
          }
        }

        const passIdx = lines.findIndex((l) => /^password\b/i.test(l));
        const userIdx = lines.findIndex((l) => /^username\b/i.test(l));
        const loginIdx = lines.findIndex((l) => /^login$/i.test(l));

        return {
          notFound: /404|not found|no data/i.test(flat.slice(0, 200)),
          url: location.href,
          ipAddress,
          hostname: hostname || null,
          username: username || null,
          password: password || null,
          hasLoginSection: /Login/i.test(text),
          lineCount: lines.length,
          userIdx,
          passIdx,
          nextAfterPassLen:
            passIdx >= 0 && lines[passIdx + 1] ? lines[passIdx + 1].length : 0,
          sampleAroundLogin: lines
            .slice(Math.max(0, loginIdx), Math.max(0, loginIdx) + 8)
            .map((l, idx) => {
              // redact likely secrets (token-like), keep labels
              if (/^password$/i.test(l) || /^username$/i.test(l) || /^login$/i.test(l)) {
                return l;
              }
              if (idx > 0 && /^password$/i.test(lines[Math.max(0, loginIdx) + idx - 1])) {
                return `[redacted:${l.length}]`;
              }
              if (idx > 0 && /^username$/i.test(lines[Math.max(0, loginIdx) + idx - 1])) {
                return l; // username (root) is fine
              }
              return l.length > 24 ? `${l.slice(0, 12)}…` : l;
            }),
        };
      });

      console.log(
        `[webyne] Detail parse → ip=${detail.ipAddress || '-'} user=${detail.username || '-'} pass=${detail.password ? 'yes' : 'no'} host=${detail.hostname || '-'} login=${detail.hasLoginSection} lines=${detail.lineCount} userIdx=${detail.userIdx} passIdx=${detail.passIdx} nextPassLen=${detail.nextAfterPassLen} sample=${JSON.stringify(detail.sampleAroundLogin || [])}`
      );

      if (detail.notFound && !detail.ipAddress && !detail.password) continue;
      ipAddress = detail.ipAddress || ipAddress;
      hostname = detail.hostname || hostname;
      username = detail.username || username;
      password = detail.password || password;
      // Prefer continuing until password is found on machineshow
      if (password) break;
      if (detail.url && /machineshow/i.test(detail.url) && !password) {
        console.warn('[webyne] machineshow opened but password not parsed yet');
      }
    } catch (err) {
      console.warn('[webyne] detail scrape failed:', err.message);
    }
  }

  // Default linux username when Webyne Login shows root-style access
  if (!username && ipAddress) username = 'root';

  // If list row had no IP but we know the newest ID, keep ID/hostname even without password
  if (!ipAddress && !hostname && !externalRef) return null;

  return {
    hostname: hostname || (externalRef ? String(externalRef) : null),
    ipAddress: ipAddress || null,
    username,
    password,
    protocol: null,
    externalRef: externalRef || null,
    rawLabel: preferred.text?.slice(0, 300) || null,
  };
}

async function extractServerRows(p, planName) {
  const rows = await p.evaluate((wantPlan) => {
    const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const ipRe =
      /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/;
    const out = [];

    const pushRow = (text, cells, href) => {
      const flat = normalize(text);
      if (!flat || flat.length < 8) return;
      const ipMatch = flat.match(ipRe);
      // Webyne list: "179495  103.109.180.180  Click Here To View …"
      const idNearIp = flat.match(
        /\b(\d{4,8})\s+(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/
      );
      const idOnly = flat.match(/^\s*(\d{4,8})\b/) || flat.match(/\bID[:\s#]*(\d+)\b/i);
      const hrefId = href && href.match(/(\d{4,8})/);
      out.push({
        cells: cells || [],
        text: flat,
        ipAddress: ipMatch ? ipMatch[0] : null,
        hostname: cells?.[0] || (idNearIp ? idNearIp[1] : null),
        href: href || null,
        externalRef: String(
          (idNearIp && idNearIp[1]) ||
            (hrefId && hrefId[1]) ||
            (idOnly && idOnly[1]) ||
            ''
        ) || null,
        matchesPlan: wantPlan
          ? flat.toLowerCase().includes(String(wantPlan).toLowerCase())
          : false,
        isActive: /\bactive\b/i.test(flat),
      });
    };

    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const trs = Array.from(table.querySelectorAll('tbody tr, tr')).filter(
        (tr) => tr.querySelectorAll('td').length >= 2
      );
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) =>
          normalize(td.textContent)
        );
        // Prefer full row text / HTML — some columns hide IP until link click
        const rowText = normalize(tr.innerText || cells.join(' | '));
        const rowHtml = tr.innerHTML || '';
        const links = Array.from(tr.querySelectorAll('a'));
        const link =
          links.find((a) => /click here to view|view/i.test(a.textContent || '')) ||
          links.find((a) =>
            /server|detail|view|manage/i.test(
              `${a.textContent || ''} ${a.getAttribute('href') || ''}`
            )
          ) ||
          links[0] ||
          null;
        const href = link?.getAttribute('href') || null;
        // IP may live in cell text, title, data-*, or HTML only
        let ip =
          (rowText.match(ipRe) || [])[0] ||
          (rowHtml.match(ipRe) || [])[0] ||
          null;
        if (!ip) {
          for (const a of links) {
            const blob = `${a.textContent || ''} ${a.getAttribute('href') || ''} ${a.getAttribute('title') || ''}`;
            const m = blob.match(ipRe);
            if (m) {
              ip = m[0];
              break;
            }
          }
        }
        const mergedText = ip && !rowText.includes(ip) ? `${rowText} ${ip}` : rowText;
        pushRow(mergedText, cells, href);
        if (ip) {
          const last = out[out.length - 1];
          if (last && !last.ipAddress) last.ipAddress = ip;
        }
      }
    }

    // DataTables / custom markup without classic <tr>
    if (!out.some((r) => r.ipAddress)) {
      const links = Array.from(document.querySelectorAll('a')).filter((a) =>
        /click here to view|view/i.test(a.textContent || '')
      );
      for (const link of links) {
        const block =
          link.closest('tr, .row, .card, li, div') || link.parentElement;
        const text = normalize(block?.innerText || link.textContent);
        pushRow(text, [], link.getAttribute('href'));
      }
    }

    // Full-page text pairs: "<id> <ip>" — also enrich rows that only have an ID
    {
      const body = document.body?.innerText || '';
      const pairRe =
        /\b(\d{4,8})\s+((?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d))\b/g;
      let m;
      while ((m = pairRe.exec(body))) {
        const id = m[1];
        const ip = m[2];
        const existing = out.find((r) => r.externalRef === id);
        if (existing) {
          if (!existing.ipAddress) existing.ipAddress = ip;
          if (!existing.text.includes(ip)) existing.text = `${existing.text} ${ip}`;
        } else {
          pushRow(`${id} ${ip}`, [id, ip], null);
        }
      }
    }

    return out;
  }, planName);

  if (!rows.length) return null;

  const withIp = rows.filter((r) => r.ipAddress);
  console.log(
    `[webyne] Extracted ${rows.length} rows, ${withIp.length} with IP. Top IDs:`,
    [...rows]
      .map((r) => `${r.externalRef}:${r.ipAddress || '-'}`)
      .slice(0, 12)
      .join(', ')
  );

  const scored = [...rows].sort((a, b) => {
    const idA = Number(a.externalRef) || 0;
    const idB = Number(b.externalRef) || 0;
    // Newest Webyne server IDs are highest
    return idB - idA;
  });

  return (
    // Prefer newest ID first (even if IP only appears after opening detail)
    scored.find((r) => r.matchesPlan && r.isActive && (r.ipAddress || r.href || r.externalRef)) ||
    scored.find((r) => r.isActive && (r.ipAddress || r.href || r.externalRef)) ||
    scored.find((r) => r.matchesPlan && r.ipAddress) ||
    scored.find((r) => r.ipAddress) ||
    scored.find((r) => r.externalRef) ||
    scored[0]
  );
}

module.exports = {
  PRICING_URLS,
  CHECKOUT_URLS,
  BILLING_TEMPLATE_CODE,
  LINUX_PRICING_PLANS,
  resolvePricingCategory,
  fetchPricingCategory,
  fetchAllPricing,
  fetchCartDetails,
  fetchBuyNowPreview,
  buildBuyNowPreview,
  fetchTemplates,
  fetchPlanDetails,
  purchaseAndScrape,
  scrapeLatestServer,
  ensureBrowser,
  shutdown,
};
