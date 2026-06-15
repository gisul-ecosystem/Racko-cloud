'use client';

import { Lock, Shield } from 'lucide-react';

export function ManageUsersSecurityNotes() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-[#B91C1C]" />
        <h3 className="text-sm font-semibold text-gray-900">Security Notes</h3>
      </div>
      <ul className="space-y-2 text-sm text-gray-600">
        <li className="flex gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          Email links are one-time and expire after use or when the session ends.
        </li>
        <li className="flex gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          Portal sessions are short-lived and cleared when you close the browser tab.
        </li>
        <li className="flex gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          Role changes and deletions are audited and applied in Azure immediately.
        </li>
      </ul>
    </div>
  );
}
