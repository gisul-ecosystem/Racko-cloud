'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Loader2, UserRound, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  addComment,
  fetchSupportQueue,
  fetchTicketById,
  reassignTicket,
  updateTicket,
  type SupportCommentAuthorRole,
  type SupportQueueAgent,
  type SupportTicket,
  type SupportTicketPriority,
  type SupportTicketSource,
  type SupportTicketStatus,
  type SupportTicketType,
} from '@/lib/supportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ToastContainer, useToast } from '@/components/ui/Toast';

const selectClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const textareaClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

const STATUS_OPTIONS: SupportTicketStatus[] = [
  'open',
  'tenant_handling',
  'platform_assigned',
  'in_progress',
  'resolved',
  'closed',
];

const PRIORITY_OPTIONS: SupportTicketPriority[] = ['low', 'medium', 'high', 'critical'];

const typeBadgeStyles: Record<SupportTicketType, string> = {
  support: 'bg-blue-50 text-blue-700 border-blue-200',
  bug: 'bg-red-50 text-red-700 border-red-200',
  vm_request: 'bg-violet-50 text-violet-700 border-violet-200',
};

const priorityBadgeStyles: Record<SupportTicketPriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-700',
};

const statusBadgeStyles: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  tenant_handling: 'bg-violet-100 text-violet-700',
  platform_assigned: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

const sourceBadgeStyles: Record<SupportTicketSource, string> = {
  web: 'bg-gray-100 text-gray-700',
  email: 'bg-indigo-100 text-indigo-700',
  whatsapp: 'bg-green-100 text-green-700',
};

const roleBadgeStyles: Record<SupportCommentAuthorRole, string> = {
  user: 'bg-gray-100 text-gray-600',
  tenant_admin: 'bg-violet-100 text-violet-700',
  support_agent: 'bg-sky-100 text-sky-700',
  admin: 'bg-red-100 text-red-700',
};

function formatDateTime(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(value);
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl animate-pulse space-y-6">
      <div className="h-4 w-72 rounded bg-gray-200" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="h-6 w-32 rounded bg-gray-200" />
          <div className="h-8 w-full rounded bg-gray-200" />
          <div className="h-4 w-2/3 rounded bg-gray-100" />
          <div className="h-24 w-full rounded bg-gray-100" />
        </div>
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-10 w-full rounded bg-gray-100" />
          <div className="h-10 w-full rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

interface ReassignModalProps {
  ticket: SupportTicket;
  agents: SupportQueueAgent[];
  onClose: () => void;
  onSuccess: () => void;
}

function ReassignModal({ ticket, agents, onClose, onSuccess }: ReassignModalProps) {
  const [agentId, setAgentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!agentId) {
      setError('Select an agent to reassign this ticket.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await reassignTicket(ticket._id, agentId);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reassign ticket.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Reassign Ticket {ticket.ticketNumber}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Current assignee:{' '}
              <span className="font-medium text-gray-700">
                {ticket.platformAssigneeName || 'Unassigned'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <select
          className={selectClass}
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">Select agent…</option>
          {agents.map((agent) => (
            <option key={String(agent._id)} value={String(agent._id)}>
              {agent.name} ({agent.email})
            </option>
          ))}
        </select>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupportTicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params.ticketId;
  const { toasts, addToast, dismiss } = useToast();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [agents, setAgents] = useState<SupportQueueAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusDraft, setStatusDraft] = useState<SupportTicketStatus>('open');
  const [priorityDraft, setPriorityDraft] = useState<SupportTicketPriority>('medium');
  const [savingMeta, setSavingMeta] = useState(false);
  const [showReassign, setShowReassign] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const [ticketData, queue] = await Promise.all([
        fetchTicketById(ticketId),
        fetchSupportQueue(),
      ]);
      setTicket({
        ...ticketData,
        comments: ticketData.comments ?? [],
      });
      setStatusDraft(ticketData.status);
      setPriorityDraft(ticketData.priority);
      setAgents(queue.agents ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assigneeEmail = useMemo(() => {
    if (!ticket?.platformAssigneeId) return null;
    const agent = agents.find((a) => String(a._id) === String(ticket.platformAssigneeId));
    return agent?.email ?? null;
  }, [agents, ticket?.platformAssigneeId]);

  const metaDirty =
    ticket != null && (statusDraft !== ticket.status || priorityDraft !== ticket.priority);

  const handleSaveMeta = async () => {
    if (!ticket || !metaDirty) return;
    setSavingMeta(true);
    try {
      const payload: { status?: SupportTicketStatus; priority?: SupportTicketPriority } = {};
      if (statusDraft !== ticket.status) payload.status = statusDraft;
      if (priorityDraft !== ticket.priority) payload.priority = priorityDraft;
      const updated = await updateTicket(ticket._id, payload);
      setTicket({ ...updated, comments: updated.comments ?? [] });
      setStatusDraft(updated.status);
      setPriorityDraft(updated.priority);
      addToast('success', 'Ticket updated.');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to update ticket.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleAddComment = async () => {
    if (!ticket || commentBody.trim().length < 1) return;
    setSubmittingComment(true);
    try {
      const updated = await addComment(ticket._id, commentBody.trim(), commentInternal);
      setTicket({ ...updated, comments: updated.comments ?? [] });
      setCommentBody('');
      setCommentInternal(false);
      addToast('success', 'Comment added.');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to add comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading && !ticket) {
    return <DetailSkeleton />;
  }

  if (error && !ticket) {
    return (
      <div className="mx-auto max-w-screen-xl">
        <ErrorState title="Failed to load ticket" message={error} onRetry={load} />
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {showReassign ? (
        <ReassignModal
          ticket={ticket}
          agents={agents}
          onClose={() => setShowReassign(false)}
          onSuccess={() => {
            addToast('success', `Ticket ${ticket.ticketNumber} reassigned.`);
            void load();
          }}
        />
      ) : null}

      <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link href="/super-admin-console/support" className="hover:text-[#B91C1C] hover:underline">
          Support
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <Link
          href="/super-admin-console/support/tickets"
          className="hover:text-[#B91C1C] hover:underline"
        >
          All Tickets
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="font-medium text-gray-900">{ticket.ticketNumber}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#B91C1C]">
              {ticket.ticketNumber}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">{ticket.subject}</h1>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${typeBadgeStyles[ticket.type]}`}
              >
                {ticket.type.replace(/_/g, ' ')}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${priorityBadgeStyles[ticket.priority]}`}
              >
                {ticket.priority}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeStyles[ticket.status]}`}
              >
                {ticket.status.replace(/_/g, ' ')}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${sourceBadgeStyles[ticket.source]}`}
              >
                {ticket.source}
              </span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Requester
                </p>
                <p className="mt-1 text-sm font-medium text-gray-900">{ticket.requesterName}</p>
                <p className="text-sm text-gray-600">{ticket.requesterEmail}</p>
                {ticket.requesterPhone ? (
                  <p className="text-sm text-gray-600">{ticket.requesterPhone}</p>
                ) : null}
              </div>
              {ticket.tenantId ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Tenant ID
                  </p>
                  <p className="mt-1 font-mono text-sm text-gray-700">{ticket.tenantId}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Description
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {ticket.description}
              </p>
            </div>

            {ticket.type === 'vm_request' && ticket.vmDetails ? (
              <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  VM Details
                </p>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['CPU', ticket.vmDetails.cpu],
                      ['RAM', ticket.vmDetails.ram],
                      ['Storage', ticket.vmDetails.storage],
                      ['OS', ticket.vmDetails.os],
                      ['Purpose', ticket.vmDetails.purpose],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-gray-500">{label}</dt>
                      <dd className="text-sm font-medium text-gray-900">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <p className="mt-6 text-sm text-gray-500">
              Created {formatDateTime(ticket.createdAt)}
            </p>

            {ticket.escalatedAt ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">Escalated to platform</p>
                <p className="mt-1 text-sm text-amber-800">
                  By {ticket.escalatedByName || 'Unknown'} on {formatDateTime(ticket.escalatedAt)}
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Comments</h2>
            <div className="mt-4 space-y-4">
              {ticket.comments.length === 0 ? (
                <p className="text-sm text-gray-500">No comments yet.</p>
              ) : (
                ticket.comments.map((comment) => (
                  <div
                    key={comment._id}
                    className={`rounded-lg border px-4 py-3 ${
                      comment.isInternal
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-gray-100 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {comment.authorName}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleBadgeStyles[comment.authorRole]}`}
                      >
                        {comment.authorRole.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                      {comment.isInternal ? (
                        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          Internal note
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{comment.body}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {commentInternal ? 'Internal note' : 'Add a comment'}
              </label>
              <textarea
                className={`${textareaClass} min-h-[120px] resize-y ${
                  commentInternal ? 'border-amber-300 ring-amber-100' : ''
                }`}
                placeholder={
                  commentInternal
                    ? 'Write an internal note visible only to platform staff…'
                    : 'Write a reply visible to the tenant…'
                }
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={commentInternal}
                    onChange={(e) => setCommentInternal(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  Internal note
                </label>
                <button
                  type="button"
                  disabled={submittingComment || commentBody.trim().length < 1}
                  onClick={() => void handleAddComment()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
                >
                  {submittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Add Comment
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Status &amp; Priority</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
                <select
                  className={selectClass}
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value as SupportTicketStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Priority</label>
                <select
                  className={selectClass}
                  value={priorityDraft}
                  onChange={(e) => setPriorityDraft(e.target.value as SupportTicketPriority)}
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!metaDirty || savingMeta}
                onClick={() => void handleSaveMeta()}
                className="w-full rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
              >
                {savingMeta ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Assignment</h2>
            <div className="mt-3">
              {ticket.platformAssigneeName ? (
                <>
                  <p className="text-sm font-medium text-gray-900">{ticket.platformAssigneeName}</p>
                  {assigneeEmail ? (
                    <p className="text-sm text-gray-500">{assigneeEmail}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-gray-400">Unassigned</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowReassign(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#B91C1C] hover:text-[#B91C1C]"
            >
              <UserRound className="h-4 w-4" />
              Reassign
            </button>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Ticket metadata</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Ticket ID</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-gray-700">{ticket._id}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Created at</dt>
                <dd className="mt-0.5 text-gray-700">{formatDateTime(ticket.createdAt)}</dd>
              </div>
              {ticket.resolvedAt ? (
                <div>
                  <dt className="text-xs text-gray-500">Resolved at</dt>
                  <dd className="mt-0.5 text-gray-700">{formatDateTime(ticket.resolvedAt)}</dd>
                </div>
              ) : null}
              {ticket.closedAt ? (
                <div>
                  <dt className="text-xs text-gray-500">Closed at</dt>
                  <dd className="mt-0.5 text-gray-700">{formatDateTime(ticket.closedAt)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-gray-500">Source</dt>
                <dd className="mt-0.5 capitalize text-gray-700">{ticket.source}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Link
              href="/super-admin-console/support/tickets"
              className="text-sm font-medium text-[#B91C1C] hover:underline"
            >
              ← Back to All Tickets
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
