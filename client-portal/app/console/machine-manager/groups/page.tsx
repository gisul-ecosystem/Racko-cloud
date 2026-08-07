'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import {
  fetchGroups, createGroup, renameGroup, deleteGroup,
  type IMachineGroup,
} from '../../../../lib/machineGroupsApi';
import { ApiError } from '../../../../lib/apiClient';
import { Layers, Plus, Pencil, Trash2, Server, Wand2, RefreshCw, Loader2 } from 'lucide-react';

export default function MachineGroupsPage() {
  const { isAuthenticated } = useAuth();
  const { toasts, addToast, dismiss } = useToast();

  const [groups, setGroups]           = useState<IMachineGroup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Create
  const [showCreate, setShowCreate]   = useState(false);
  const [createName, setCreateName]   = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Rename
  const [renaming, setRenaming]       = useState<IMachineGroup | null>(null);
  const [renameName, setRenameName]   = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  // Delete
  const [deleting, setDeleting]       = useState<IMachineGroup | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGroups();
      setGroups(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load groups.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreateLoading(true);
    try {
      await createGroup(createName.trim());
      addToast('success', `Group "${createName}" created.`);
      setShowCreate(false);
      setCreateName('');
      void load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to create group.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRename = async () => {
    if (!renaming || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      await renameGroup(renaming._id, renameName.trim());
      addToast('success', 'Group renamed.');
      setRenaming(null);
      void load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to rename group.');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteGroup(deleting._id);
      addToast('success', `Group "${deleting.name}" deleted.`);
      setDeleting(null);
      void load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete group.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Delete confirm */}
      {deleting && (
        <ConfirmModal
          open
          title="Delete Group"
          description={`Delete "${deleting.name}"? Machines in the group will not be deleted — they will just become ungrouped.`}
          confirmLabel="Delete Group"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Machine Groups</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Organise machines into groups to scope file sharing and access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreateName(''); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
          >
            <Plus className="h-4 w-4" />
            New Group
          </button>
        </div>
      </div>

      {/* Create inline form */}
      {showCreate && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Layers className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
            placeholder="Group name (e.g. Training Batch A)"
            autoFocus
            className="flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={createLoading || !createName.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {createLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Create
          </button>
          <button onClick={() => setShowCreate(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-16 shadow-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <Layers className="h-7 w-7 text-gray-400" />
          </div>
          <p className="font-medium text-gray-600">No groups yet</p>
          <p className="mt-1 text-sm text-gray-400">Create a group to organise machines and scope file sharing.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717]"
          >
            <Plus className="h-4 w-4" />
            Create First Group
          </button>
        </div>
      )}

      {/* Groups grid */}
      {!loading && groups.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group._id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              {/* Rename inline */}
              {renaming?._id === group._id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(); if (e.key === 'Escape') setRenaming(null); }}
                    autoFocus
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-[#B91C1C]"
                  />
                  <button
                    onClick={() => void handleRename()}
                    disabled={renameLoading || !renameName.trim()}
                    className="rounded bg-[#B91C1C] px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    {renameLoading ? '…' : 'Save'}
                  </button>
                  <button onClick={() => setRenaming(null)} className="text-xs text-gray-400">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
                      <Layers className="h-4 w-4 text-[#B91C1C]" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{group.name}</p>
                      <p className="text-xs text-gray-500">{group.machineCount} machine{group.machineCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setRenaming(group); setRenameName(group.name); }}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(group)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/console/machine-manager/groups/${group._id}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  <Server className="h-3.5 w-3.5" />
                  Manage Machines
                </Link>
                <Link
                  href={`/console/machine-manager/setup?groupId=${group._id}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-[#B91C1C] transition hover:bg-red-100"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Push Agent
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
