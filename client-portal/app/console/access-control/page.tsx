'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Shield, Users } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  createPlatformRbacRole,
  fetchMyPlatformRbac,
  fetchPlatformRbacCatalog,
  fetchPlatformRbacPeople,
  fetchPlatformRbacRoles,
  invitePlatformOperator,
  setPlatformRbacUserRoles,
  updatePlatformRbacRole,
  type OrgRbacPermissionDef,
  type OrgRbacRole,
  type PlatformRbacPerson,
} from '@/lib/platformRbacApi';

type Tab = 'roles' | 'people';

export default function PlatformAccessControlPage() {
  const [tab, setTab] = useState<Tab>('roles');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [isOrgOwner, setIsOrgOwner] = useState(false);

  const [catalog, setCatalog] = useState<OrgRbacPermissionDef[]>([]);
  const [roles, setRoles] = useState<OrgRbacRole[]>([]);
  const [people, setPeople] = useState<PlatformRbacPerson[]>([]);

  const [editingRole, setEditingRole] = useState<OrgRbacRole | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);

  const [assignPerson, setAssignPerson] = useState<PlatformRbacPerson | null>(null);
  const [assignRoleIds, setAssignRoleIds] = useState<string[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRoleIds, setInviteRoleIds] = useState<string[]>([]);
  const [savingInvite, setSavingInvite] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, OrgRbacPermissionDef[]>();
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
      const [me, perms, roleList, peopleList] = await Promise.all([
        fetchMyPlatformRbac(),
        fetchPlatformRbacCatalog(),
        fetchPlatformRbacRoles(),
        fetchPlatformRbacPeople(),
      ]);
      setIsOrgOwner(me.isOrgOwner);
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

  async function saveRoleForm(e: React.FormEvent) {
    e.preventDefault();
    setSavingRole(true);
    setError(null);
    try {
      if (editingRole) {
        await updatePlatformRbacRole(editingRole._id, {
          ...(editingRole.isSystem ? {} : { name: roleName, description: roleDescription }),
          permissions: rolePerms,
        });
        setFlash('Role updated.');
      } else {
        await createPlatformRbacRole({
          name: roleName,
          description: roleDescription,
          permissions: rolePerms,
        });
        setFlash('Role created.');
      }
      setCreatingRole(false);
      setEditingRole(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save role.');
    } finally {
      setSavingRole(false);
    }
  }

  async function saveAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignPerson) return;
    setSavingAssign(true);
    try {
      await setPlatformRbacUserRoles(assignPerson._id, assignRoleIds);
      setFlash(`Roles updated for ${assignPerson.email}.`);
      setAssignPerson(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign roles.');
    } finally {
      setSavingAssign(false);
    }
  }

  async function saveInvite(e: React.FormEvent) {
    e.preventDefault();
    setSavingInvite(true);
    try {
      await invitePlatformOperator({
        email: inviteEmail,
        temporaryPassword: invitePassword,
        roleIds: inviteRoleIds,
      });
      setFlash(
        'Operator invited. They must verify email and set a password before signing in.'
      );
      setShowInvite(false);
      setInviteEmail('');
      setInvitePassword('');
      setInviteRoleIds([]);
      setTab('people');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite operator.');
    } finally {
      setSavingInvite(false);
    }
  }

  const showRoleForm = creatingRole || Boolean(editingRole);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/console"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-4 w-4" /> Console
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Access control</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Manage roles and console operators for your organization.
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
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setCreatingRole(true);
                setEditingRole(null);
                setRoleName('');
                setRoleDescription('');
                setRolePerms([]);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" /> New role
            </button>
          </div>

          {showRoleForm ? (
            <form
              onSubmit={(e) => void saveRoleForm(e)}
              className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
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
                <p className="text-sm font-semibold text-gray-900">{editingRole.name}</p>
              )}
              <div className="space-y-3">
                {groups.map(([group, perms]) => (
                  <div key={group}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {group}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {perms.map((p) => (
                        <label
                          key={p.key}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={rolePerms.includes(p.key)}
                            onChange={() =>
                              setRolePerms((prev) =>
                                prev.includes(p.key)
                                  ? prev.filter((k) => k !== p.key)
                                  : [...prev, p.key]
                              )
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingRole}
                  className="rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {savingRole ? 'Saving…' : 'Save role'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingRole(false);
                    setEditingRole(null);
                  }}
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
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRole(role);
                          setCreatingRole(false);
                          setRoleName(role.name);
                          setRoleDescription(role.description);
                          setRolePerms([...role.permissions]);
                        }}
                        className="text-xs font-medium text-[#B91C1C] hover:underline"
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
          {isOrgOwner ? (
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
              <input
                required
                type="text"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Temporary password (sent in invite email)"
                minLength={8}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500">
                An invite email is sent with a verify link. After verifying, they set a password
                before signing in.
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
                        {person.isOrgOwner ? 'Org owner' : person.role}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {person.roleNames.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!person.isOrgOwner ? (
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
