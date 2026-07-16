# Create VM Catalog Agent (VM only)

Standalone HTTP service that scrapes provider catalog pricing and cart details.
**Deploy and run this folder on the dedicated VM** — not inside the Racko web app.

Racko `client-portal` calls this over HTTP via `CREATE_VM_AGENT_URL` (server-side only).

## Contents (all required on the VM)

| Path | Role |
|------|------|
| `server.js` | Express API |
| `lib/catalog-session.js` | Playwright login + scrape |
| `package.json` / `package-lock.json` | Dependencies |
| `.env` | `PORT`, provider credentials (from `.env.example`) |

## Setup on the VM

```bash
cd create-vm-catalog-agent
cp .env.example .env
# edit .env — set WEBYNE_EMAIL / WEBYNE_PASSWORD
npm install
npx playwright install msedge   # or: npx playwright install chromium
npm start
```

Listens on `0.0.0.0:3789` by default.

## API contract (consumed by Racko)

- `GET /api/health`
- `GET /api/pricing/:type` — `linux` | `windows` | `gpu`
- `GET /api/cart/:type/:planId?billing=&quantity=`
- `GET /api/cart/:type/:planId/buy-preview?billing=&quantity=&template=`

## Firewall

Allow the Racko app host to reach `TCP 3789` on this VM.
