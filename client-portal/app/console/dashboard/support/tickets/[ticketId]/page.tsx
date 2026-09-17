'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import {
  addTenantComment,
  assignTicketToSelf,
  escalateTicket,
  fetchTenantTicketById,
  resolveTenantTicket,
  type TenantSupportTicket,
  type TenantTicketComment,
  type TenantTicketPriority,
  type TenantTicketSource,
  type TenantTicketStatus,
  type TenantTicketType,
} from '@/lib/tenantSupportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  tenantAccentButton,
  tenantAccentFocusRing,
  tenantAccentText,
} from '@/lib/tenantAccentStyles';
import {
  getAuthorBadgeLabel,
  getTenantFacingStatus,
  getTenantFacingStatusDescription,
} from '@/lib/tenantSupportLabels';

const TEXTAREA_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent';

const typeBadgeStyles: Record<TenantTicketType, string> = {
  support: 'bg-blue-50 text-blue-700 border-blue-200',
  bug: 'bg-red-50 text-red-700 border-red-200',
  vm_request: 'bg-violet-50 text-violet-700 border-violet-200',
};

const priorityBadgeStyles: Record<TenantTicketPriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-700',
};

const statusBadgeStyles: Record<TenantTicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  tenant_handling: 'bg-violet-100 text-violet-700',
  platform_assigned: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

const sourceBadgeStyles: Record<TenantTicketSource, string> = {
  web: 'bg-gray-100 text-gray-700',
  email: 'bg-indigo-100 text-indigo-700',
  whatsapp: 'bg-green-100 text-green-700',
};

const roleBadgeStyles: Record<string, string> = {
  user: 'bg-gray-100 text-gray-600',
  tenant_admin: 'bg-violet-100 text-violet-700',
  support_agent: 'bg-sky-100 text-sky-700',
  super_admin: 'bg-sky-100 text-sky-700',
  admin: 'bg-red-100 text-red-700',
};

const PLATFORM_HANDLED_STATUSES: TenantTicketStatus[] = [
  'platform_assigned',
  'in_progress',
  'resolved',
  'closed',
];

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
          <div className="h-24 w-full rounded bg-gray-100" />
        </div>
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-10 w-full rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

interface EscalateModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  accentColor: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

function EscalateModal({
  open,
  loading,
  error,
  accentColor,
  onClose,
  onConfirm,
}: EscalateModalProps) {
  const [note, setNote] = useState('');
  const focusRing = tenantAccentFocusRing(accentColor);

  useEffect(() => {
    if (!open) setNote('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Escalate to Racko Platform Team
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              This will assign the ticket to a Racko support agent. You won&apos;t be able to undo
              this.
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

        <label className="mb-1 block text-xs font-medium text-gray-500">
          Add a note for the Racko team (optional)
        </label>
        <textarea
          className={`${TEXTAREA_CLASS} min-h-[100px] resize-y`}
          style={focusRing}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context that may help the platform team…"
        />

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
            onClick={() => onConfirm(note.trim())}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Escalate
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  isTenantUser,
}: {
  comment: TenantTicketComment;
  isTenantUser: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        comment.isInternal ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{comment.authorName}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleBadgeStyles[comment.authorRole] ?? roleBadgeStyles.user}`}
        >
          {getAuthorBadgeLabel(comment.authorRole, isTenantUser)}
        </span>
        <span className="text-xs text-gray-400">{formatRelativeTime(comment.createdAt)}</span>
        {comment.isInternal ? (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Internal
          </span>
        ) : null}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{comment.body}</p>
    </div>
  );
}

export default function TenantSupportTicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticketId = params.ticketId;
  const { accentColor } = useTenantBranding();
  const focusRing = tenantAccentFocusRing(accentColor);
  const { tenantUser } = useTenantAuth();
  const { isTenantAdmin } = useTenantRbac();
  const { toasts, addToast, dismiss } = useToast();

  const [ticket, setTicket] = useState<TenantSupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showSubmittedBanner, setShowSubmittedBanner] = useState(
    () => searchParams.get('submitted') === '1'
  );
  const [commentBody, setCommentBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const [assigning, setAssigning] = useState(false);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTenantTicketById(ticketId);
      setTicket({ ...data, comments: data.comments ?? [] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showSubmittedBanner) return;
    const timer = setTimeout(() => {
      setShowSubmittedBanner(false);
      if (searchParams.get('submitted') === '1') {
        router.replace(tenantConsole.supportTicket(ticketId), { scroll: false });
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [showSubmittedBanner, searchParams, router, ticketId]);

  const visibleComments = useMemo(() => {
    const comments = ticket?.comments ?? [];
    return isTenantAdmin ? comments : comments.filter((c) => !c.isInternal);
  }, [ticket?.comments, isTenantAdmin]);

  const isAssignee = useMemo(() => {
    if (!ticket?.tenantAssigneeId || !tenantUser?.id) return false;
    return String(ticket.tenantAssigneeId) === String(tenantUser.id);
  }, [ticket?.tenantAssigneeId, tenantUser?.id]);

  const handleAddComment = async () => {
    if (!ticket || commentBody.trim().length < 1) return;
    setSubmittingComment(true);
    try {
      const isInternal = isTenantAdmin ? isInternalNote : false;
      const updated = await addTenantComment(ticket._id, commentBody.trim(), isInternal);
      setTicket({ ...updated, comments: updated.comments ?? [] });
      setCommentBody('');
      setIsInternalNote(false);
      addToast('success', isInternal ? 'Internal note added.' : 'Comment sent.');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to send comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAssignToSelf = async () => {
    if (!ticket) return;
    setAssigning(true);
    try {
      const updated = await assignTicketToSelf(ticket._id);
      setTicket({ ...updated, comments: updated.comments ?? [] });
      addToast('success', 'Ticket assigned to you.');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to assign ticket.');
    } finally {
      setAssigning(false);
    }
  };

  const handleResolve = async () => {
    if (!ticket) return;
    setResolving(true);
    try {
      const updated = await resolveTenantTicket(ticket._id);
      setTicket({ ...updated, comments: updated.comments ?? [] });
      setShowResolveConfirm(false);
      addToast('success', 'Ticket marked as resolved.');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to resolve ticket.');
    } finally {
      setResolving(false);
    }
  };

  const handleEscalate = async (note: string) => {
    if (!ticket) return;
    setEscalating(true);
    setEscalateError(null);
    try {
      const updated = await escalateTicket(ticket._id, note || undefined);
      setTicket({ ...updated, comments: updated.comments ?? [] });
      setShowEscalateModal(false);
      addToast('success', 'Ticket escalated successfully.');
    } catch (err) {
      setEscalateError(err instanceof ApiError ? err.message : 'Failed to escalate ticket.');
    } finally {
      setEscalating(false);
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

  const isTenantUserView = !isTenantAdmin;
  const showPlatformMessage = PLATFORM_HANDLED_STATUSES.includes(ticket.status);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <ConfirmModal
        open={showResolveConfirm}
        title="Resolve this ticket?"
        description="Are you sure you want to resolve this ticket?"
        confirmLabel="Mark as Resolved"
        confirmVariant="danger"
        loading={resolving}
        onCancel={() => setShowResolveConfirm(false)}
        onConfirm={() => void handleResolve()}
      />

      <EscalateModal
        open={showEscalateModal}
        loading={escalating}
        error={escalateError}
        accentColor={accentColor}
        onClose={() => {
          setShowEscalateModal(false);
          setEscalateError(null);
        }}
        onConfirm={(note) => void handleEscalate(note)}
      />

      <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link
          href={tenantConsole.supportTickets}
          className="hover:underline"
          style={tenantAccentText(accentColor)}
        >
          Support
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <Link
          href={tenantConsole.supportTickets}
          className="hover:underline"
          style={tenantAccentText(accentColor)}
        >
          My Tickets
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="font-medium text-gray-900">{ticket.ticketNumber}</span>
      </nav>

      {showSubmittedBanner ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your request has been submitted. We&apos;ll be in touch soon. Ticket:{' '}
          <span className="font-mono font-semibold">{ticket.ticketNumber}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="font-mono text-sm font-bold text-gray-900">{ticket.ticketNumber}</p>
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
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${isTenantAdmin ? 'capitalize' : ''} ${statusBadgeStyles[ticket.status]}`}
              >
                {getTenantFacingStatus(ticket.status, isTenantAdmin)}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${sourceBadgeStyles[ticket.source]}`}
              >
                {ticket.source}
              </span>
            </div>

            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Requester
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{ticket.requesterName}</p>
              <p className="text-sm text-gray-600">{ticket.requesterEmail}</p>
              {ticket.requesterPhone ? (
                <p className="text-sm text-gray-600">{ticket.requesterPhone}</p>
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

            {ticket.escalatedAt && isTenantAdmin ? (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">
                  Escalated to Racko platform team by{' '}
                  <span className="font-medium">{ticket.escalatedByName || 'Unknown'}</span> on{' '}
                  {formatDateTime(ticket.escalatedAt)}
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Updates</h2>
            <div className="mt-4 space-y-4">
              {visibleComments.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No updates yet — we&apos;ll post updates here.
                </p>
              ) : (
                visibleComments.map((comment) => (
                  <CommentItem key={comment._id} comment={comment} isTenantUser={isTenantUserView} />
                ))
              )}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {isInternalNote ? 'Internal note' : 'Add a comment or update…'}
              </label>
              <textarea
                className={`${TEXTAREA_CLASS} min-h-[100px] resize-y ${
                  isInternalNote ? 'border-amber-400 bg-amber-50' : ''
                }`}
                style={isInternalNote ? undefined : focusRing}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={
                  isInternalNote
                    ? 'Write a note visible only to your team and the support team…'
                    : 'Share additional details or ask a question…'
                }
              />
              {isTenantAdmin ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-gray-500">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  Internal note (only visible to support team)
                </label>
              ) : null}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={submittingComment || commentBody.trim().length < 1}
                  onClick={() => void handleAddComment()}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
                    isInternalNote
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'hover:opacity-90'
                  }`}
                  style={isInternalNote ? undefined : tenantAccentButton(accentColor)}
                >
                  {submittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isInternalNote ? 'Add Internal Note' : 'Send'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Ticket status</h2>
            <div className="mt-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${isTenantAdmin ? 'capitalize' : ''} ${statusBadgeStyles[ticket.status]}`}
              >
                {getTenantFacingStatus(ticket.status, isTenantAdmin)}
              </span>
              <p className="mt-3 text-sm text-gray-600">
                {getTenantFacingStatusDescription(ticket.status, isTenantAdmin)}
              </p>
            </div>
          </section>

          {isTenantAdmin ? (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Team actions</h2>
              <div className="mt-4 space-y-3">
                {ticket.status === 'open' ? (
                  <button
                    type="button"
                    disabled={assigning}
                    onClick={() => void handleAssignToSelf()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    style={tenantAccentButton(accentColor)}
                  >
                    {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Assign to myself
                  </button>
                ) : null}

                {ticket.status === 'tenant_handling' && isAssignee ? (
                  <>
                    <button
                      type="button"
                      disabled={resolving}
                      onClick={() => setShowResolveConfirm(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                    >
                      Mark as Resolved
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEscalateError(null);
                        setShowEscalateModal(true);
                      }}
                      className="inline-flex w-full items-center justify-center rounded-lg border-2 border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-50"
                    >
                      Escalate to Racko Team
                    </button>
                  </>
                ) : null}

                {showPlatformMessage ? (
                  <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                    This ticket is now being handled by the Racko platform team.
                  </p>
                ) : null}

                {ticket.status === 'tenant_handling' && !isAssignee ? (
                  <p className="text-sm text-gray-500">
                    Assigned to {ticket.tenantAssigneeName || 'another team member'}.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Details</h2>
            <dl className="mt-3 space-y-3 text-sm">
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
              <div>
                <dt className="text-xs text-gray-500">Ticket ID</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-gray-700">{ticket._id}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Link
              href={tenantConsole.supportTickets}
              className="text-sm font-medium hover:underline"
              style={tenantAccentText(accentColor)}
            >
              ← Back to My Tickets
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
