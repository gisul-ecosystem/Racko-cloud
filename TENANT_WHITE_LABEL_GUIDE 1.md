# White-label tenant platform — setup, API, and frontend handoff

> **Frontend IDE prompt (copy-paste):** [`FRONTEND_TENANT_PORTAL_PROMPT.md`](./FRONTEND_TENANT_PORTAL_PROMPT.md)  
> This file is the full reference. Use the prompt file when handing work to a frontend dev or Cursor agent.

Single reference for **super-admin provisioning** (create tenant → assign service → create admin), **tenant login**, **wallet + orders**, and **client-portal frontend** implementation.

All API calls go through the gateway unless noted: `NEXT_PUBLIC_GATEWAY_URL` (default `http://localhost:8000`).

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Prerequisites, gateway blocker, and host resolution](#2-prerequisites-gateway-blocker-and-host-resolution)
3. [Super-admin setup flow (step by step)](#3-super-admin-setup-flow-step-by-step)
4. [Tenant admin login and password reset](#4-tenant-admin-login-and-password-reset)
5. [Assigning services (vm-management)](#5-assigning-services-vm-management)
6. [Tenant wallet API](#6-tenant-wallet-api)
7. [Tenant orders API](#7-tenant-orders-api)
8. [Super-admin order approval (backend only)](#8-super-admin-order-approval-backend-only)
9. [Frontend — what exists vs. what to build](#9-frontend--what-exists-vs-what-to-build)
10. [Local dev checklist](#10-local-dev-checklist)
11. [Security invariants](#11-security-invariants)

---

## 1. Architecture overview

```
Browser (tenant domain, e.g. acme.racko.cloud)
    │
    ▼
cloud-gateway
  • tenantResolver: hostname → tenant { id, slug, status }
  • forwards x-tenant-id to core-api (when wired)
    │
    ▼
core-api
  • Tenant auth: compound lookup { tenantId, email }
  • requireTenantAuth: JWT tenantId must match x-tenant-id (host isolation)
  • Wallet → Orders → super-admin approve → vm.service.createVM
```

**Roles**

| Role | Who | Can do |
|------|-----|--------|
| `super_admin` | Platform operator | Create tenants, assign services, create tenant admins, approve/reject orders |
| `tenant_admin` | Tenant operator | Login, wallet top-up, place VM orders |
| `tenant_user` | Tenant member | Login, view wallet (read-only); **cannot** top-up or order |

There is **no self-registration** for tenants.

---

## 2. Prerequisites, gateway blocker, and host resolution

### core-api (done)

Tenant lifecycle, auth, wallet, Razorpay webhook, and orders are implemented in `core-api`.

### cloud-gateway (required before tenant login E2E)

`cloud-gateway/src/routes/proxy.routes.ts` does **not** yet expose tenant-facing routes. The catch-all `/api/v1` path requires a **platform** JWT, which rejects tenant tokens.

**Backend follow-up:** add these proxy routes and inject `x-tenant-id` from `req.tenantContext.id` **before** forwarding to core-api:

| Auth | Routes |
|------|--------|
| **Public** (no Bearer) | `POST /api/v1/tenant-auth/login`, `/forgot-password`, `/reset-password` |
| **Tenant Bearer** (`type: 'tenant'` in JWT; do **not** use platform `verifyMiddleware`) | `GET/POST /api/v1/tenant-wallet/*`, `GET/POST /api/v1/tenant-orders/*` |

Super-admin tenant CRUD (`/api/v1/tenants/*`) already works via the catch-all because it uses the **platform** `super_admin` JWT.

Until gateway tenant routes are wired, test tenant login by calling `core-api` directly on port `8001` with a manual `x-tenant-id` header (see [Section 4](#4-tenant-admin-login-and-password-reset)).

### Host header — how tenant identity reaches the API

Tenant isolation is **host-based**. The browser does not send `x-tenant-id`; the gateway derives it from the HTTP **Host** (or **X-Forwarded-Host** behind a load balancer).

```
Browser opens https://labs.acme.com/tenant/login
    │
    │  HTTP request includes:
    │    Host: labs.acme.com
    │    (no x-tenant-id from browser)
    ▼
cloud-gateway — tenantResolver (runs on every request)
    │
    │  1. resolveHost(req):
    │       x-forwarded-host  OR  host  → strip port → lowercase
    │       e.g. "labs.acme.com:3000" → "labs.acme.com"
    │
    │  2. POST core-api /internal/tenants/resolve { host: "labs.acme.com" }
    │       matches Tenant.domain where status = 'active'
    │
    │  3. Sets req.tenantContext = { id, slug, status }
    │
    │  4. On tenant routes, gateway must set:
    │       x-tenant-id: <tenantContext.id>
    │     before proxying to core-api
    ▼
core-api
    │
    │  tenant-auth/login: reads x-tenant-id → looks up TenantUser by { tenantId, email }
    │  requireTenantAuth: JWT payload.tenantId must === x-tenant-id (TENANT_MISMATCH if not)
```

**Implications for developers**

| Rule | Detail |
|------|--------|
| Tenant `domain` must match browser hostname | Set in super-admin UI or `POST /api/v1/tenants` — e.g. `labs.acme.com` |
| Platform login uses main domain | `localhost:3000/login` → no tenant context → correct for `super_admin` |
| Tenant login uses tenant domain | `labs.acme.com:3000/tenant/login` → gateway resolves tenant → login works |
| Frontend never sets `x-tenant-id` | Host header is implicit from the URL the user navigated to |
| JWT is bound to tenant | Token issued on `labs.acme.com` must fail on `other-tenant.com` even with valid signature |

**Local dev without real DNS** — add to `C:\Windows\System32\drivers\etc\hosts` (or `/etc/hosts`):

```
127.0.0.1   labs.acme.com
```

Then open `http://labs.acme.com:3000` (client-portal) and `http://labs.acme.com:8000` (gateway). The tenant record’s `domain` field must be exactly `labs.acme.com`.

**Behind nginx / reverse proxy:** ensure `X-Forwarded-Host` is passed through to the gateway (`trust proxy` must be configured on gateway).

### CORS

`core-api` allows `x-tenant-id` in CORS `allowedHeaders` for direct testing. Production tenant flows rely on gateway injection, not browser-sent tenant headers.

---

## 3. Super-admin setup flow (step by step)

Use a platform `super_admin` session (`Authorization: Bearer <platform_access_token>`).

**UI (already built):** Super Admin Console → **White Labelling** at `/super-admin-console/white-labelling`

| Step | API | UI location |
|------|-----|-------------|
| Create tenant | `POST /api/v1/tenants` | `/white-labelling/tenants` → Create tenant modal |
| Set active | `PATCH /api/v1/tenants/:id` | `/white-labelling/tenants/:id` → General tab → Status |
| Assign service | `POST /api/v1/tenants/:tenantId/services` | Same page → Services tab → Assign service |
| Create tenant admin | `POST /api/v1/tenants/:tenantId/admin` | Same page → Tenant Admins tab → Create admin |

Frontend API client: `client-portal/lib/tenantApi.ts` (uses platform `apiClient.ts` — correct for super-admin routes).
Types: `client-portal/lib/tenantTypes.ts`.

### Step 1 — Create tenant

```http
POST /api/v1/tenants
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "name": "Acme Labs",
  "domain": "acme.racko.cloud",
  "branding": {
    "logoUrl": "https://cdn.example.com/acme-logo.png",
    "primaryColor": "#1E40AF",
    "supportEmail": "support@acme.com"
  }
}
```

Response includes tenant `id`. Set `status` to `active` if created as `pending`:

```http
PATCH /api/v1/tenants/:id
{ "status": "active" }
```

### Step 2 — Assign vm-management service

Required before tenants can browse templates or place orders. See [Section 5](#5-assigning-services-vm-management).

```http
POST /api/v1/tenants/:tenantId/services
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "serviceKey": "vm-management",
  "limits": {
    "maxVms": 50,
    "maxTotalVcpu": 100,
    "maxTotalRamGb": 256,
    "maxTotalDiskGb": 2000,
    "allowedTemplateIds": []
  },
  "pricing": {
    "cpuRatePerCoreMonthly": 500,
    "ramRatePerGbMonthly": 200,
    "diskRatePerGbMonthly": 50,
    "fixedPlans": []
  }
}
```

- `allowedTemplateIds: []` (or omitted) = tenant may order from the **full enabled platform template catalog**.
- Non-empty array = restrict to those Proxmox `templateId` values only.

### Step 3 — Create first tenant admin

```http
POST /api/v1/tenants/:tenantId/admin
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "email": "admin@acme.com",
  "password": "<strong-password-min-16-chars>"
}
```

Only `super_admin` can create tenant admins. Email is unique **per tenant**, not globally.

### Step 4 — DNS / hosts

Point `acme.racko.cloud` (or add to `hosts` file for local dev) to the gateway. Tenant login only works when the gateway resolves that host to the tenant.

### Step 5 — Tenant logs in

See [Section 4](#4-tenant-admin-login-and-password-reset).

---

## 4. Tenant admin login and password reset

### Who logs in here

**Tenant admins** (and `tenant_user` accounts) created by super-admin via `POST /api/v1/tenants/:tenantId/admin`. They authenticate on the **tenant’s domain**, not the main Racko platform login at `/login`.

### Request flow (host → x-tenant-id → login)

```http
POST /api/v1/tenant-auth/login
Host: labs.acme.com
Content-Type: application/json

{
  "email": "admin@acme.com",
  "password": "..."
}
```

What happens:

1. Browser sends `Host: labs.acme.com` (derived from the URL — no frontend code needed).
2. Gateway `tenantResolver` resolves `labs.acme.com` → tenant MongoDB id.
3. Gateway injects `x-tenant-id: <tenantObjectId>` on the proxied request to core-api.
4. core-api `tenantAuth.controller` reads `x-tenant-id`; if missing → `401 TENANT_NOT_FOUND`.
5. `tenantAuth.service.login` queries `TenantUser.findOne({ tenantId, email })` — **never email alone**.
6. On success, returns JWT `{ sub, tenantId, role, type: 'tenant' }`.

### Direct core-api testing (bypass gateway)

When gateway tenant routes are not wired yet:

```bash
curl -X POST http://localhost:8001/api/v1/tenant-auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: <TENANT_OBJECT_ID>" \
  -d '{"email":"admin@acme.com","password":"..."}'
```

Replace `<TENANT_OBJECT_ID>` with the id from super-admin UI or `GET /api/v1/tenants`.

### Login response

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "accessToken": "<jwt>",
    "tenantUser": {
      "id": "...",
      "email": "admin@acme.com",
      "role": "tenant_admin",
      "tenantId": "..."
    }
  }
}
```

**Errors**

| HTTP | `message` | When | Frontend UX |
|------|-----------|------|-------------|
| 401 | `TENANT_NOT_FOUND` | Host not mapped to active tenant, or `x-tenant-id` missing | “This domain is not recognized as an active tenant.” |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password or inactive user | Generic “Incorrect email or password.” |
| 401 | `TENANT_MISMATCH` | Valid tenant JWT used on a different tenant’s host | Force logout → redirect to tenant login |

### After login — authenticated tenant requests

Every wallet/order request must include:

```http
Authorization: Bearer <tenant_accessToken>
Host: labs.acme.com
```

Gateway resolves host again → injects matching `x-tenant-id`. core-api `requireTenantAuth` verifies:

- `payload.type === 'tenant'`
- `payload.tenantId === req.tenantContext.id`

A token from tenant A **must fail** on tenant B’s domain even with a valid signature.

### Forgot password

```http
POST /api/v1/tenant-auth/forgot-password
{ "email": "admin@acme.com" }
```

Always returns success message (no user enumeration). **Note:** email delivery is still a backend stub in dev (token logged to `core-api` console).

### Reset password

```http
POST /api/v1/tenant-auth/reset-password
{
  "token": "<from-email-or-console>",
  "newPassword": "..."
}
```

### Branding gap

`branding` is stored on the Tenant model but **not** returned in the login response. The frontend should use Racko defaults until a public branding endpoint is added.

---

## 5. Assigning services (vm-management)

**Auth:** `super_admin` only  
**Base:** `/api/v1/tenants/:tenantId/services`

### Assign (create)

```http
POST /api/v1/tenants/:tenantId/services
```

Body is a discriminated union on `serviceKey`. Catalog: `vm-management`, `azure`.

#### vm-management — full example

```json
{
  "serviceKey": "vm-management",
  "limits": {
    "maxVms": 50,
    "maxTotalVcpu": 100,
    "maxTotalRamGb": 256,
    "maxTotalDiskGb": 2000,
    "allowedTemplateIds": [100, 101]
  },
  "pricing": {
    "cpuRatePerCoreMonthly": 500,
    "ramRatePerGbMonthly": 200,
    "diskRatePerGbMonthly": 50,
    "fixedPlans": [
      {
        "name": "Small",
        "cpuCores": 2,
        "memoryGb": 4,
        "diskGb": 40,
        "priceMonthly": 2500
      }
    ]
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `limits.maxVms` | yes | positive integer |
| `limits.maxTotalVcpu` | yes | positive integer |
| `limits.maxTotalRamGb` | yes | positive number |
| `limits.maxTotalDiskGb` | yes | positive number |
| `limits.allowedTemplateIds` | no | default `[]` = unrestricted catalog |
| `pricing.cpuRatePerCoreMonthly` | yes | INR per core per month |
| `pricing.ramRatePerGbMonthly` | yes | INR per GB RAM per month |
| `pricing.diskRatePerGbMonthly` | yes | INR per GB disk per month |
| `pricing.fixedPlans` | no | optional preset plans (ordering uses template baseline + rates above) |

**Order cost formula** (backend, authoritative):

```
perVm = cpuCores * cpuRatePerCoreMonthly
      + memoryGb * ramRatePerGbMonthly
      + diskGb * diskRatePerGbMonthly
total = perVm * count
```

Specs come from the Proxmox template baseline at order time and are snapshotted on the order.

### List services

```http
GET /api/v1/tenants/:tenantId/services
```

### Update service config

```http
PATCH /api/v1/tenants/:tenantId/services/:serviceKey
{
  "limits": { "maxVms": 100 },
  "pricing": { "cpuRatePerCoreMonthly": 600 },
  "status": "active"
}
```

At least one of `limits`, `pricing`, or `status` required. Merged config must pass validation.

### Remove service

```http
DELETE /api/v1/tenants/:tenantId/services/:serviceKey?force=true
```

---

## 6. Tenant wallet API

**Auth:** Bearer `<tenant_accessToken>` + host-resolved `x-tenant-id`  
**Base:** `/api/v1/tenant-wallet`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/` | any tenant user | `{ balance, currency }` — lazy-creates wallet |
| GET | `/transactions?page=1&limit=20` | any tenant user | Paginated ledger |
| POST | `/topup` | `tenant_admin` | Create Razorpay order |

### Get balance

```json
{
  "success": true,
  "data": { "balance": 1500, "currency": "INR" }
}
```

### Transactions

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "...",
        "type": "debit",
        "amount": 1200,
        "reason": "order_payment",
        "relatedOrderId": "...",
        "balanceAfter": 300,
        "createdAt": "..."
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20
  }
}
```

### Top-up

```http
POST /api/v1/tenant-wallet/topup
{ "amount": 5000 }
```

```json
{
  "success": true,
  "data": {
    "razorpayOrderId": "order_...",
    "amount": 5000,
    "currency": "INR",
    "keyId": "rzp_test_..."
  }
}
```

Wallet credit happens via **webhook** `POST /webhooks/razorpay` on `core-api` (not through gateway in current setup — confirm gateway proxies `/webhooks/razorpay` if needed). Frontend must not assume instant balance update after Razorpay checkout success.

**core-api env:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

---

## 7. Tenant orders API

**Auth:** Bearer tenant token  
**Role:** `tenant_admin` on all routes  
**Base:** `/api/v1/tenant-orders`

### List available templates

```http
GET /api/v1/tenant-orders/templates
```

```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "templateId": 100,
        "name": "Ubuntu 22.04",
        "node": "pve1",
        "baselineSpecs": {
          "cpuCores": 2,
          "memoryGb": 4,
          "diskGb": 40
        },
        "pricePerVm": 2500
      }
    ]
  }
}
```

### Place order

```http
POST /api/v1/tenant-orders
{ "templateId": 100, "count": 2 }
```

```json
{
  "success": true,
  "data": {
    "id": "...",
    "tenantId": "...",
    "templateId": 100,
    "templateName": "Ubuntu 22.04",
    "count": 2,
    "specs": { "cpuCores": 2, "memoryGb": 4, "diskGb": 40 },
    "calculatedAmount": 5000,
    "status": "pending_approval",
    "createdBy": "...",
    "approvedBy": null,
    "rejectedBy": null,
    "rejectionReason": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

| `status` after create | Meaning |
|---------------------|---------|
| `pending_approval` | Wallet had enough balance; amount debited; awaiting super-admin |
| `pending_payment` | Insufficient balance; no debit; user must top up and re-submit |

### List orders

```http
GET /api/v1/tenant-orders
```

```json
{
  "success": true,
  "data": {
    "orders": [ "...same order shape..." ]
  }
}
```

**Order statuses:** `pending_payment`, `pending_approval`, `approved`, `rejected`, `fulfilled`

---

## 8. Super-admin order approval (backend only)

Separate frontend task under `super-admin-console`. API for reference:

```http
GET  /api/v1/super-admin/orders?status=pending_approval
PATCH /api/v1/super-admin/orders/:orderId/approve
PATCH /api/v1/super-admin/orders/:orderId/reject
     { "reason": "..." }
```

- **Approve** → calls existing `vmService.createVM` with snapshotted specs → `fulfilled`
- **Reject** → auto-refund to wallet → `rejected`

---

## 9. Frontend — what exists vs. what to build

### 9.1 Already built — Super-admin White Labelling console

These files implement **platform super-admin** tenant management (not tenant self-service login).

**Routes**

| Path | Purpose |
|------|---------|
| `/super-admin-console/white-labelling` | Overview stats, recent tenants |
| `/super-admin-console/white-labelling/tenants` | Tenant list, create modal, search/filter |
| `/super-admin-console/white-labelling/tenants/[id]` | Tenant detail — General, Services, Admins tabs |

**API layer** (`lib/tenantApi.ts` + `lib/tenantTypes.ts`)

| Function | Backend route |
|----------|---------------|
| `fetchSuperAdminOverview()` | `GET /api/v1/super-admin/overview` |
| `fetchTenants()` / `createTenant()` / `updateTenant()` / `fetchTenant()` | `/api/v1/tenants` |
| `fetchTenantServices()` / `assignTenantService()` / `updateTenantService()` / `removeTenantService()` | `/api/v1/tenants/:id/services` |
| `createTenantAdmin()` | `POST /api/v1/tenants/:tenantId/admin` |
| `fetchTenantAdmins()` / `setTenantAdminActive()` | `/api/v1/super-admin/tenants/:tenantId/admins` |

Uses **platform** `apiClient.ts` (in-memory platform JWT + refresh cookie) — correct for these routes.

**Components**

```
components/super-admin-console/WhiteLabellingSidebar.tsx
components/super-admin-console/white-labelling/TenantStatusBadge.tsx
components/super-admin-console/white-labelling/OverviewStatCard.tsx
components/super-admin-console/white-labelling/WhiteLabellingEmptyState.tsx
```

**Tenant detail page capabilities** (`tenants/[id]/page.tsx`)

- **General & Branding:** edit name, domain, status, logo URL, primary color, support email
- **Services:** assign `vm-management` (limits + monthly pricing) or `azure` stub; suspend/activate/remove
- **Tenant Admins:** create admin (email + password), list admins, activate/deactivate

**Default vm-management values in UI**

```ts
limits:  { maxVms: 50, maxTotalVcpu: 200, maxTotalRamGb: 512, maxTotalDiskGb: 5000 }
pricing: { cpuRatePerCoreMonthly: 500, ramRatePerGbMonthly: 100, diskRatePerGbMonthly: 10 }
```

### 9.2 Not built yet — Tenant admin portal (wallet + orders)

| Area | Status |
|------|--------|
| `TenantAuthContext` / `tenantApiClient.ts` | **Not created** |
| Tenant login / forgot / reset pages | **Not created** |
| Tenant dashboard (wallet, orders) | **Not created** |
| Razorpay checkout (`next/script`) | **Not used** |
| Super-admin order approval UI | **Not created** |

Platform auth (unchanged): `lib/apiClient.ts` + `context/AuthContext.tsx` + `/login`.

### 9.3 Build tenant admin portal — implementation guide

**Critical:** Do **not** add tenant login to `lib/tenantApi.ts` (that file is super-admin CRUD). Create separate modules:

```
context/TenantAuthContext.tsx       — in-memory tenant token (separate from platform token)
lib/tenantPortalApiClient.ts        — tenant Bearer only, no platform refresh-on-401
lib/tenantPortalApi.ts              — tenantLogin, getTenantWallet, createTenantOrder, etc.
types/tenantPortal.ts               — TenantUser, Order, Wallet types for tenant-facing API
```

Tenant API calls go to the **same** `NEXT_PUBLIC_GATEWAY_URL`. Host header is automatic from `window.location.hostname` when the user is on the tenant domain — **do not** set `x-tenant-id` in fetch/axios.

On 401 / `TENANT_MISMATCH`: clear tenant session → `window.location.replace('/tenant/login')`.

**Suggested routes**

| Route | Purpose |
|-------|---------|
| `/tenant/login` | Tenant admin email + password |
| `/tenant/forgot-password` | Request reset |
| `/tenant/reset-password?token=` | Set new password |
| `/tenant/dashboard/wallet` | Balance, ledger, Razorpay top-up (`tenant_admin`) |
| `/tenant/dashboard/orders` | Order history (`tenant_admin`) |
| `/tenant/dashboard/orders/new` | Template picker + place order (`tenant_admin`) |

Match styling from `app/(auth)/login/page.tsx` (`#0a0f1e` background, `#B91C1C` accent). Layout guard: mirror `app/super-admin-console/layout.tsx`.

**Login page behavior**

1. User must be on tenant domain (e.g. `labs.acme.com`) — show helpful error on main domain if `TENANT_NOT_FOUND`
2. `POST /api/v1/tenant-auth/login` with `{ email, password }` only — no `tenantId` in body
3. Store `accessToken` + `tenantUser` in `TenantAuthContext`
4. Redirect `tenant_admin` → `/tenant/dashboard/wallet`

**Wallet page** — `GET /api/v1/tenant-wallet`, transactions, top-up via Razorpay:

```tsx
import Script from 'next/script';

<Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

const options = {
  key: data.keyId,
  amount: data.amount * 100,
  currency: data.currency,
  order_id: data.razorpayOrderId,
  handler: () => {
    showPendingMessage();
    pollBalance(); // webhook credits wallet — do not optimistically update UI
  },
  theme: { color: tenantPrimaryColor ?? '#B91C1C' },
};
new window.Razorpay(options).open();
```

**Orders** — use `baselineSpecs` + `pricePerVm` from `GET /api/v1/tenant-orders/templates` (not `pricePerMonth`).

**Branding gap:** login response does not include `branding`. Until a public branding endpoint exists, use Racko defaults or hardcode from tenant domain lookup (future).

### 9.4 Do not modify

- `context/AuthContext.tsx`
- `lib/apiClient.ts` (platform refresh flow)
- `lib/tenantApi.ts` (super-admin tenant CRUD — extend only for new super-admin features)
- Platform routes under `/dashboard`, `/console`

### 9.5 Frontend PR checklist (tenant portal)

- [ ] Separate `tenantPortalApiClient` — no collision with platform token
- [ ] Login tested on tenant domain (Host header), not `localhost` unless tenant domain is `localhost`
- [ ] Razorpay via `next/script`, not npm
- [ ] Uses `baselineSpecs` + `pricePerVm`
- [ ] Gateway tenant routes verified or blocker documented
- [ ] `TENANT_NOT_FOUND` vs `INVALID_CREDENTIALS` handled per Section 4

---

## 10. Local dev checklist

### core-api `.env`

```
NODE_ENV=development
MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1   # if SRV DNS fails
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

### client-portal `.env.local`

```
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8000
```

### End-to-end test sequence

1. **Super-admin** (main domain `localhost:3000`): login → White Labelling → create tenant with domain `labs.acme.com` → set **active**
2. Assign `vm-management` with pricing (Services tab)
3. Create `tenant_admin` (Admins tab)
4. Add `127.0.0.1 labs.acme.com` to hosts file
5. Open `http://labs.acme.com:3000/tenant/login` (once built) — **not** `localhost:3000`
6. Tenant admin login → wallet top-up (Razorpay test + webhook)
7. Place order → `pending_approval`
8. Super-admin approve → VMs provisioned → `fulfilled`

### Testing tenant login before tenant UI exists

```bash
# 1. Get tenant id from super-admin UI or API
# 2. Login via core-api directly:
curl -X POST http://localhost:8001/api/v1/tenant-auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: <TENANT_ID>" \
  -d '{"email":"admin@acme.com","password":"YourPassword1!"}'
```

Via gateway (once tenant-auth routes are wired), omit `x-tenant-id` and use:

```bash
curl -X POST http://labs.acme.com:8000/api/v1/tenant-auth/login \
  -H "Content-Type: application/json" \
  -H "Host: labs.acme.com" \
  -d '{"email":"admin@acme.com","password":"YourPassword1!"}'
```

### Verify host isolation (core-api)

```bash
cd core-api
npx ts-node --transpile-only src/middleware/requireTenantAuth.test.ts
# PASS: Phase 0 host-mismatch tenant auth checks
```

---

## 11. Security invariants

1. **Host isolation:** Token for tenant A must fail on tenant B’s domain (`TENANT_MISMATCH`).  
2. **No self-registration:** Only `super_admin` creates tenants, services, and tenant admins.  
3. **`tenantId` on writes** comes from verified JWT context — never from request body/query.  
4. **VM creation** uses existing `vm.service.ts` — not reimplemented.  
5. **Tenant tokens** are separate from platform tokens (`type: 'tenant'` vs platform `userId`/`sessionId` payload).

---

## Quick API index

| Audience | Method | Path | Frontend status |
|----------|--------|------|-----------------|
| Super admin | POST | `/api/v1/tenants` | ✅ `tenantApi.ts` + White Labelling UI |
| Super admin | PATCH | `/api/v1/tenants/:id` | ✅ Tenant detail General tab |
| Super admin | POST | `/api/v1/tenants/:tenantId/services` | ✅ Services tab |
| Super admin | POST | `/api/v1/tenants/:tenantId/admin` | ✅ Admins tab |
| Super admin | GET/PATCH | `/api/v1/super-admin/orders` | ❌ UI not built |
| Tenant (public) | POST | `/api/v1/tenant-auth/login` | ❌ needs host → `x-tenant-id` |
| Tenant | GET | `/api/v1/tenant-wallet` | ❌ portal not built |
| Tenant admin | POST | `/api/v1/tenant-wallet/topup` | ❌ portal not built |
| Tenant admin | GET/POST | `/api/v1/tenant-orders` | ❌ portal not built |
| Razorpay | POST | `/webhooks/razorpay` (core-api) | backend only |
