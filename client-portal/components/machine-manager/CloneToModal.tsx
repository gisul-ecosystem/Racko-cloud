'use client';

/**
 * CloneToModal — lets admin pick a target machine and monitors
 * live clone replay progress via SSE.
 *
 * Flow:
 *   1. Show target machine selector (all admin's machines except source)
 *   2. On confirm → POST /api/v1/machines/:id/clone-to/:targetId
 *   3. Issue SSE stream ticket → open EventSource
 *   4. Show per-phase progress (Phase 0-6) until clone_complete fires
 */

import { useState, useEffect, useRef } from 'react';
import {
  X, Copy, Loader2, CheckCircle2, XCircle, Server, ChevronDown,
} from 'lucide-react';
import type { IMachine } from '../../lib/machineManagerApi';
import {
  cloneMachineTo,
  issueCloneStreamTicket,
  openCloneStatusStream,
} from '../../lib/machineManagerApi';
import { ApiError } from '../../lib/apiClient';

// ─── Phase labels ─────────────────────────────────────────────────────────────
const PHASE_LABELS: Record<number, string> = {
  0: 'Fetching activity log from server…',
  1: 'Applying registry changes…',
  2: 'Applying environment variables…',
  3: 'Installing software…',
  4: 'Restoring files…',
  5: 'Applying file deletions…',
  6: 'Finishing up…',
};

type CloneStep = 'select' | 'running' | 'done';

interface Props {
  sourceMachine: IMachine;
  allMachines: IMachine[];
  onClose: () => void;
}

export function CloneToModal({ sourceMachine, allMachines, onClose }: Props) {
  // Machines the user can clone to (all except source, must be online)
  const targets = allMachines.filter(
    (m) => m._id !== sourceMachine._id && m.status === 'online'
  );

  const [step, setStep] = useState<CloneStep>('select');
  const [targetId, setTargetId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<number>(-1);
  const [phaseMessage, setPhaseMessage] = useState('');
  const [success, setSuccess] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const sseRef = useRef<EventSource | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  const handleStart = async () => {
    if (!targetId) return;
    setLoading(true);
    setStep('running');
    setCurrentPhase(-1);
    setPhaseMessage('Starting clone replay…');

    try {
      const { sessionId } = await cloneMachineTo(sourceMachine._id, targetId);
      const { streamTicket } = await issueCloneStreamTicket(sessionId);
      const sse = openCloneStatusStream(sessionId, streamTicket);
      sseRef.current = sse;

      sse.onmessage = (e: MessageEvent) => {
        const event = JSON.parse(e.data as string) as {
          type: string;
          phase?: number;
          message?: string;
          success?: boolean;
          error?: string;
        };

        if (event.type === 'clone_progress') {
          setCurrentPhase(event.phase ?? -1);
          setPhaseMessage(event.message ?? PHASE_LABELS[event.phase ?? -1] ?? 'Running…');
        }

        if (event.type === 'clone_complete') {
          sse.close();
          sseRef.current = null;
          setSuccess(event.success ?? false);
          setErrorMsg(event.error ?? '');
          setStep('done');
          setLoading(false);
        }
      };

      sse.onerror = () => {
        sse.close();
        sseRef.current = null;
        setSuccess(false);
        setErrorMsg('Lost connection to the server during clone.');
        setStep('done');
        setLoading(false);
      };
    } catch (err) {
      setSuccess(false);
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to start clone.');
      setStep('done');
      setLoading(false);
    }
  };

  const targetMachine = allMachines.find((m) => m._id === targetId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Copy className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Clone VM</p>
              <p className="text-xs text-gray-400 truncate max-w-[200px]">
                From: {sourceMachine.name}
              </p>
            </div>
          </div>
          {step === 'done' && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5">

          {/* Step 1 — Select target */}
          {step === 'select' && (
            <>
              <p className="mb-4 text-sm text-gray-600">
                Select a target VM. All changes from <strong>{sourceMachine.name}</strong> will be
                replicated onto the selected machine — software installs, files, registry settings,
                and environment variables.
              </p>

              {targets.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
                  <Server className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">No online target machines available</p>
                  <p className="mt-1 text-xs text-gray-400">
                    The target machine must be online with the Racko agent running.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 pr-10 text-sm text-gray-900 shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">— Select target machine —</option>
                    {targets.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.ipAddress}) · {m.os}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              )}

              {targetId && (
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                  <strong>What will be cloned:</strong> all software installs, file changes, registry
                  modifications, and environment variable changes recorded since the agent was first
                  installed on <em>{sourceMachine.name}</em>.
                </div>
              )}
            </>
          )}

          {/* Step 2 — Running */}
          {step === 'running' && (
            <div className="py-2">
              <div className="mb-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin shrink-0 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Clone in progress…</p>
                  <p className="text-xs text-gray-400">
                    Replicating changes onto {targetMachine?.name ?? 'target VM'}
                  </p>
                </div>
              </div>

              {/* Phase progress */}
              <div className="space-y-2">
                {Object.entries(PHASE_LABELS).map(([phaseNum, label]) => {
                  const phase = parseInt(phaseNum);
                  const isDone    = currentPhase > phase;
                  const isActive  = currentPhase === phase;
                  const isPending = currentPhase < phase;
                  return (
                    <div key={phase} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition-colors ${
                      isActive  ? 'bg-blue-50 border border-blue-100' :
                      isDone    ? 'bg-green-50/60 border border-transparent' :
                                  'border border-transparent'
                    }`}>
                      <div className="shrink-0">
                        {isDone    && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        {isActive  && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                        {isPending && <div className="h-4 w-4 rounded-full border-2 border-gray-200" />}
                      </div>
                      <span className={`${
                        isActive  ? 'font-medium text-blue-700' :
                        isDone    ? 'text-green-600' :
                                    'text-gray-400'
                      }`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {phaseMessage && currentPhase >= 0 && (
                <p className="mt-3 text-xs text-gray-400 text-center">{phaseMessage}</p>
              )}
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 'done' && (
            <div className="py-2 text-center">
              {success ? (
                <>
                  <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
                  <p className="text-base font-semibold text-gray-900">Clone complete</p>
                  <p className="mt-1.5 text-sm text-gray-500">
                    All changes from <strong>{sourceMachine.name}</strong> have been successfully
                    replicated onto <strong>{targetMachine?.name}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
                  <p className="text-base font-semibold text-gray-900">Clone failed</p>
                  <p className="mt-1.5 text-sm text-gray-500">
                    {errorMsg || 'An unexpected error occurred during clone replay.'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
          {step === 'select' && (
            <>
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleStart()}
                disabled={!targetId || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Start Clone
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={onClose}
              className="rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#a01717]"
            >
              Done
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
