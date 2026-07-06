'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  assignOrgCustomRole,
  createOrgCustomRole,
  deleteOrgCustomRole,
  listOrgCustomRoleAssignments,
  listOrgCustomRoles,
  revokeOrgCustomRoleAssignment,
} from '../../api/orgAdminClient';
import type {
  OrgAdminCustomRoleAssignment,
  OrgAdminCustomRoleDefinition,
  OrgAdminUser,
} from '../../types/orgAdmin';

const PERMISSION_PRESETS = [
  {
    label: 'ReadOnly + Storage Write',
    permissions: [
      'Microsoft.Storage/storageAccounts/read',
      'Microsoft.Storage/storageAccounts/blobServices/containers/read',
      'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write',
      'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read',
      'Microsoft.Resources/subscriptions/resourceGroups/read',
    ],
  },
  {
    label: 'VM Start/Stop Only',
    permissions: [
      'Microsoft.Compute/virtualMachines/start/action',
      'Microsoft.Compute/virtualMachines/deallocate/action',
      'Microsoft.Compute/virtualMachines/restart/action',
      'Microsoft.Compute/virtualMachines/read',
      'Microsoft.Resources/subscriptions/resourceGroups/read',
    ],
  },
  {
    label: 'SQL Read + Write',
    permissions: [
      'Microsoft.Sql/servers/read',
      'Microsoft.Sql/servers/databases/read',
      'Microsoft.Sql/servers/databases/write',
      'Microsoft.Resources/subscriptions/resourceGroups/read',
    ],
  },
  {
    label: 'Key Vault Read Only',
    permissions: [
      'Microsoft.KeyVault/vaults/read',
      'Microsoft.KeyVault/vaults/secrets/read',
      'Microsoft.Resources/subscriptions/resourceGroups/read',
    ],
  },
  {
    label: 'Network Read Only',
    permissions: [
      'Microsoft.Network/*/read',
      'Microsoft.Resources/subscriptions/resourceGroups/read',
    ],
  },
];

interface CustomRolesTabProps {
  requestId: number;
  users: OrgAdminUser[];
}

type BannerState = { type: 'success' | 'error'; message: string } | null;

function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [];
}

export function CustomRolesTab({ requestId, users }: CustomRolesTabProps) {
  const [roleDefinitions, setRoleDefinitions] = useState<OrgAdminCustomRoleDefinition[]>([]);
  const [assignments, setAssignments] = useState<OrgAdminCustomRoleAssignment[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRoleDef, setSelectedRoleDef] = useState('');
  const [customPermissions, setCustomPermissions] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  const loadData = useCallback(async () => {
    try {
      const [roles, assignList] = await Promise.all([
        listOrgCustomRoles(),
        listOrgCustomRoleAssignments(requestId),
      ]);
      setRoleDefinitions(roles);
      setAssignments(assignList);
    } catch (error) {
      console.error('Failed to load custom roles:', error);
    }
  }, [requestId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    window.setTimeout(() => setBanner(null), 4000);
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      showBanner('error', 'Role name is required');
      return;
    }

    const perms = newRolePerms
      .split('\n')
      .map((permission) => permission.trim())
      .filter(Boolean);

    if (perms.length === 0) {
      showBanner('error', 'At least one permission is required');
      return;
    }

    setLoading(true);
    try {
      await createOrgCustomRole({
        name: newRoleName,
        description: newRoleDesc,
        permissions: perms,
      });
      showBanner('success', `Custom role "${newRoleName}" created`);
      setShowCreateForm(false);
      setNewRoleName('');
      setNewRoleDesc('');
      setNewRolePerms('');
      await loadData();
    } catch (error) {
      showBanner('error', error instanceof Error ? error.message : 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser) {
      showBanner('error', 'Select a user');
      return;
    }

    if (!selectedRoleDef && !customPermissions.trim()) {
      showBanner('error', 'Select a role or enter custom permissions');
      return;
    }

    const user = users.find((entry) => entry.azureUserId === selectedUser);
    if (!user?.azureUserId) {
      showBanner('error', 'User not found');
      return;
    }

    setLoading(true);
    try {
      const permissions = selectedRoleDef
        ? null
        : customPermissions
            .split('\n')
            .map((permission) => permission.trim())
            .filter(Boolean);

      await assignOrgCustomRole(requestId, user.azureUserId, {
        customRoleDefId: selectedRoleDef ? Number(selectedRoleDef) : null,
        permissions,
        resourceGroupName: user.resourceGroup || `RG-CUST-${requestId}`,
        username: user.username,
      });

      showBanner('success', `Custom role assigned to ${user.username}`);
      setShowAssignForm(false);
      setSelectedUser('');
      setSelectedRoleDef('');
      setCustomPermissions('');
      await loadData();
    } catch (error) {
      showBanner('error', error instanceof Error ? error.message : 'Failed to assign role');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAssignment = async (assignmentId: number, username: string) => {
    if (!window.confirm(`Revoke custom role from ${username}?`)) return;

    try {
      await revokeOrgCustomRoleAssignment(assignmentId);
      showBanner('success', `Custom role revoked from ${username}`);
      await loadData();
    } catch (error) {
      showBanner('error', error instanceof Error ? error.message : 'Failed to revoke role');
    }
  };

  const handlePresetSelect = (presetLabel: string) => {
    const preset = PERMISSION_PRESETS.find((entry) => entry.label === presetLabel);
    if (preset) {
      setNewRolePerms(preset.permissions.join('\n'));
      setSelectedPreset(presetLabel);
    }
  };

  const selectedRolePermissions = roleDefinitions.find(
    (role) => String(role.id) === selectedRoleDef
  )?.permissions;

  return (
    <div className="space-y-5 px-6 py-5">
      {banner && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900">Custom RBAC Roles</h3>
          <p className="mt-1 text-sm text-gray-500">
            Define custom Azure RBAC roles with specific permissions and assign them to lab users.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            + Define Role
          </button>
          <button
            type="button"
            onClick={() => setShowAssignForm((value) => !value)}
            className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
          >
            Assign Role to User
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">Define New Custom Role</h4>

          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Role name *
              </label>
              <input
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder="e.g. ReadOnly + Storage Write"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Description
              </label>
              <input
                value={newRoleDesc}
                onChange={(event) => setNewRoleDesc(event.target.value)}
                placeholder="What this role allows..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Permission presets
            </label>
            <div className="flex flex-wrap gap-2">
              {PERMISSION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetSelect(preset.label)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    selectedPreset === preset.label
                      ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Permissions * (one per line)
            </label>
            <textarea
              value={newRolePerms}
              onChange={(event) => {
                setNewRolePerms(event.target.value);
                setSelectedPreset('');
              }}
              placeholder={`Microsoft.Storage/storageAccounts/read\nMicrosoft.Storage/storageAccounts/blobServices/containers/blobs/write\nMicrosoft.Resources/subscriptions/resourceGroups/read`}
              rows={6}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
            />
            <p className="mt-1 text-xs text-gray-500">
              Use Azure permission format: Microsoft.{'{'}Provider{'}'}/{'{'}resource{'}'}/{'{'}action{'}'}.
              Use * as wildcard. Prefix with ! to deny.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreateRole}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Creating...' : 'Create Role'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAssignForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">Assign Custom Role to User</h4>

          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Select user *
              </label>
              <select
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">Choose user...</option>
                {users
                  .filter((user) => user.azureUserId)
                  .map((user) => (
                    <option key={user.azureUserId!} value={user.azureUserId!}>
                      {user.username}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Use saved role definition
              </label>
              <select
                value={selectedRoleDef}
                onChange={(event) => {
                  setSelectedRoleDef(event.target.value);
                  setCustomPermissions('');
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">Or enter custom permissions below...</option>
                {roleDefinitions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!selectedRoleDef && (
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Or enter custom permissions (one per line)
              </label>
              <textarea
                value={customPermissions}
                onChange={(event) => setCustomPermissions(event.target.value)}
                placeholder={`Microsoft.Storage/*/read\nMicrosoft.Storage/storageAccounts/blobServices/containers/blobs/write`}
                rows={4}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
              />
            </div>
          )}

          {selectedRoleDef && selectedRolePermissions && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Role permissions preview
              </div>
              {parsePermissions(selectedRolePermissions).map((permission) => (
                <div
                  key={permission}
                  className="border-b border-gray-100 py-1 font-mono text-[11px] text-gray-700 last:border-0"
                >
                  ✓ {permission}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAssignRole}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Assigning...' : 'Assign Role'}
            </button>
            <button
              type="button"
              onClick={() => setShowAssignForm(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {roleDefinitions.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Saved role definitions ({roleDefinitions.length})
          </h4>
          <div className="space-y-2">
            {roleDefinitions.map((role) => (
              <div
                key={role.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-900">{role.name}</div>
                  {role.description && (
                    <div className="mt-1 text-xs text-gray-500">{role.description}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {parsePermissions(role.permissions).map((permission) => (
                      <span
                        key={permission}
                        className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-700"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Delete role "${role.name}"?`)) return;
                    await deleteOrgCustomRole(role.id);
                    await loadData();
                  }}
                  className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-[#B91C1C]"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Active custom role assignments for this request ({assignments.length})
        </h4>

        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
            <div className="mb-2 text-2xl">🔐</div>
            No custom roles assigned yet. Click &quot;Assign Role to User&quot; to get started.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['User', 'Role name', 'Permissions', 'Assigned', 'Actions'].map((header) => (
                    <th
                      key={header}
                      className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const permissions = parsePermissions(assignment.permissions);
                  return (
                    <tr key={assignment.id} className="border-t border-gray-100">
                      <td className="px-3 py-3 font-semibold text-gray-900">{assignment.username}</td>
                      <td className="px-3 py-3">
                        <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-[#B91C1C]">
                          {assignment.custom_role_name}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {permissions.slice(0, 3).map((permission) => (
                            <span
                              key={permission}
                              className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-700"
                            >
                              {permission}
                            </span>
                          ))}
                          {permissions.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{permissions.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {new Date(assignment.assigned_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleRevokeAssignment(assignment.id, assignment.username)
                          }
                          className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-[#B91C1C]"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
