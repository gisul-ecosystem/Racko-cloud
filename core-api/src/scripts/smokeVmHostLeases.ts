/**
 * Smoke test for /api/v1/vm-host-leases — run with core-api up.
 * Does not print secrets.
 */
import 'dotenv/config';
import * as XLSX from 'xlsx';
import { config } from '../config';

const BASE = `http://127.0.0.1:${config.PORT}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function jsonFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, body };
}

async function main() {
  console.log('1) Health check...');
  const health = await fetch(`${BASE}/health`);
  assert(health.ok, `Health failed: ${health.status}`);
  console.log('   OK');

  console.log('2) Login as super_admin...');
  const login = await jsonFetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.SUPER_ADMIN_EMAIL,
      password: config.SUPER_ADMIN_PASSWORD,
    }),
  });
  assert(login.res.ok, `Login failed: ${login.res.status} ${JSON.stringify(login.body)}`);
  const data = login.body.data as { accessToken?: string };
  const token = data?.accessToken;
  assert(token, 'No accessToken in login response');
  console.log('   OK (token received)');

  const auth = { Authorization: `Bearer ${token}` };

  console.log('3) Create single lease...');
  const invoiceDate = new Date();
  invoiceDate.setUTCDate(invoiceDate.getUTCDate() - 5);
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + 3);

  const created = await jsonFetch('/api/v1/vm-host-leases', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'AWS',
      ipAddress: '203.0.113.10',
      description: 'Production Server',
      invoiceDate: invoiceDate.toISOString(),
      dueDate: dueDate.toISOString(),
      assignedTo: 'smoke-admin',
      vmUsername: 'smoke-user',
      vmPassword: 'smoke-pass',
    }),
  });
  assert(created.res.status === 201, `Create failed: ${created.res.status} ${JSON.stringify(created.body)}`);
  const createdLease = (created.body.data as { lease: { id: string; ipAddress: string } }).lease;
  assert(createdLease?.id, 'Missing created lease id');
  console.log(`   OK id=${createdLease.id} ip=${createdLease.ipAddress}`);

  console.log('4) List leases...');
  const listed = await jsonFetch('/api/v1/vm-host-leases?search=203.0.113.10', {
    headers: auth,
  });
  assert(listed.res.ok, `List failed: ${listed.res.status} ${JSON.stringify(listed.body)}`);
  const listData = listed.body.data as { total: number; leases: unknown[] };
  assert(listData.total >= 1, 'Expected at least 1 lease in list');
  console.log(`   OK total=${listData.total}`);

  console.log('5) Excel upload...');
  const wb = XLSX.utils.book_new();
  const rows = [
    ['Provider', 'IP Address', 'Description', 'Invoice Date', 'Due Date', 'Assigned To', 'VM Username', 'VM Password'],
    ['Azure', '203.0.113.20', 'Test Server', '2026-08-01', '2026-08-10', 'test-admin', 'excel-user', 'excel-pass'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Leases');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'smoke-leases.xlsx');

  const uploadRes = await fetch(`${BASE}/api/v1/vm-host-leases/upload`, {
    method: 'POST',
    headers: auth,
    body: form,
  });
  const uploadBody = (await uploadRes.json()) as Record<string, unknown>;
  assert(uploadRes.status === 201, `Upload failed: ${uploadRes.status} ${JSON.stringify(uploadBody)}`);
  const uploadData = uploadBody.data as { imported: number };
  assert(uploadData.imported === 1, `Expected imported=1 got ${uploadData.imported}`);
  console.log(`   OK imported=${uploadData.imported}`);

  console.log('6) Get + delete created lease...');
  const got = await jsonFetch(`/api/v1/vm-host-leases/${createdLease.id}`, { headers: auth });
  assert(got.res.ok, `Get failed: ${got.res.status}`);
  const del = await jsonFetch(`/api/v1/vm-host-leases/${createdLease.id}`, {
    method: 'DELETE',
    headers: auth,
  });
  assert(del.res.ok, `Delete failed: ${del.res.status}`);
  console.log('   OK');

  console.log('7) Unauthenticated should 401...');
  const unauth = await fetch(`${BASE}/api/v1/vm-host-leases`);
  assert(unauth.status === 401, `Expected 401 got ${unauth.status}`);
  console.log('   OK');

  console.log('\nALL SMOKE TESTS PASSED');
}

main().catch((err) => {
  console.error('\nSMOKE TEST FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
