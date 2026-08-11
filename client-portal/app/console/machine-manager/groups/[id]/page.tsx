'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../context/AuthContext';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import {
  fetchGroupMachines, addMachinesToGroup, removeMachinesFromGroup,
} from '../../../../../lib/machineGroupsApi';
import { fetchMachines, type IMachine } from '../../../../../lib/machineManagerApi';
import { ApiError } from '../../../../../lib/apiClient';
import { ArrowLeft, Server, Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react';

type GroupMachine = { _id: string; name: string; status: string; os: string; ipAddress: string };

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const { toasts, addToast, dismiss } = useToast();

  const [groupMachines, setGroupMachines] = useState<GroupMachine[]>([]);
  const [allMachines, setAllMachines]     = useState<IMachine[]>([]);
  const [loading, setLoading]             = useState(true);

  // ── Add flow ──────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd]             = useState(false);
  const [addLoading, setAddLoading]       = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());

  // ── Remove flow ───────────────────────────────────────────────────────────
  const [selectedToRemove, setSelectedToRemove] = useState<Set<string>>(new Set());
  const [removeLoading, setRemoveLoading]       = useState<string | null>(null); // per-row loader
  const [bulkRemoveLoading, setBulkRemoveLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated || !id) return;
    setLoading(true);
    try {
      const [gm, all] = await Promise.all([fetchGroupMachines(id), fetchMachines()]);
      setGroupMachines(gm);
      setAllMachines(all);
      // Reset selections when data refreshes
      setSelectedToRemove(new Set());
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to load machines.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, id]);

  useEffect(() => { void load(); }, [load]);

  // Machines not already in group
  const groupIds = new Set(groupMachines.map((m) => m._id));
  const available = allMachines.filter((m) => !groupIds.has(m._id));

  // ── Add helpers ────────────────────────────────────────────────────────────
  const allAddSelected   = available.length > 0 && selectedToAdd.size === available.length;
  const someAddSelected  = selectedToAdd.size > 0 && !allAddSelected;

  const toggleSelectAllToAdd = () => {
    if (allAddSelected) {
      setSelectedToAdd(new Set());
    } else {
      setSelectedToAdd(new Set(available.map((m) => m._id)));
    }
  };

  const handleAdd = async () => {
    if (!selectedToAdd.size) return;
    setAddLoading(true);
    try {
      await addMachinesToGroup(id, [...selectedToAdd]);
      addToast('success', `${selectedToAdd.size} machine(s) added to group.`);
      setShowAdd(false);
      setSelectedToAdd(new Set());
      void load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to add machines.');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Remove helpers ─────────────────────────────────────────────────────────
  const allRemoveSelected  = groupMachines.length > 0 && selectedToRemove.size === groupMachines.length;
  const someRemoveSelected = selectedToRemove.size > 0 && !allRemoveSelected;

  const toggleSelectAllToRemove = () => {
    if (allRemoveSelected) {
      setSelectedToRemove(new Set());
    } else {
      setSelectedToRemove(new Set(groupMachines.map((m) => m._id)));
    }
  };

  const toggleRemoveOne = (machineId: string) => {
    setSelectedToRemove((prev) => {
      const next = new Set(prev);
      next.has(machineId) ? next.delete(machineId) : next.add(machineId);
      return next;
    });
  };

  // Bulk remove — called by the toolbar button
  const handleBulkRemove = async () => {
    if (!selectedToRemove.size) return;
    setBulkRemoveLoading(true);
    try {
      await removeMachinesFromGroup(id, [...selectedToRemove]);
      addToast('success', `${selectedToRemove.size} machine(s) removed from group.`);
      setSelectedToRemove(new Set());
      void load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to remove machines.');
    } finally {
      setBulkRemoveLoading(false);
    }
  };

  // Single-row remove — keeps individual Remove button working as before
  const handleRemove = async (machineId: string, machineName: string) => {
    setRemoveLoading(machineId);
    try {
      await removeMachinesFromGroup(id, [machineId]);
      addToast('success', `"${machineName}" removed from group.`);
      setSelectedToRemove((prev) => { const n = new Set(prev); n.delete(machineId); return n; });
      void load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to remove machine.');
    } finally {
      setRemoveLoading(null);
    }
  };

  const statusDot: Record<string, string> = {
    online:  'bg-green-500',
    offline: 'bg-red-400',
    pending: 'bg-gray-400',
  };

  return (
    <div className="max-w-screen-lg">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <Link href="/console/machine-manager/groups"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Groups
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">
          Group Machines
          <span className="ml-2 text-base font-normal text-gray-500">({groupMachines.length})</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk Remove button — appears when machines are selected */}
          {selectedToRemove.size > 0 && (
            <button
              onClick={() => void handleBulkRemove()}
              disabled={bulkRemoveLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {bulkRemoveLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              Remove {selectedToRemove.size} Machine{selectedToRemove.size !== 1 ? 's' : ''}
            </button>
          )}
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => { setShowAdd(true); setSelectedToAdd(new Set()); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#a01717]"
          >
            <Plus className="h-4 w-4" />
            Add Machines
          </button>
        </div>
      </div>

      {/* ── Add machines panel ────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Select machines to add:</p>
            {available.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 select-none">
                <input
                  type="checkbox"
                  className="accent-[#B91C1C]"
                  checked={allAddSelected}
                  ref={(el) => { if (el) el.indeterminate = someAddSelected; }}
                  onChange={toggleSelectAllToAdd}
                />
                Select All ({available.length})
              </label>
            )}
          </div>
          {available.length === 0 ? (
            <p className="text-sm text-gray-400">All machines are already in this group.</p>
          ) : (
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-60 overflow-y-auto">
              {available.map((m) => (
                <label key={m._id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-2.5 hover:bg-gray-50 has-[:checked]:border-[#B91C1C] has-[:checked]:bg-red-50">
                  <input
                    type="checkbox"
                    className="accent-[#B91C1C]"
                    checked={selectedToAdd.has(m._id)}
                    onChange={() => {
                      setSelectedToAdd((prev) => {
                        const next = new Set(prev);
                        next.has(m._id) ? next.delete(m._id) : next.add(m._id);
                        return next;
                      });
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.ipAddress}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void handleAdd()}
              disabled={addLoading || selectedToAdd.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add {selectedToAdd.size > 0 ? `(${selectedToAdd.size})` : ''}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Machines table ────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : groupMachines.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Server className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">No machines in this group yet.</p>
            <button onClick={() => setShowAdd(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> Add Machines
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {/* Select-all checkbox in header */}
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 accent-[#B91C1C] cursor-pointer"
                    checked={allRemoveSelected}
                    ref={(el) => { if (el) el.indeterminate = someRemoveSelected; }}
                    onChange={toggleSelectAllToRemove}
                    title="Select all"
                  />
                </th>
                {['Name', 'IP Address', 'OS', 'Status', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupMachines.map((m) => {
                const isSelected = selectedToRemove.has(m._id);
                return (
                  <tr key={m._id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${isSelected ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 accent-[#B91C1C] cursor-pointer"
                        checked={isSelected}
                        onChange={() => toggleRemoveOne(m._id)}
                      />
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">{m.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-600">{m.ipAddress}</td>
                    <td className="px-5 py-3 capitalize text-gray-600">{m.os}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot[m.status] ?? 'bg-gray-400'}`} />
                        <span className="capitalize text-gray-600">{m.status}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => void handleRemove(m._id, m.name)}
                        disabled={removeLoading === m._id || bulkRemoveLoading}
                        className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {removeLoading === m._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
