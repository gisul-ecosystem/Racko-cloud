/**
 * Phase 0 verification: tenant token for tenant A must be rejected when
 * x-tenant-id resolves to tenant B.
 *
 * Run: npx ts-node --transpile-only src/middleware/requireTenantAuth.test.ts
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import { config } from '../config';
import type { TenantTokenPayload } from '../modules/tenantAuth/tenantAuth.service';
import { requireTenantAuth } from './requireTenantAuth.middleware';
import type { TenantContextRequest } from './resolveTenantContext.middleware';

const TENANT_A = '665f00000000000000000001';
const TENANT_B = '665f00000000000000000002';

function signTenantToken(tenantId: string): string {
  const payload: TenantTokenPayload = {
    sub: '665f10000000000000000001',
    tenantId,
    role: 'tenant_admin',
    type: 'tenant',
  };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '15m' });
}

function mockRes(): Response {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response;
}

function runMiddleware(
  req: Partial<TenantContextRequest>,
  res: Response
): Promise<{ statusCode: number; body: unknown; nextCalled: boolean }> {
  return new Promise((resolve) => {
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    requireTenantAuth(req as TenantContextRequest, res, next);
    resolve({
      statusCode: (res as unknown as { statusCode: number }).statusCode,
      body: (res as unknown as { body: unknown }).body,
      nextCalled,
    });
  });
}

async function main(): Promise<void> {
  const tokenForA = signTenantToken(TENANT_A);

  // Match: token A + context A → pass
  const reqMatch = {
    headers: { authorization: `Bearer ${tokenForA}` },
    tenantContext: { id: TENANT_A, slug: 'a', status: 'active' },
  } as Partial<TenantContextRequest>;
  const resMatch = mockRes();
  const matchResult = await runMiddleware(reqMatch, resMatch);
  if (!matchResult.nextCalled || matchResult.statusCode !== 200) {
    console.error('FAIL: expected matching tenant to pass', matchResult);
    process.exit(1);
  }

  // Mismatch: token A + context B → TENANT_MISMATCH
  const reqMismatch = {
    headers: { authorization: `Bearer ${tokenForA}` },
    tenantContext: { id: TENANT_B, slug: 'b', status: 'active' },
  } as Partial<TenantContextRequest>;
  const resMismatch = mockRes();
  const mismatchResult = await runMiddleware(reqMismatch, resMismatch);
  const mismatchBody = mismatchResult.body as { message?: string };
  if (
    mismatchResult.nextCalled ||
    mismatchResult.statusCode !== 401 ||
    mismatchBody.message !== 'TENANT_MISMATCH'
  ) {
    console.error('FAIL: expected TENANT_MISMATCH', mismatchResult);
    process.exit(1);
  }

  // Missing context → TENANT_MISMATCH
  const reqNoCtx = {
    headers: { authorization: `Bearer ${tokenForA}` },
  } as Partial<TenantContextRequest>;
  const resNoCtx = mockRes();
  const noCtxResult = await runMiddleware(reqNoCtx, resNoCtx);
  const noCtxBody = noCtxResult.body as { message?: string };
  if (noCtxResult.nextCalled || noCtxBody.message !== 'TENANT_MISMATCH') {
    console.error('FAIL: expected TENANT_MISMATCH without context', noCtxResult);
    process.exit(1);
  }

  console.log('PASS: Phase 0 host-mismatch tenant auth checks');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
