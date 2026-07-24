'use client';

import { Suspense } from 'react';
import PurchaseResponseInner from './PurchaseResponseInner';

export default function PurchaseResponsePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <PurchaseResponseInner />
    </Suspense>
  );
}
