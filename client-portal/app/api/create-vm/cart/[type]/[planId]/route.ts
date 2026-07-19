import { NextResponse } from 'next/server';
import {
  isAllowedCatalogType,
  proxyCreateVmAgent,
} from '../../../../../../lib/createVmAgentProxy';

export async function GET(
  request: Request,
  context: { params: { type: string; planId: string } }
) {
  const { type, planId } = context.params;
  const normalized = String(type || '').toLowerCase();
  if (!isAllowedCatalogType(normalized)) {
    return NextResponse.json(
      { error: 'Invalid category. Use linux, windows, or gpu.' },
      { status: 400 }
    );
  }
  if (!planId) {
    return NextResponse.json({ error: 'planId is required' }, { status: 400 });
  }

  const incoming = new URL(request.url).searchParams;
  const qs = new URLSearchParams();
  const billing = incoming.get('billing');
  const quantity = incoming.get('quantity');
  if (billing) qs.set('billing', billing);
  if (quantity) qs.set('quantity', quantity);
  qs.set('t', String(Date.now()));

  return proxyCreateVmAgent(
    `/api/cart/${encodeURIComponent(normalized)}/${encodeURIComponent(planId)}`,
    qs,
    { authorizationHeader: request.headers.get('authorization') }
  );
}
