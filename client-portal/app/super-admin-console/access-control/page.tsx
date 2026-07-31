'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Shield, Users } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  createRbacRole,
  createStaffUser,
  fetchRbacPeople,
  fetchRbacPermissionCatalog,
  fetchRbacRoles,
  setRbacUserRoles,
  updateRbacRole,
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
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);

  const [assignPerson, setAssignPerson] = useState<RbacPerson | null>(null);
  const [assignRoleIds, setAssignRoleIds] = useState<string[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);

  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffTempPassword, setStaffTempPassword] = useState('');
  const [staffRoleIds, setStaffRoleIds] = useState<string[]>([]);
  const [savingStaff, setSavingStaff] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, RbacPermissionDef[]>();
    for (const p of catalog) {
      const list = map.get(p.group) || [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, [catalog]);

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
    setRoleName('');
    setRoleDescription('');
    setRolePerms([]);
    setFlash(null);
  }

  function startEditRole(role: RbacRole) {
    setEditingRole(role);
    setCreatingRole(false);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setRolePerms([...role.permissions]);
    setFlash(null);
  }

  function cancelRoleForm() {
    setCreatingRole(false);
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setRolePerms([]);
  }

  function togglePerm(key: string) {
    setRolePerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function saveRoleForm(e: React.FormEvent) {
    e.preventDefault();
    setSavingRole(true);
    setError(null);
    setFlash(null);
    try {
      if (editingRole) {
        await updateRbacRole(editingRole._id, {
          ...(editingRole.isSystem ? {} : { name: roleName, description: roleDescription }),
          permissions: rolePerms,
        });
        setFlash('Role updated.');
      } else {
        await createRbacRole({
          name: roleName,
          description: roleDescription,
          permissions: rolePerms,
        });
        setFlash('Role created.');
      }
      cancelRoleForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save role.');
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

  async function saveStaff(e: React.FormEvent) {
    e.preventDefault();
    setSavingStaff(true);
    setError(null);
    try {
      await createStaffUser({
        email: staffEmail,
        tempPassword: staffTempPassword,
        roleIds: staffRoleIds,
      });
      setFlash('Staff invite sent.');
      setShowCreateStaff(false);
      setStaffEmail('');
      setStaffTempPassword('');
      setStaffRoleIds([]);
      setTab('people');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send staff invite.');
    } finally {
      setSavingStaff(false);
    }
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
            <form
              onSubmit={(e) => void saveRoleForm(e)}
              className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-gray-900">
                {editingRole ? `Edit role: ${editingRole.name}` : 'Create role'}
              </p>
              {!editingRole?.isSystem ? (
                <>
                  <input
                    required
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="Role name"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="Description"
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </>
              ) : (
                <p className="text-xs text-amber-700">
                  System role — you can change permissions only.
                </p>
              )}
              <div className="space-y-3">
                {groups.map(([group, perms]) => (
                  <div key={group}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {group}
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {perms.map((p) => (
                        <label
                          key={p.key}
                          className="flex items-start gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={rolePerms.includes(p.key)}
                            onChange={() => togglePerm(p.key)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium text-gray-800">{p.label}</span>
                            <span className="mt-0.5 block font-mono text-[10px] text-gray-400">
                              {p.key}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingRole || (!editingRole && !roleName.trim())}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save role
                </button>
                <button
                  type="button"
                  onClick={cancelRoleForm}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
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
                  The user will receive an email with their login email, temporary password,
                  verification link, and password setup link.
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
              <input
                required
                type="password"
                minLength={8}
                value={staffTempPassword}
                onChange={(e) => setStaffTempPassword(e.target.value)}
                placeholder="Temporary password (min 8)"
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
                  onClick={() => setShowCreateStaff(false)}
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
                        <button
                          type="button"
                          onClick={() => openAssign(person)}
                          className="text-xs font-semibold text-[#B91C1C]"
                        >
                          Assign roles
                        </button>
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
    </div>
  );
}
