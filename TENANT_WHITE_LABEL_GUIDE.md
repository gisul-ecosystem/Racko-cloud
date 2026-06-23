# White-label tenant platform — setup, API, and frontend handoff

Single reference for **super-admin provisioning** (create tenant → assign service → create admin), **tenant login**, **wallet + orders**, and **client-portal frontend** implementation.

All API calls go through the gateway unless noted: `NEXT_PUBLIC_GATEWAY_URL` (default `http://localhost:8000`).

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Prerequisites and gateway blocker](#2-prerequisites-and-gateway-blocker)
3. [Super-admin setup flow (step by step)](#3-super-admin-setup-flow-step-by-step)
4. [Tenant login and password reset](#4-tenant-login-and-password-reset)
5. [Assigning services (vm-management)](#5-assigning-services-vm-management)
6. [Tenant wallet API](#6-tenant-wallet-api)
7. [Tenant orders API](#7-tenant-orders-api)
8. [Super-admin order approval (backend only)](#8-super-admin-order-approval-backend-only)
9. [Frontend implementation (`client-portal`)](#9-frontend-implementation-client-portal)
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

## 2. Prerequisites and gateway blocker

### core-api (done)

Tenant lifecycle, auth, wallet, Razorpay webhook, and orders are implemented in `core-api`.

### cloud-gateway (required before production E2E)

`cloud-gateway/src/routes/proxy.routes.ts` does **not** yet expose tenant routes. The catch-all `/api/v1` path requires a **platform** JWT, which rejects tenant tokens.

**Backend follow-up:** add these proxy routes with `x-tenant-id` injected from `req.tenantContext.id`:

| Auth | Routes |
|------|--------|
| **Public** (no Bearer) | `POST /api/v1/tenant-auth/login`, `/forgot-password`, `/reset-password` |
| **Tenant Bearer** (`type: 'tenant'` in JWT; do **not** use platform `verifyMiddleware`) | `GET/POST /api/v1/tenant-wallet/*`, `GET/POST /api/v1/tenant-orders/*` |

Until gateway is updated, test tenant APIs by calling `core-api` directly on port `8001`, or add gateway routes first.

### Host-based tenant resolution

The frontend **must not** set `x-tenant-id`. The gateway resolves the tenant from the request **hostname** and injects the header server-side. Users must open the portal on the tenant’s configured `domain` field.

---

## 3. Super-admin setup flow (step by step)

Use a platform `super_admin` session (`Authorization: Bearer <platform_access_token>`).

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

See [Section 4](#4-tenant-login-and-password-reset).

---

## 4. Tenant login and password reset

### How it works

1. Gateway resolves hostname → sets `x-tenant-id: <tenantObjectId>`.
2. `POST /api/v1/tenant-auth/login` looks up `TenantUser` with **compound query** `{ tenantId, email }` — never email alone.
3. JWT payload: `{ sub, tenantId, role, type: 'tenant' }`.
4. Every tenant-scoped request re-checks `payload.tenantId === x-tenant-id` (`TENANT_MISMATCH` if wrong host).

### Login

```http
POST /api/v1/tenant-auth/login
Content-Type: application/json
x-tenant-id: <set-by-gateway-from-host>

{
  "email": "admin@acme.com",
  "password": "..."
}
```

**Success (200)**

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

| HTTP | `message` | Meaning |
|------|-----------|---------|
| 401 | `TENANT_NOT_FOUND` | No `x-tenant-id` or host not mapped to an active tenant |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password or inactive user |

**Frontend UX:** For `TENANT_NOT_FOUND`, show “This domain is not recognized as an active tenant.” For `INVALID_CREDENTIALS`, show generic “Incorrect email or password.” Do not leak which check failed.

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

## 9. Frontend implementation (`client-portal`)

### Discovery summary (current repo state)

| Area | Status |
|------|--------|
| Tenant pages / context / API client | **None** — only “tenant” word in marketing copy |
| Platform auth | `lib/apiClient.ts` + `context/AuthContext.tsx` — in-memory token, no localStorage |
| Platform login | `app/(auth)/login/page.tsx` at `/login` |
| Razorpay npm / `next/script` | **Not installed / not used** |
| Tenant branding in login API | **Not exposed** |

### Do not modify

- `context/AuthContext.tsx`
- `lib/apiClient.ts` (platform refresh flow)
- Platform routes under `/dashboard`, `/console`, `/super-admin-console`

### Create separate tenant auth stack

Mirror platform patterns but **isolated**:

```
context/TenantAuthContext.tsx     — in-memory tenant token (separate variable)
lib/tenantApiClient.ts            — no platform refresh-on-401
lib/tenantApi.ts                  — tenantLogin, getTenantWallet, createTenantOrder, etc.
types/tenant.ts
```

On tenant 401 / `TENANT_MISMATCH`: clear tenant session → redirect `/tenant/login`.

### Suggested routes

| Route | Purpose |
|-------|---------|
| `/tenant/login` | Email + password |
| `/tenant/forgot-password` | Request reset |
| `/tenant/reset-password?token=` | Set new password |
| `/tenant/dashboard/wallet` | Balance, ledger, Razorpay top-up |
| `/tenant/dashboard/orders` | Order history |
| `/tenant/dashboard/orders/new` | Template picker + place order |

Use `(tenant-auth)` and `(tenant)` route groups like platform’s `(auth)` group. Match styling from `app/(auth)/login/page.tsx` (`#0a0f1e` background, `#B91C1C` accent, `INPUT_CLASS` / `BTN_PRIMARY` patterns).

### Layout guard

Follow `app/super-admin-console/layout.tsx`: loading spinner, redirect if unauthenticated, role check (`tenant_admin` for orders/top-up).

**Nav:** Wallet · Place Order · Order History · Logout

### Wallet page

1. `GET /api/v1/tenant-wallet` — show balance  
2. `GET /api/v1/tenant-wallet/transactions` — paginated table  
3. **Add Funds** (`tenant_admin`): `POST /api/v1/tenant-wallet/topup` → Razorpay checkout

```tsx
import Script from 'next/script';

// First script integration in repo — use lazyOnload
<Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

const options = {
  key: data.keyId,
  amount: data.amount * 100,
  currency: data.currency,
  order_id: data.razorpayOrderId,
  handler: () => {
    // UX only — webhook credits wallet
    showPendingMessage();
    pollBalance(); // every 3s, ~30s max, then manual refresh
  },
  theme: { color: '#B91C1C' },
};
new window.Razorpay(options).open();
```

**Never** optimistically update balance after checkout handler.

### Place order page

1. `GET /api/v1/tenant-orders/templates`  
2. `GET /api/v1/tenant-wallet` — show balance vs total  
3. Cards: name, `baselineSpecs`, `pricePerVm`/month  
4. Count input (default 1)  
5. Display total: `count * pricePerVm` (UX only)  
6. `POST /api/v1/tenant-orders { templateId, count }`  
7. On success:
   - `pending_approval` → confirmation → order history  
   - `pending_payment` → “Insufficient balance” + link to wallet  

### Order history page

`GET /api/v1/tenant-orders` → table with status badges. Show `rejectionReason` when `rejected`. Reuse patterns from `components/dashboard/VMStatusBadge.tsx`.

### Reusable components

`components/ui/Button.tsx`, `LoadingSkeleton`, `ErrorState`, `Toast`, `AuthBrand`

### Out of scope for frontend task

- Super-admin order approval UI  
- Tenant branding editor  
- Auto-resume `pending_payment` orders after top-up  
- Custom VM specs (template + count only)

### Frontend PR checklist

- [ ] Separate `tenantApiClient` (no collision with platform token)  
- [ ] Razorpay via `next/script`, not npm  
- [ ] Uses `baselineSpecs` + `pricePerVm` (not `pricePerMonth`)  
- [ ] Branding gap documented  
- [ ] Gateway tenant routes verified or blocker noted  

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

1. Super-admin login → create tenant → set `active`  
2. Assign `vm-management` with pricing  
3. Create `tenant_admin`  
4. Map tenant domain in DNS/hosts  
5. Tenant login on tenant domain  
6. Top up wallet (Razorpay test mode + webhook)  
7. Place order → `pending_approval`  
8. Super-admin approve → VMs provisioned → `fulfilled`  

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

| Audience | Method | Path |
|----------|--------|------|
| Super admin | POST | `/api/v1/tenants` |
| Super admin | PATCH | `/api/v1/tenants/:id` |
| Super admin | POST | `/api/v1/tenants/:tenantId/services` |
| Super admin | POST | `/api/v1/tenants/:tenantId/admin` |
| Super admin | GET/PATCH | `/api/v1/super-admin/orders` |
| Tenant (public) | POST | `/api/v1/tenant-auth/login` |
| Tenant | GET | `/api/v1/tenant-wallet` |
| Tenant admin | POST | `/api/v1/tenant-wallet/topup` |
| Tenant admin | GET/POST | `/api/v1/tenant-orders` |
| Razorpay | POST | `/webhooks/razorpay` (core-api, signature auth) |
