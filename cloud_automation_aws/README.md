# Cloud Automation AWS

Phase 2 adds **complete AWS provisioning automation** on top of the existing catalog, pricing, and request modules.

## Architecture

```
client-portal  →  cloud-gateway  →  cloud_automation_aws
                                         ├── catalog + pricing (existing)
                                         ├── request CRUD (existing)
                                         └── provisioning engine (new)
                                              ├── in-process orchestrator
                                              ├── AWS Organizations
                                              ├── IAM Identity Center
                                              └── Resend credentials email
```

## Folder structure (new)

```
src/
├── config/
│   ├── provisioning.js      # OU, email, scheduler settings
│   └── scpPolicies.js       # SCP deny map + helpers
├── models/
│   └── ProvisionLog.js      # Step-level audit log
├── provisioners/aws/
│   ├── accountProvisioner.js
│   ├── scpProvisioner.js
│   ├── identityProvisioner.js
│   ├── permissionSetProvisioner.js
│   ├── accountAssignmentProvisioner.js
│   ├── emailProvisioner.js
│   └── provisionOrchestrator.js
├── routes/
│   └── provision.routes.js
├── schedulers/
│   └── catalogScheduler.js  # Nightly incremental pricing sync
├── services/
│   ├── provisioningService.js
│   ├── provisionStatusService.js
│   └── progressTracker.js
└── utils/
    ├── retry.js
    └── polling.js
```

## Provisioning flow

```
Route → ProvisionService → Orchestrator → Provisioners → DB progress updates
```

Provisioning runs asynchronously in-process via `setImmediate` (no external queue).

1. **Account** — Resolve `MASTER_ACCOUNT_ID` (existing org account, like Azure uses an existing subscription)
2. **SCP** — Create and attach service-control policy to the lab account based on selected services
3. **Users** — Create Identity Center users (`accountCount`)
4. **Permission sets** — Create SSO permission set(s), attach managed policies from request
5. **Assignments** — Map users → permission set → lab account
6. **Email** — Send credentials via Resend (or console fallback if unset)

On failure: status → `Failed`, rollback attempted (assignments, permission sets, users, SCP). The lab account itself is never closed.

### Costing modes

| Mode | AWS account | Identity Center users | Assignments |
|------|-------------|----------------------|-------------|
| **shared** | 1 shared lab account (`MASTER_ACCOUNT_ID`) | N users in same account | All users → same permission set / account |
| **per_user** | Same shared lab account | N users (+userN email aliases) | Each user → dedicated permission set on same account |

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/provision/request/:id/start` | Start provisioning (202, non-blocking) |
| GET | `/api/provision/request/:id/status` | Status, progress, steps, logs |
| POST | `/api/provision/request/:id/retry` | Retry failed request |

Gateway prefix: `/api/v1/cloud-automation-aws/provision/request/:id/...`

## Environment variables

```env
# Existing
PORT=3003
MONGODB_URI=
MONGODB_DB_NAME=
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SSO_INSTANCE_ARN=
AWS_SSO_IDENTITY_STORE_ID=
AWS_SSO_REGION=
MASTER_ACCOUNT_ID=

# Provisioning
AWS_LABS_OU_ID=
AWS_SANDBOX_OU_ID=
AWS_PRODUCTION_OU_ID=
AWS_DEFAULT_OU=Labs
AWS_ORGANIZATION_ROOT_ID=
AWS_IDENTITY_CENTER_START_URL=
ACCOUNT_CREATION_TIMEOUT_MS=1200000
ACCOUNT_CREATION_POLL_MS=15000
ACCOUNT_CREATION_MAX_RETRIES=5

# Transactional email provider (enable exactly one)
RESEND_EMAIL_ENABLED=false
ZOHO_EMAIL_ENABLED=true

# Resend
RESEND_API_KEY=

# Zoho ZeptoMail
ZOHO_ZEPTOMAIL_TOKEN=
ZOHO_ZEPTOMAIL_API_URL=https://api.zeptomail.in/v1.1/email

# Shared verified sender identity
EMAIL_FROM_ADDRESS=info@racko.ai
EMAIL_FROM_NAME=Racko
CLIENT_PORTAL_URL=http://localhost:3000
PROVISION_ACCESS_TOKEN_SECRET=

# Scheduler
ENABLE_CATALOG_SCHEDULER=true
CATALOG_SYNC_CRON=0 2 * * *
```

## Setup

```bash
cd cloud_automation_aws
npm install
npm run migrate
npm run dev
```

Trigger pricing sync (existing):

```bash
node testsync.mjs
```

Run tests:

```bash
npm test
```

## Frontend

- `client-portal/cloud_automation_aws/hooks/useProvisionStatus.ts` — polls status every 5s
- `client-portal/app/console/aws/requests/[id]/page.jsx` — step UI + retry button
- Auto-starts provisioning when request status is `Pending`

## Notes

- Provisioning uses the existing `MASTER_ACCOUNT_ID` lab account and IAM Identity Center users (same model as Azure AD users in a shared subscription).
- Ensure `MASTER_ACCOUNT_ID`, `AWS_SSO_INSTANCE_ARN`, `AWS_SSO_IDENTITY_STORE_ID`, and `AWS_SSO_REGION` are set before starting provisioning. Identity Center is regional — `AWS_SSO_REGION` must match the region where IAM Identity Center is enabled (check the console URL or run `aws sso-admin list-instances --region <region>`).
- Without Resend env vars, credentials are logged to the service console.
- Existing catalog/pricing/request code is unchanged.
