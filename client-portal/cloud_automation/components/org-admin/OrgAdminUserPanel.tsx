'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { formatRolesForInput, parseRolesInput } from '../../api/orgAdminClient';
import type { OrgAdminUser } from '../../types/orgAdmin';

const textareaClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]';

interface OrgAdminUserPanelProps {
  user: OrgAdminUser | null;
  saving: boolean;
  onSaveRoles: (userId: number, roles: string[]) => Promise<boolean>;
  onDelete: (userId: number) => Promise<boolean>;
}

export function OrgAdminUserPanel({ user, saving, onSaveRoles, onDelete }: OrgAdminUserPanelProps) {
  const [rolesInput, setRolesInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setRolesInput(user ? formatRolesForInput(user.roles) : '');
    setLocalError(null);
  }, [user]);

  if (!user) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-900">No user selected</p>
        <p className="mt-1 max-w-xs text-sm text-gray-500">
          Select a user to edit roles or revoke access.
        </p>
      </div>
    );
  }

  const selectedUser = user;

  async function handleSave() {
    const roles = parseRolesInput(rolesInput);
    if (roles.length === 0) {
      setLocalError('Enter at least one role.');
      return;
    }

    setLocalError(null);
    const ok = await onSaveRoles(selectedUser.id, roles);
    if (ok) {
      setRolesInput(roles.join('\n'));
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete user "${selectedUser.username}"? This removes their Azure account and RBAC assignments.`
      )
    ) {
      return;
    }

    await onDelete(selectedUser.id);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">User Actions</h2>
        <p className="mt-0.5 text-xs text-gray-500">{selectedUser.username}</p>
        {selectedUser.resourceGroup && (
          <p className="mt-1 truncate font-mono text-[11px] text-violet-700">
            {selectedUser.resourceGroup}
          </p>
        )}
      </div>

      <div className="space-y-5 p-5">
        {localError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {localError}
          </div>
        )}

        <div>
          <label
            htmlFor="org-admin-roles"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500"
          >
            Assigned Roles
          </label>
          <textarea
            id="org-admin-roles"
            rows={6}
            value={rolesInput}
            onChange={(event) => setRolesInput(event.target.value)}
            disabled={saving}
            className={textareaClass}
            placeholder={'Contributor\nReader'}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Roles
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete User
          </button>
        </div>
      </div>
    </div>
  );
}
