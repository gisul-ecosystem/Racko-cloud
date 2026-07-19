import { NextResponse } from 'next/server';
import {
  isAllowedCatalogType,
  proxyCreateVmAgent,
} from '../../../../../lib/createVmAgentProxy';

export async function GET(
  request: Request,
  context: { params: { type: string } }
) {
  const normalized = String(context.params.type || '').toLowerCase();
  if (!isAllowedCatalogType(normalized)) {
    return NextResponse.json(
      { error: 'Invalid category. Use linux, windows, or gpu.' },
      { status: 400 }
    );
  }
  const raw = new URL(request.url).searchParams.get('raw') === '1';
  return proxyCreateVmAgent(
    `/api/pricing/${encodeURIComponent(normalized)}`,
    undefined,
    {
      applyOverrides: !raw,
      authorizationHeader: request.headers.get('authorization'),
    }
  );
}
