# Cloud Automation Reseller

Multi-cloud pricing + provisioning for Racko catalog VMs (Phase 1: **AWS** + **Azure**).

Full endpoint documentation: [`API.md`](API.md).

`core-api` calls this service privately (same pattern as `create-vm-catalog-agent`):

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `POST /api/select` | Cheapest AWS/Azure region, or Webyne when `durationDays >= 30` |
| `POST /api/provision` | Launch VM |
| `POST /api/terminate` | Destroy VM |
| `POST /api/pricing/sync` | Refresh `CloudRegionPricing` |
| `GET /api/pricing` | Inspect stored prices |

All `/api/*` routes require `X-Internal-Secret` matching `INTERNAL_SERVICE_SECRET`.

## Local run

```bash
cp .env.example .env
# set INTERNAL_SERVICE_SECRET, MONGODB_URI, AWS_*, AZURE_*
npm install
npm start
```

Default port: **3005**.

## Env

See `.env.example`. Provisioning needs AMI/subnet/SG (AWS) and resource group/VNet/subnet (Azure).

## Dynamic specs

Unknown `canonicalSpec` values (e.g. `16vcpu-64gb-400gbssd`) are resolved on `/api/select`:

1. Parse vCPU / RAM / disk from the spec
2. Discover matching AWS instance type (`DescribeInstanceTypes`) and Azure VM size (Resource SKUs / ladder)
3. Fetch live prices for those SKUs across configured regions
4. Upsert into `CloudRegionPricing` and pick the cheapest

Static entries in `src/config/specMap.js` are only a fast path for common sizes — not a hard limit.
