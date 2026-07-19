'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Link2, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  attachDedicatedRequest,
  fetchDedicatedRequests,
  formatDedicatedStatus,
  rejectDedicatedRequest,
  type DedicatedServerProtocol,
  type IDedicatedServer,
} from '@/lib/dedicatedServerApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

function formatInr(n: number) {
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function DedicatedRequestsByAdminPage() {
  const params = useParams();
  const adminId = typeof params?.adminId === 'string' ? params.adminId : '';

  const [requests, setRequests] = useState<IDedicatedServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [attachForm, setAttachForm] = useState({
    ipAddress: '',
    hostname: '',
    username: 'root',
    password: '',
    protocol: 'ssh' as DedicatedServerProtocol,
  });

  const load = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchDedicatedRequests({ adminId, status: 'all' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    void load();
  }, [load]);

  const adminEmail = requests[0]?.adminEmail ?? adminId;

  async function handleAttach(e: React.FormEvent) {
    e.preventDefault();
    if (!attachId) return;
    setActionId(attachId);
    setSuccessMsg(null);
    try {
      await attachDedicatedRequest(attachId, {
        ipAddress: attachForm.ipAddress.trim(),
        hostname: attachForm.hostname.trim() || undefined,
        username: attachForm.username.trim(),
        password: attachForm.password,
        protocol: attachForm.protocol,
      });
      setAttachId(null);
      setSuccessMsg('Server attached — visible to the admin.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Attach failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectId || !rejectReason.trim()) return;
    setActionId(rejectId);
    try {
      await rejectDedicatedRequest(rejectId, rejectReason.trim());
      setRejectId(null);
      setRejectReason('');
      setSuccessMsg('Request rejected.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reject failed.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl p-6 lg:p-8">
      <Link
        href="/super-admin-console/dedicated-server-requests"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        All requesters
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Requests — {adminEmail}</h1>
      <p className="mt-1 text-sm text-gray-500">Manually attach IP and credentials, or reject.</p>

      {successMsg ? <p className="mt-3 text-sm text-green-700">{successMsg}</p> : null}
      {error && !loading ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
          </div>
        ) : requests.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">No requests</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-5 py-3">Plan</th>
                <th className="px-4 py-3">Specs</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <Fragment key={req._id}>
                  <tr className="border-b border-gray-50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{req.planName}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600">
                      {req.specs.cpu} · {req.specs.ram} · {req.specs.disk}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs">
                      {formatInr(req.monthlyPrice)}/mo
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium">
                        {formatDedicatedStatus(req.status)}
                      </span>
                      {req.ipAddress ? (
                        <p className="mt-1 font-mono text-xs text-gray-500">{req.ipAddress}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {req.status === 'provisioning' ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAttachId(req._id);
                              setAttachForm({
                                ipAddress: '',
                                hostname: '',
                                username: 'root',
                                password: '',
                                protocol: 'ssh',
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Attach
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectId(req._id);
                              setRejectReason('');
                            }}
                            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold text-gray-700"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {attachId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(e) => void handleAttach(e)}
            className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-gray-900">Attach dedicated server</h2>
            <input
              required
              placeholder="IP address"
              value={attachForm.ipAddress}
              onChange={(e) => setAttachForm((f) => ({ ...f, ipAddress: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="Hostname (optional)"
              value={attachForm.hostname}
              onChange={(e) => setAttachForm((f) => ({ ...f, hostname: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Username"
              value={attachForm.username}
              onChange={(e) => setAttachForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <input
              required
              type="password"
              placeholder="Password"
              value={attachForm.password}
              onChange={(e) => setAttachForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <select
              value={attachForm.protocol}
              onChange={(e) =>
                setAttachForm((f) => ({
                  ...f,
                  protocol: e.target.value as DedicatedServerProtocol,
                }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="ssh">SSH</option>
              <option value="rdp">RDP</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAttachId(null)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionId === attachId}
                className="rounded-lg bg-[#B91C1C] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {actionId === attachId ? 'Saving…' : 'Attach'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {rejectId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(e) => void handleReject(e)}
            className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-gray-900">Reject request</h2>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectId(null)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionId === rejectId}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Reject
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
