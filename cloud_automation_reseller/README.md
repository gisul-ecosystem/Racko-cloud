# Cloud Automation Reseller

Multi-cloud pricing + provisioning for Racko catalog VMs (**AWS** + **Azure** + **OCI** + **GCP**).

Full endpoint documentation: [`API.md`](API.md).

`core-api` calls this service privately (same pattern as `create-vm-catalog-agent`):

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `POST /api/select` | Cheapest AWS/Azure/OCI/GCP region, or Webyne when `durationDays >= 30` |
| `POST /api/provision` | Launch VM |
| `POST /api/terminate` | Destroy VM |
| `POST /api/pricing/sync` | Refresh `CloudRegionPricing` |
| `GET /api/pricing` | Inspect stored prices |

All `/api/*` routes require `X-Internal-Secret` matching `INTERNAL_SERVICE_SECRET`.

## Local run

```bash
cp .env.example .env
# set INTERNAL_SERVICE_SECRET, MONGODB_URI, AWS_*, AZURE_*, OCI_*, GCP_*
npm install
npm start
```

Default port: **3005**.

## Env

See `.env` / comments in repo.

- **AWS provision:** AMI / subnet / SG  
- **Azure provision:** resource group / VNet / subnet  
- **OCI pricing:** public list API (no auth)  
- **OCI provision:** tenancy/user/fingerprint/private key + compartment + subnet OCIDs  
- **GCP pricing:** Cloud Billing Catalog (`GCP_API_KEY` or service account); falls back to approximate list rates  
- **GCP provision:** `GCP_PROJECT_ID` + service account key + zone (network/subnet optional)  

## Dynamic specs

Unknown `canonicalSpec` values (e.g. `16vcpu-64gb-400gbssd`) are resolved on `/api/select`:

1. Parse vCPU / RAM / disk from the spec  
2. Discover matching AWS / Azure / OCI / GCP SKUs  
3. Fetch live prices across configured regions  
4. Upsert into `CloudRegionPricing` and pick the cheapest  

### OCI notes

- Shape: `VM.Standard.E4.Flex` (1 OCPU ≈ 2 vCPUs on x86)  
- Compute cost = OCPU$/hr × ocpus + memory$/hr × GB  
- List prices come from `https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/`  

### GCP notes

- Machine types: E2 ladder (`e2-micro` … `e2-standard-*`); GPU → `n1-standard-*` + NVIDIA T4  
- Compute cost ≈ vCPU × core$/hr + RAM × GB$/hr (+ GPU if any)  
- Catalog: `https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus`  
- `providerInstanceId` format: `{zone}/{instanceName}`  

Static entries in `src/config/specMap.js` are only a fast path for common sizes — not a hard limit.
