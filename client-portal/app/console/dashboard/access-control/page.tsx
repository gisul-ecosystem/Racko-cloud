'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Shield, Trash2, Users } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { RoleWizard } from '@/components/access-control/RoleWizard';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';
import {
  createTenantRbacRole,
  deleteTenantOperator,
  fetchTenantRbacCatalog,
  fetchTenantRbacPeople,
  fetchTenantRbacRoles,
  inviteTenantOperator,
  setTenantRbacUserRoles,
  updateTenantRbacRole,
  emitTenantRbacChanged,
  type OrgRbacPermissionDef,
  type OrgRbacRole,
  type TenantRbacPerson,
} from '@/lib/tenantRbacApi';

type Tab = 'roles' | 'people';

export default function TenantAccessControlPage() {
  const router = useRouter();
  const { accentColor } = useTenantBranding();
  const { isLoading: authLoading, isAuthenticated } = useTenantAuth();
  const {
    loading: rbacLoading,
    isTenantAdmin,
    hasPermission,
    refresh: refreshRbac,
  } = useTenantRbac();
  const canAccessPage =
    isTenantAdmin || hasPermission('rbac.roles.write', 'rbac.assign');
  const canWriteRoles = isTenantAdmin || hasPermission('rbac.roles.write');
  const canAssign = isTenantAdmin || hasPermission('rbac.assign');

  const [tab, setTab] = useState<Tab>('roles');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<OrgRbacPermissionDef[]>([]);
  const [roles, setRoles] = useState<OrgRbacRole[]>([]);
  const [people, setPeople] = useState<TenantRbacPerson[]>([]);

  const [editingRole, setEditingRole] = useState<OrgRbacRole | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);

  const [assignPerson, setAssignPerson] = useState<TenantRbacPerson | null>(null);
  const [assignRoleIds, setAssignRoleIds] = useState<string[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleIds, setInviteRoleIds] = useState<string[]>([]);
  const [savingInvite, setSavingInvite] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TenantRbacPerson | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perms, roleList, peopleList] = await Promise.all([
        fetchTenantRbacCatalog(),
        fetchTenantRbacRoles(),
        fetchTenantRbacPeople(),
      ]);
      setCatalog(perms);
      setRoles(roleList);
      setPeople(peopleList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load access control.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (authLoading || rbacLoading) return;
    if (!isAuthenticated) {
      router.replace('/console/login');
      return;
    }
    if (!canAccessPage) {
      router.replace(TENANT_CONSOLE);
    }
  }, [authLoading, rbacLoading, isAuthenticated, canAccessPage, router]);

  function cancelRoleWizard() {
    setCreatingRole(false);
    setEditingRole(null);
    setRoleFormError(null);
  }

  async function saveRoleWizard(payload: {
    name: string;
    description: string;
    permissions: string[];
  }) {
    setSavingRole(true);
    setRoleFormError(null);
    setError(null);
    try {
      if (editingRole) {
        await updateTenantRbacRole(editingRole._id, {
          ...(editingRole.isSystem ? {} : { name: payload.name, description: payload.description }),
          permissions: payload.permissions,
        });
        setFlash('Role updated.');
      } else {
        await createTenantRbacRole({
          name: payload.name,
          description: payload.description,
          permissions: payload.permissions,
        });
        setFlash('Role created.');
      }
      cancelRoleWizard();
      await load();
      await refreshRbac();
      emitTenantRbacChanged();
    } catch (err) {
      setRoleFormError(err instanceof ApiError ? err.message : 'Failed to save role.');
    } finally {
      setSavingRole(false);
    }
  }

  async function saveAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignPerson) return;
    setSavingAssign(true);
    setError(null);
    try {
      await setTenantRbacUserRoles(assignPerson._id, assignRoleIds);
      setFlash(`Roles updated for ${assignPerson.email}.`);
      setAssignPerson(null);
      await load();
      await refreshRbac();
      emitTenantRbacChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign roles.');
    } finally {
      setSavingAssign(false);
    }
  }

  async function saveInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviteRoleIds.length === 0) {
      setError('Select at least one role for the operator.');
      return;
    }
    setSavingInvite(true);
    setError(null);
    try {
      await inviteTenantOperator({
        email: inviteEmail,
        roleIds: inviteRoleIds,
      });
      setFlash(
        `Operator invited: ${inviteEmail}. A temporary password was emailed — they must verify and set a password before signing in.`
      );
      setShowInvite(false);
      setInviteEmail('');
      setInviteRoleIds([]);
      await load();
      await refreshRbac();
      emitTenantRbacChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite operator.');
    } finally {
      setSavingInvite(false);
    }
  }

  async function confirmDeleteOperator() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget._id);
    setError(null);
    try {
      await deleteTenantOperator(deleteTarget._id);
      setFlash(`Deleted ${deleteTarget.email}.`);
      if (assignPerson?._id === deleteTarget._id) setAssignPerson(null);
      setDeleteTarget(null);
      await load();
      await refreshRbac();
      emitTenantRbacChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete operator.');
    } finally {
      setDeletingId(null);
    }
  }

  const showRoleForm = creatingRole || Boolean(editingRole);

  if (authLoading || rbacLoading || !isAuthenticated || !canAccessPage) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#B91C1C]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete operator ${deleteTarget.email}?` : 'Delete operator'}
        description="This removes their console access and cannot be undone. You can invite the same email again later."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={Boolean(deleteTarget && deletingId === deleteTarget._id)}
        onConfirm={() => void confirmDeleteOperator()}
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
      />
      <div>
        <Link
          href={TENANT_CONSOLE}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-4 w-4" /> Tenant console
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Access control</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Grant staff controlled access to the tenant console.
        </p>
      </div>

      {flash ? <p className="text-sm text-green-700">{flash}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['roles', 'Roles', Shield],
            ['people', 'People', Users],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              tab === id
                ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      ) : tab === 'roles' ? (
        <div className="space-y-4">
          {(canWriteRoles) && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setCreatingRole(true);
                  setEditingRole(null);
                  setRoleFormError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: accentColor }}
              >
                <Plus className="h-4 w-4" /> New role
              </button>
            </div>
          )}

          {showRoleForm ? (
            <RoleWizard
              key={editingRole?._id ?? 'new'}
              catalog={catalog}
              accentColor={accentColor}
              initial={{
                name: editingRole?.name ?? '',
                description: editingRole?.description ?? '',
                permissions: editingRole ? [...editingRole.permissions] : [],
                lockedMeta: Boolean(editingRole?.isSystem),
              }}
              saving={savingRole}
              error={roleFormError}
              onCancel={cancelRoleWizard}
              onSave={(payload) => void saveRoleWizard(payload)}
            />
          ) : null}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-5 py-3">Role</th>
                  <th className="px-4 py-3">Permissions</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role._id} className="border-b border-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{role.name}</p>
                      <p className="text-xs text-gray-500">{role.description || role.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{role.permissions.length}</td>
                    <td className="px-4 py-3 text-right">
                      {canWriteRoles ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRole(role);
                            setCreatingRole(false);
                            setRoleFormError(null);
                          }}
                          className="text-xs font-medium text-[#B91C1C] hover:underline"
                          style={{ color: accentColor }}
                        >
                          Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {canAssign ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" /> Invite operator
              </button>
            </div>
          ) : null}

          {showInvite ? (
            <form
              onSubmit={(e) => void saveInvite(e)}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Operator email"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500">
                An invite email is sent with a generated temporary password and verify link. After
                verifying, they set their own password before signing in.
              </p>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <label
                    key={role._id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={inviteRoleIds.includes(role._id)}
                      onChange={() =>
                        setInviteRoleIds((prev) =>
                          prev.includes(role._id)
                            ? prev.filter((id) => id !== role._id)
                            : [...prev, role._id]
                        )
                      }
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingInvite}
                  className="rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingInvite ? 'Inviting…' : 'Send invite'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {assignPerson ? (
            <form
              onSubmit={(e) => void saveAssign(e)}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-gray-900">
                Assign roles · {assignPerson.email}
              </p>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <label
                    key={role._id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={assignRoleIds.includes(role._id)}
                      onChange={() =>
                        setAssignRoleIds((prev) =>
                          prev.includes(role._id)
                            ? prev.filter((id) => id !== role._id)
                            : [...prev, role._id]
                        )
                      }
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingAssign}
                  className="rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingAssign ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setAssignPerson(null)}
                  className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-5 py-3">Person</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person._id} className="border-b border-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{person.email}</p>
                      <p className="text-xs text-gray-500">
                        {person.isTenantAdmin ? 'Tenant admin' : 'Operator'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {person.roleNames.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {person.isTenantAdmin ? (
                        <span className="text-xs text-gray-400">Full access</span>
                      ) : canAssign ? (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setAssignPerson(person);
                              setAssignRoleIds([...person.roleIds]);
                            }}
                            className="text-xs font-medium text-[#B91C1C] hover:underline"
                          >
                            Assign roles
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === person._id}
                            onClick={() => setDeleteTarget(person)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 disabled:opacity-50"
                          >
                            {deletingId === person._id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
