'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  issuePushStreamTicket,
  issueResetStreamTicket,
  openPushStatusStream,
  openResetStatusStreamWithReconnect,
} from '@/lib/machineManagerApi';
import { bulkResetInventoryServers, pushInventoryAgent } from '@/lib/vmInventoryApi';

/** Push phase first, then reset — a row moves down this list, never back up. */
type RowStatus =
  | 'pushing'
  | 'installing'
  | 'agent_ready'
  | 'push_failed'
  | 'no_login'
  | 'resetting'
  | 'success'
  | 'failed'
  | 'offline'
  | 'not_managed';

interface ResetRow {
  /** The IP is the only key both phases agree on, so rows merge across them. */
  ipAddress: string;
  machineId: string | null;
  status: RowStatus;
  /** Failure reason, or the phase the agent last reported. */
  detail?: string;
}

const STATUS_TEXT: Record<RowStatus, string> = {
  pushing: 'Installing agent over WinRM/SSH…',
  installing: 'Installer started — waiting for the agent to check in…',
  agent_ready: 'Agent connected — waiting to reset…',
  push_failed: 'Agent install failed',
  no_login: 'No stored login — agent could not be installed',
  resetting: 'Resetting…',
  success: 'Reset complete',
  failed: 'Failed',
  offline: 'Agent offline — skipped',
  not_managed: 'No Racko agent — skipped',
};

const BUSY_STATUSES: RowStatus[] = ['pushing', 'installing', 'agent_ready', 'resetting'];

function StatusIcon({ status }: { status: RowStatus }) {
  if (BUSY_STATUSES.includes(status)) {
    return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  }
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'failed' || status === 'push_failed') {
    return <XCircle className="h-4 w-4 text-rose-500" />;
  }
  return <XCircle className="h-4 w-4 text-gray-400" />;
}

function detailClass(status: RowStatus): string {
  if (status === 'success') return 'text-emerald-600';
  if (status === 'failed' || status === 'push_failed') return 'text-rose-500';
  if (BUSY_STATUSES.includes(status)) return 'text-blue-500';
  return 'text-gray-400';
}

/** The agent has 10 minutes to check in, same budget as the setup wizard. */
const PUSH_TIMEOUT_MS = 10 * 60 * 1000;

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Resets the selected VMs, installing the Racko agent first on any that lack a
 * live one — a reset needs a connected agent to carry it out.
 *
 * The push is agent-only: the Racko app is a ~72MB download that would land
 * moments before the wipe, so it is left to run after this.
 *
 * Both phases are driven from here rather than the server, so the window has to
 * stay open until it finishes. Anything already dispatched still completes on
 * the machine; only the live progress is lost.
 */
export function VmInventoryResetModal({
  serverIds,
  ipAddresses,
  onClose,
  onFinished,
}: {
  serverIds: string[];
  /** Shown on the confirm step, before the server resolves agents. */
  ipAddresses: string[];
  onClose: () => void;
  onFinished: (message: string) => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'push' | 'reset' | 'done'>('confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rows, setRows] = useState<ResetRow[]>([]);
  const [agentsInstalled, setAgentsInstalled] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PUSH_TIMEOUT_MS / 1000);

  const stopPush = useRef<(() => void) | null>(null);
  const stopReset = useRef<(() => void) | null>(null);

  // Leaving mid-run must not leave a stream open; the machines carry on.
  useEffect(
    () => () => {
      stopPush.current?.();
      stopReset.current?.();
    },
    []
  );

  const patch = useCallback((ip: string, next: Partial<ResetRow>) => {
    setRows((prev) => prev.map((r) => (r.ipAddress === ip ? { ...r, ...next } : r)));
  }, []);

  /**
   * Follows the push stream until every target has either connected or failed.
   * Resolves rather than rejects on timeout: the reset should still run for the
   * VMs that did come up.
   */
  const awaitPushes = (sessionId: string, targets: Array<{ ipAddress: string; machineId: string }>) =>
    new Promise<void>((resolve) => {
      const byMachineId = new Map(targets.map((t) => [t.machineId, t.ipAddress]));
      const pending = new Set(byMachineId.keys());
      let countdown: ReturnType<typeof setInterval> | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (countdown) clearInterval(countdown);
        if (timeout) clearTimeout(timeout);
        stopPush.current?.();
        stopPush.current = null;
        resolve();
      };

      void (async () => {
        let sse: EventSource;
        try {
          const ticket = await issuePushStreamTicket(sessionId);
          sse = openPushStatusStream(sessionId, ticket.streamToken);
        } catch {
          // Without the stream there is no way to know when agents check in, so
          // the reset runs against whatever is connected by then.
          setWarning(
            'Live agent-install progress is unavailable. Resetting the VMs that are already connected.'
          );
          finish();
          return;
        }
        stopPush.current = () => sse.close();

        sse.onmessage = (e: MessageEvent) => {
          type PushEvent = { type: string; machineId: string; success?: boolean; error?: string };
          let ev: PushEvent;
          try {
            ev = JSON.parse(e.data as string) as PushEvent;
          } catch {
            return;
          }
          const ip = byMachineId.get(ev.machineId);
          if (!ip) return;

          // A failed push is terminal: the box was never reached.
          if (ev.type === 'push_result' && !ev.success) {
            patch(ip, { status: 'push_failed', detail: ev.error ?? 'Could not reach the VM.' });
            pending.delete(ev.machineId);
          } else if (ev.type === 'push_result') {
            patch(ip, { status: 'installing', detail: STATUS_TEXT.installing });
          } else if (ev.type === 'agent_connected') {
            // The agent's own connection is the authoritative success signal.
            patch(ip, { status: 'agent_ready', detail: undefined });
            setAgentsInstalled((n) => n + 1);
            pending.delete(ev.machineId);
          }

          if (pending.size === 0) finish();
        };

        sse.onerror = () => {
          sse.close();
          setWarning(
            'Live agent-install progress stopped. Resetting the VMs that are already connected.'
          );
          finish();
        };

        setSecondsLeft(PUSH_TIMEOUT_MS / 1000);
        countdown = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
        timeout = setTimeout(() => {
          for (const machineId of pending) {
            const ip = byMachineId.get(machineId);
            if (ip) {
              patch(ip, {
                status: 'push_failed',
                detail: 'Timed out — the agent never checked in.',
              });
            }
          }
          finish();
        }, PUSH_TIMEOUT_MS);
      })();
    });

  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setWarning(null);

    // ── Phase 1: get an agent onto anything that lacks one ──────────────
    setPhase('push');
    let pushed: Array<{ ipAddress: string; machineId: string }> = [];
    let seededRows = false;
    try {
      const push = await pushInventoryAgent(serverIds, false);
      pushed = push.targets.map((t) => ({ ipAddress: t.ipAddress, machineId: t.machineId }));

      setRows([
        ...push.targets.map((t) => ({
          ipAddress: t.ipAddress,
          machineId: t.machineId,
          status: 'pushing' as RowStatus,
          detail: `Signing in as ${t.username} (${t.os})`,
        })),
        ...push.alreadyOnline.map((t) => ({
          ipAddress: t.ipAddress,
          machineId: t.machineId,
          status: 'agent_ready' as RowStatus,
          detail: 'Agent already running',
        })),
        ...push.skipped.map((s) => ({
          ipAddress: s.ipAddress,
          machineId: null,
          status: 'no_login' as RowStatus,
          detail: s.reason,
        })),
      ]);
      seededRows = true;

      if (pushed.length > 0) await awaitPushes(push.sessionId, pushed);
    } catch (err) {
      // The agent install is best-effort: the reset still runs for the VMs that
      // already had one, and reports the rest as offline.
      setWarning(
        err instanceof ApiError
          ? `Could not install agents: ${err.message}. Resetting the VMs that already have one.`
          : 'Could not install agents. Resetting the VMs that already have one.'
      );
    }

    // ── Phase 2: reset everything that is now reachable ─────────────────
    setPhase('reset');
    try {
      const reset = await bulkResetInventoryServers(serverIds);

      // The server is authoritative about who is online right now, so its
      // verdict wins — except where the push already explained the failure.
      setRows((prev) => {
        const next = new Map(prev.map((r) => [r.ipAddress, r]));
        const put = (ip: string, row: ResetRow): void => {
          const existing = next.get(ip);
          const keepReason =
            row.status !== 'resetting' &&
            (existing?.status === 'push_failed' || existing?.status === 'no_login');
          next.set(ip, keepReason ? existing! : { ...existing, ...row });
        };

        for (const t of reset.accepted) {
          put(t.ipAddress, { ipAddress: t.ipAddress, machineId: t.machineId, status: 'resetting' });
        }
        for (const t of reset.offline) {
          put(t.ipAddress, { ipAddress: t.ipAddress, machineId: t.machineId, status: 'offline' });
        }
        for (const ip of reset.notManaged) {
          put(ip, { ipAddress: ip, machineId: null, status: 'not_managed' });
        }
        return [...next.values()];
      });

      if (reset.accepted.length === 0) {
        setPhase('done');
        return;
      }

      // The resets are already running, so a stream failure past this point is
      // reported without discarding the list or implying nothing happened.
      try {
        const ticket = await issueResetStreamTicket(reset.sessionId);
        const byMachineId = new Map(reset.accepted.map((t) => [t.machineId, t.ipAddress]));
        stopReset.current = openResetStatusStreamWithReconnect(
          reset.sessionId,
          ticket.streamToken,
          (event) => {
            const ip = event.machineId ? byMachineId.get(event.machineId) : undefined;
            if (!ip) return;

            if (event.type === 'reset_progress') {
              if (event.message) patch(ip, { detail: event.message });
              return;
            }
            if (event.type !== 'reset_complete') return;
            patch(ip, {
              status: event.success ? 'success' : 'failed',
              detail: event.error ?? undefined,
            });
          },
          () => {
            stopReset.current = null;
          },
          // Retries exhausted: the reset may still have finished on the machine.
          () => {
            stopReset.current = null;
            setRows((prev) =>
              prev.map((r) =>
                r.status === 'resetting'
                  ? {
                      ...r,
                      status: 'failed',
                      detail: 'Connection lost — check the machine in Machine Manager.',
                    }
                  : r
              )
            );
          },
          reset.accepted.length
        );
      } catch {
        setError(
          'Reset started, but live progress is unavailable. Check Machine Manager for the outcome.'
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the reset.');
      // Nothing was dispatched at all, so the confirm step is still the truth.
      if (!seededRows) setPhase('confirm');
      // Otherwise the agents that came up are stuck mid-ladder; settle them so
      // the run can be closed.
      else {
        setPhase('done');
        setRows((prev) =>
          prev.map((r) =>
            BUSY_STATUSES.includes(r.status)
              ? { ...r, status: 'failed', detail: 'The reset was never started.' }
              : r
          )
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const started = phase !== 'confirm';
  const inFlight = rows.some((r) => BUSY_STATUSES.includes(r.status));
  const succeeded = rows.filter((r) => r.status === 'success').length;
  const failed = rows.filter(
    (r) => r.status === 'failed' || r.status === 'push_failed'
  ).length;

  const subtitle = (): string => {
    if (!started) return `${serverIds.length} VM${serverIds.length === 1 ? '' : 's'} selected`;
    if (phase === 'push' && inFlight) return `Installing agents — ${mmss(secondsLeft)} left`;
    if (phase === 'reset' && inFlight) return 'Reset in progress — this can take a few minutes';
    return `${succeeded} reset, ${failed} failed`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Reset VMs</h2>
            <p className="mt-0.5 text-sm text-gray-500">{subtitle()}</p>
          </div>
          {!inFlight && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {warning && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning}</span>
            </div>
          )}

          {!started ? (
            <>
              <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
                This uninstalls all user-installed software from the selected VMs and clears their
                job history. It cannot be undone.
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 ring-1 ring-gray-100">
                VMs without a running agent get one installed first, over WinRM (Windows) or SSH
                (Linux) using their stored login — that can add several minutes. The Racko app is
                not installed here; run the app push after the reset.
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Selected
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-3">
                  {ipAddresses.map((ip) => (
                    <p key={ip} className="font-mono text-xs text-gray-700">
                      {ip}
                    </p>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  VMs with no stored login can&apos;t be reached at all — they are reported back and
                  left untouched. Keep this window open until the run finishes.
                </p>
              </div>
            </>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {rows.map((r) => (
                <div
                  key={r.ipAddress}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
                >
                  <StatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-gray-900">{r.ipAddress}</p>
                    <p className={`mt-0.5 text-xs ${detailClass(r.status)}`}>
                      {r.detail ?? STATUS_TEXT[r.status]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          {!started ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void start()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Reset {serverIds.length} VM{serverIds.length === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                onFinished(
                  `Reset finished: ${succeeded} succeeded, ${failed} failed${
                    inFlight ? ', some still running' : ''
                  }.${agentsInstalled > 0 ? ` Agent installed on ${agentsInstalled} VM${agentsInstalled === 1 ? '' : 's'}.` : ''}`
                )
              }
              disabled={inFlight}
              className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
