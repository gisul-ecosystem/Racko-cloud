'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { formatRolesForInput, parseRolesInput } from '../../api/managePortalClient';
import type { ManagePortalUser } from '../../types/managePortal';

const textareaClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-1 focus:ring-[var(--cloud-accent,#B91C1C)]';

interface ManageUserEditorProps {
  user: ManagePortalUser | null;
  saving: boolean;
  onSaveRoles: (userId: number, roles: string[]) => Promise<boolean>;
  onDelete: (userId: number) => Promise<boolean>;
}

export function ManageUserEditor({ user, saving, onSaveRoles, onDelete }: ManageUserEditorProps) {
  const [rolesInput, setRolesInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setRolesInput(user ? formatRolesForInput(user.roles) : '');
    setLocalError(null);
  }, [user]);

  if (!user) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-900">No user selected</p>
        <p className="mt-1 max-w-xs text-sm text-gray-500">
          Choose a user from the table to review roles or revoke access.
        </p>
      </div>
    );
  }

  const selectedUser = user;

  async function handleSave() {
    const roles = parseRolesInput(rolesInput);
    if (roles.length === 0) {
      setLocalError('Enter at least one role. Separate multiple roles with commas or new lines.');
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
      </div>

      <div className="space-y-5 p-5">
        {localError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {localError}
          </div>
        )}

        <div>
          <label htmlFor="roles-input" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Assigned Roles
          </label>
          <textarea
            id="roles-input"
            rows={6}
            value={rolesInput}
            onChange={(event) => setRolesInput(event.target.value)}
            disabled={saving}
            className={textareaClass}
            placeholder={'Contributor\nReader\nStorage Blob Data Contributor'}
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Enter one role per line or separate with commas. Saving replaces all current assignments.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[color-mix(in_srgb,var(--cloud-accent,#B91C1C)_88%,black)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Roles
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete User
          </button>
        </div>
      </div>
    </div>
  );
}
