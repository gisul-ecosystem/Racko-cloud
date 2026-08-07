'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Shield, Trash2, Users, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { RoleWizard } from '@/components/access-control/RoleWizard';
import {
  createRbacRole,
  createStaffUser,
  deleteStaffUser,
  fetchRbacPeople,
  fetchRbacPermissionCatalog,
  fetchRbacRoles,
  setRbacUserRoles,
  updateRbacRole,
  PROMOTE_EXISTING_USER_CODE,
  type RbacPermissionDef,
  type RbacPerson,
  type RbacRole,
} from '@/lib/rbacApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

type Tab = 'roles' | 'people';

export default function AccessControlPage() {
  const [tab, setTab] = useState<Tab>('roles');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<RbacPermissionDef[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [people, setPeople] = useState<RbacPerson[]>([]);

  const [editingRole, setEditingRole] = useState<RbacRole | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);

  const [assignPerson, setAssignPerson] = useState<RbacPerson | null>(null);
  const [assignRoleIds, setAssignRoleIds] = useState<string[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);

  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRoleIds, setStaffRoleIds] = useState<string[]>([]);
  const [savingStaff, setSavingStaff] = useState(false);
  const [promotePrompt, setPromotePrompt] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RbacPerson | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perms, roleList, peopleList] = await Promise.all([
        fetchRbacPermissionCatalog(),
        fetchRbacRoles(),
        fetchRbacPeople(),
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

  function startCreateRole() {
    setCreatingRole(true);
    setEditingRole(null);
    setRoleFormError(null);
    setFlash(null);
  }

  function startEditRole(role: RbacRole) {
    setEditingRole(role);
    setCreatingRole(false);
    setRoleFormError(null);
    setFlash(null);
  }

  function cancelRoleForm() {
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
    setFlash(null);
    try {
      if (editingRole) {
        await updateRbacRole(editingRole._id, {
          ...(editingRole.isSystem ? {} : { name: payload.name, description: payload.description }),
          permissions: payload.permissions,
        });
        setFlash('Role updated.');
      } else {
        await createRbacRole({
          name: payload.name,
          description: payload.description,
          permissions: payload.permissions,
        });
        setFlash('Role created.');
      }
      cancelRoleForm();
      await load();
    } catch (err) {
      setRoleFormError(err instanceof ApiError ? err.message : 'Failed to save role.');
    } finally {
      setSavingRole(false);
    }
  }

  function openAssign(person: RbacPerson) {
    if (person.role === 'super_admin') return;
    setAssignPerson(person);
    setAssignRoleIds([...person.roleIds]);
    setFlash(null);
  }

  async function saveAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignPerson) return;
    setSavingAssign(true);
    setError(null);
    try {
      await setRbacUserRoles(assignPerson._id, assignRoleIds);
      setFlash(`Roles updated for ${assignPerson.email}.`);
      setAssignPerson(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign roles.');
    } finally {
      setSavingAssign(false);
    }
  }

  async function confirmDeleteStaff() {
    if (!deleteTarget) return;
    const person = deleteTarget;
    setDeletingId(person._id);
    setError(null);
    setFlash(null);
    try {
      await deleteStaffUser(person._id);
      if (assignPerson?._id === person._id) setAssignPerson(null);
      setDeleteTarget(null);
      setFlash(`Deleted ${person.email}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete staff user.');
    } finally {
      setDeletingId(null);
    }
  }

  function resetStaffForm() {
    setShowCreateStaff(false);
    setStaffEmail('');
    setStaffRoleIds([]);
    setPromotePrompt(null);
  }

  async function submitStaff(promoteExisting: boolean) {
    setSavingStaff(true);
    setError(null);
    try {
      await createStaffUser({
        email: staffEmail,
        roleIds: staffRoleIds,
        ...(promoteExisting ? { promoteExisting: true } : {}),
      });
      setFlash(
        promoteExisting
          ? `${staffEmail} now has staff console access.`
          : 'Staff invite sent. A temporary password was emailed automatically.'
      );
      resetStaffForm();
      setTab('people');
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === PROMOTE_EXISTING_USER_CODE) {
        setPromotePrompt(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to send staff invite.');
      }
    } finally {
      setSavingStaff(false);
    }
  }

  async function saveStaff(e: React.FormEvent) {
    e.preventDefault();
    setPromotePrompt(null);
    await submitStaff(false);
  }

  const showRoleForm = creatingRole || Boolean(editingRole);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/super-admin-console"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-4 w-4" />
          Super Admin Console
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Access control</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Grant staff controlled access to the Super Admin dashboard.
        </p>
      </div>

      {flash ? <p className="text-sm text-green-700">{flash}</p> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

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
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === id
                ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
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
          <div className="flex justify-end">
            <button
              type="button"
              onClick={startCreateRole}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              New role
            </button>
          </div>

          {showRoleForm ? (
            <RoleWizard
              key={editingRole?._id ?? 'new'}
              catalog={catalog}
              initial={{
                name: editingRole?.name ?? '',
                description: editingRole?.description ?? '',
                permissions: editingRole ? [...editingRole.permissions] : [],
                lockedMeta: Boolean(editingRole?.isSystem),
              }}
              saving={savingRole}
              error={roleFormError}
              onCancel={cancelRoleForm}
              onSave={(payload) => void saveRoleWizard(payload)}
            />
          ) : null}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Permissions</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role._id} className="border-b border-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{role.name}</p>
                      <p className="text-xs text-gray-500">{role.description || '—'}</p>
                      {role.isSystem ? (
                        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          System
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {role.permissions.length} keys
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          role.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {role.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startEditRole(role)}
                        className="text-xs font-semibold text-[#B91C1C]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreateStaff(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Send staff invite
            </button>
          </div>

          {showCreateStaff ? (
            <form
              onSubmit={(e) => void saveStaff(e)}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">Send staff invite</p>
                <p className="mt-1 text-xs text-gray-500">
                  The user will receive an email with a generated temporary password, verification
                  link, and password setup link.
                </p>
              </div>
              <input
                required
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <div className="grid gap-1.5 sm:grid-cols-2">
                {roles
                  .filter((r) => r.isActive)
                  .map((r) => (
                    <label
                      key={r._id}
                      className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={staffRoleIds.includes(r._id)}
                        onChange={() =>
                          setStaffRoleIds((prev) =>
                            prev.includes(r._id)
                              ? prev.filter((id) => id !== r._id)
                              : [...prev, r._id]
                          )
                        }
                      />
                      {r.name}
                    </label>
                  ))}
              </div>
              {promotePrompt ? (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-gray-900">{promotePrompt}</p>
                  <p className="text-xs text-gray-600">
                    Promoting keeps their existing password and email verification, but replaces
                    their current portal access with staff console access. No invite email is sent.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={savingStaff}
                      onClick={() => void submitStaff(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Promote to staff
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotePrompt(null)}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingStaff}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Send invite
                </button>
                <button
                  type="button"
                  onClick={resetStaffForm}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {assignPerson ? (
            <form
              onSubmit={(e) => void saveAssign(e)}
              className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-5"
            >
              <p className="text-sm font-semibold text-gray-900">
                Assign roles — {assignPerson.email}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {roles
                  .filter((r) => r.isActive)
                  .map((r) => (
                    <label
                      key={r._id}
                      className="flex items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={assignRoleIds.includes(r._id)}
                        onChange={() =>
                          setAssignRoleIds((prev) =>
                            prev.includes(r._id)
                              ? prev.filter((id) => id !== r._id)
                              : [...prev, r._id]
                          )
                        }
                      />
                      {r.name}
                    </label>
                  ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingAssign}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save assignments
                </button>
                <button
                  type="button"
                  onClick={() => setAssignPerson(null)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Effective perms</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person._id} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{person.email}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{person.role}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {person.roleNames.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {person.permissions.length}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {person.role === 'staff' ? (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openAssign(person)}
                            className="text-xs font-semibold text-[#B91C1C]"
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
                      ) : (
                        <span className="text-xs text-gray-400">Full access</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-600" />
                <h2 className="text-base font-semibold text-gray-900">Delete staff account</h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingId)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-gray-600">
                Delete staff account{' '}
                <span className="font-medium text-gray-900">{deleteTarget.email}</span>?
              </p>
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
                This removes their console access and cannot be undone. You can invite the same
                email again later.
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={Boolean(deletingId)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDeleteStaff()}
                  disabled={Boolean(deletingId)}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingId === deleteTarget._id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Delete staff
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
