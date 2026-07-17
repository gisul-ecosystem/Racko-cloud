# Cloud Automation Reseller API

Internal API for dynamic AWS/Azure pricing, provider selection, VM provisioning, and termination.

## Base URL

```text
http://127.0.0.1:3005
```

In Docker, `core-api` uses:

```text
http://cloud-automation-reseller:3005
```

## Authentication

`GET /health` is public. Every `/api/*` endpoint requires:

```http
Content-Type: application/json
X-Internal-Secret: <INTERNAL_SERVICE_SECRET>
```

The secret must match the reseller service and `core-api`.

## Standard response

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Canonical specs

A canonical spec is the normalized pricing and provisioning key:

```text
{cpu}vcpu-{ram}gb-{disk}gbssd
```

Examples:

```text
2vcpu-8gb-50gbssd
16vcpu-64gb-400gbssd
4vcpu-16gb-100gbssd-gpu
```

Instead of `canonicalSpec`, `/api/select` can receive:

```json
{
  "specs": {
    "cpu": "16",
    "ram": "64",
    "disk": "400"
  }
}
```

If both are supplied, `canonicalSpec` takes precedence.

Unknown specs are resolved dynamically:

1. Parse requested vCPU, RAM, and disk.
2. Find a matching AWS instance type and Azure VM size.
3. Fetch live compute pricing for configured regions.
4. Add estimated public-IP and disk costs.
5. Store the rows in MongoDB.
6. Return the row with the lowest `rawTotalPricePerHr`.

## 1. Health check

### `GET /health`

Checks whether the service is running. No authentication or request body.

Example response:

```json
{
  "ok": true,
  "service": "cloud-automation-reseller",
  "providers": ["aws", "azure"]
}
```

## 2. Select cheapest provider and region

### `POST /api/select`

For durations below 30 days, returns the cheapest matching AWS/Azure provider and region.

For durations of 30 days or more, returns Webyne for manual fulfillment.

If the exact spec has no cached prices, the service resolves cloud SKUs and fetches prices dynamically. It does not substitute a smaller unrelated VM.

Request using a canonical spec:

```json
{
  "canonicalSpec": "16vcpu-64gb-400gbssd",
  "category": "linux",
  "durationDays": 1
}
```

Request using individual specs:

```json
{
  "category": "linux",
  "durationDays": 1,
  "specs": {
    "cpu": "16",
    "ram": "64",
    "disk": "400"
  }
}
```

Fields:

- `canonicalSpec`: optional when `specs` is supplied.
- `specs`: optional when `canonicalSpec` is supplied.
- `category`: `linux`, `windows`, or `gpu`.
- `durationDays`: number of service days.

Cached-price response:

```json
{
  "success": true,
  "data": {
    "provider": "azure",
    "region": "eastus",
    "category": "linux",
    "canonicalSpec": "2vcpu-8gb-50gbssd",
    "rawComputePricePerHr": 0.019,
    "rawStoragePricePerHr": 0.008219178,
    "rawIpPricePerHr": 0.004,
    "rawTotalPricePerHr": 0.031219178,
    "instanceType": "Standard_D2s_v3",
    "currency": "USD",
    "autoProvisioned": true,
    "reason": "cheapest_cloud",
    "fetchedAt": "2026-07-17T05:49:23.312Z"
  }
}
```

The first request for a new spec may return:

```json
{
  "reason": "cheapest_cloud_dynamic",
  "resolvedSkus": {
    "aws": "m5.4xlarge",
    "azure": "Standard_D16s_v3"
  }
}
```

Thirty-day response:

```json
{
  "success": true,
  "data": {
    "provider": "webyne",
    "region": null,
    "category": "linux",
    "canonicalSpec": "2vcpu-8gb-50gbssd",
    "rawTotalPricePerHr": null,
    "autoProvisioned": false,
    "reason": "duration_gte_30_days"
  }
}
```

Possible reasons:

- `cheapest_cloud`: selected from cached exact-spec prices.
- `cheapest_cloud_dynamic`: dynamically resolved and priced the exact spec.
- `duration_gte_30_days`: Webyne manual route.
- `no_cloud_pricing_for_spec`: no AWS/Azure price was available for the requested spec.

## 3. Provision a VM

### `POST /api/provision`

Creates a real, billable cloud VM. Normally `core-api` calls this after `/api/select`.

AWS request:

```json
{
  "provider": "aws",
  "region": "ap-south-1",
  "category": "linux",
  "canonicalSpec": "2vcpu-8gb-50gbssd",
  "catalogVmId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

Azure request:

```json
{
  "provider": "azure",
  "region": "centralindia",
  "category": "windows",
  "canonicalSpec": "4vcpu-16gb-100gbssd",
  "catalogVmId": "665f1a2b3c4d5e6f7a8b9c0d"
}
```

Fields:

- `provider`: required; `aws` or `azure`.
- `canonicalSpec`: required.
- `region`: recommended; use the value returned by `/api/select`.
- `category`: `linux`, `windows`, or `gpu`; defaults to `linux`.
- `catalogVmId`: recommended for cloud naming and tags.

Example response:

```json
{
  "success": true,
  "data": {
    "provider": "azure",
    "providerInstanceId": "racko-resource-group/rvm665f1a2b",
    "region": "centralindia",
    "ip": "203.0.113.10",
    "hostname": "203.0.113.10",
    "username": "rackoadmin",
    "password": "<generated-password>",
    "protocol": "rdp"
  }
}
```

Security note: credentials must only be passed to `core-api` and stored encrypted. Do not log or expose the response publicly.

## 4. Terminate a VM

### `POST /api/terminate`

Terminates the cloud VM identified by `providerInstanceId`.

AWS request:

```json
{
  "provider": "aws",
  "region": "ap-south-1",
  "providerInstanceId": "i-0abc123def4567890"
}
```

Azure request:

```json
{
  "provider": "azure",
  "region": "centralindia",
  "providerInstanceId": "racko-resource-group/rvm665f1a2b"
}
```

Fields:

- `provider`: required; `aws` or `azure`.
- `providerInstanceId`: required.
- `region`: required in practice for AWS; retained for provider routing.

Example response:

```json
{
  "success": true,
  "data": {
    "provider": "aws",
    "providerInstanceId": "i-0abc123def4567890",
    "terminated": true
  }
}
```

## 5. Synchronize configured pricing

### `POST /api/pricing/sync`

Refreshes prices for all common/static spec mappings across configured AWS and Azure regions.

Dynamic specs are fetched on demand through `/api/select`; this endpoint primarily refreshes common configured specs.

Request body:

```json
{}
```

Example response:

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "provider": "aws",
        "written": 39,
        "errors": [],
        "errorCount": 0
      },
      {
        "provider": "azure",
        "written": 52,
        "errors": [],
        "errorCount": 0
      }
    ]
  }
}
```

The scheduler also runs this sync at startup and according to `PRICING_SYNC_CRON`.

## 6. List stored pricing

### `GET /api/pricing`

Returns stored pricing rows ordered by `rawTotalPricePerHr` ascending.

No request body. Supported query parameters:

- `provider`: `aws` or `azure`.
- `category`: `linux`, `windows`, or `gpu`.
- `canonicalSpec`: exact canonical spec.
- `limit`: defaults to 100; maximum 500.

Example:

```text
GET /api/pricing?canonicalSpec=2vcpu-8gb-50gbssd&category=linux&limit=20
```

Example response:

```json
{
  "success": true,
  "data": {
    "rows": [
      {
        "provider": "azure",
        "region": "eastus",
        "category": "linux",
        "canonicalSpec": "2vcpu-8gb-50gbssd",
        "instanceType": "Standard_D2s_v3",
        "rawComputePricePerHr": 0.019,
        "rawStoragePricePerHr": 0.008219178,
        "rawIpPricePerHr": 0.004,
        "rawTotalPricePerHr": 0.031219178,
        "currency": "USD",
        "source": "api"
      }
    ],
    "total": 1
  }
}
```

## Cost calculation

Internal selection compares:

```text
rawTotalPricePerHr =
  rawComputePricePerHr +
  rawStoragePricePerHr +
  rawIpPricePerHr
```

Compute prices come from AWS Price List and Azure Retail Prices APIs. Disk and public-IP costs are currently hourly estimates. `core-api` applies the customer markup separately.

## Safe testing order

1. `GET /health`
2. `POST /api/pricing/sync`
3. `GET /api/pricing`
4. `POST /api/select`
5. `POST /api/provision` only when intentionally creating a billable VM
6. `POST /api/terminate` immediately after provisioning tests
