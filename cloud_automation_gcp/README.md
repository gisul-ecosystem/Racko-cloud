# Cloud Automation GCP

GCP lab automation service (Azure/AWS parity target). Phase 1 includes catalog, requests, and provision orchestration skeleton.

## Quick start (no GCP credentials yet)

```bash
cd cloud_automation_gcp
cp .env.example .env
# set MONGODB_URI
npm install
npm run dev
```

Service runs on **port 3004**. Catalog and requests work without GCP credentials. Provisioning requires org credentials in `.env`.

## When credentials arrive

Add to `.env`:

```env
GCP_PROJECT_ID=racko-master-project-xxxxx
GCP_ORGANIZATION_ID=123456789012
GCP_BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX
GCP_FOLDER_ID=123456789012
GCP_SERVICE_ACCOUNT_KEY_PATH=./gcp-key.json
GCP_DOMAIN=yourcompany.com
GCP_ADMIN_EMAIL=admin@yourcompany.com
```

Then:

```bash
npm run test:auth
```

## GCP pricing API

Yes — GCP has a public **Cloud Billing Catalog API**:

- Base URL: `https://cloudbilling.googleapis.com/v1/services/{SERVICE_ID}/skus`
- Compute Engine service ID: `6F81-5844-456A`
- Auth: `GCP_API_KEY` **or** service account with `cloud-billing.readonly`

When credentials are missing, the app uses **seeded catalog rates** from MongoDB (25 services × regions × instance tiers).

Live Compute Engine VM pricing is resolved from catalog SKUs (vCPU + RAM hourly rates per region).

Flat-rate services (Storage, Functions, BigQuery, etc.) use lab usage tiers like AWS.

Sync pricing: `POST /api/admin/sync-services`


| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/categories` | Service categories |
| GET | `/api/services` | Catalog services |
| GET | `/api/regions` | GCP regions |
| POST | `/api/requests` | Create lab request |
| GET | `/api/requests` | List requests |
| POST | `/api/provision/request/:id/start` | Start provisioning |
| GET | `/api/provision/request/:id/status` | Provision status |

## Architecture

```
client-portal  →  cloud-gateway  →  cloud_automation_gcp
                                         ├── catalog + pricing (MongoDB seed)
                                         ├── request CRUD
                                         └── provision orchestrator (GCP APIs when creds set)
```

## Provision flow

1. Create GCP project under org/folder
2. Apply org policies (Phase 2)
3. Create Cloud Identity users
4. Assign IAM roles (Phase 2)
5. Send credentials email (Phase 2)

Without credentials, step 1 fails with a clear message listing missing env vars.
