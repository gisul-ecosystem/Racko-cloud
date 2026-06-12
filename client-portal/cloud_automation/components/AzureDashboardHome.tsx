'use client';

import { Cloud } from 'lucide-react';
import { AZURE_SERVICE } from '../constants';

export function AzureDashboardHome() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{AZURE_SERVICE.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{AZURE_SERVICE.description}</p>
      </div>

      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Cloud className="h-7 w-7" />
        </div>
        <p className="text-base font-medium text-gray-900">Azure dashboard</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Provisioning, requests, and lab management will appear here. Use the sidebar as features
          are added.
        </p>
      </div>
    </div>
  );
}
