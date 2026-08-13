'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../context/AuthContext';
import { useSoftwareCatalog } from '../../../../../hooks/useSoftwareCatalog';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import { ApiError } from '../../../../../lib/apiClient';
import {
  fetchMachine,
  createJobs,
  fetchJobs,
  fetchMachines,
  deleteMachine,
  execCommand,
  resetMachines,
  issueResetStreamTicket,
  openResetStatusStream,
  type IMachine,
  type MachineStatus,
  type IJob,
  type JobStatus,
} from '../../../../../lib/machineManagerApi';
import { useJobStream } from '../../../../../hooks/useJobStream';
import { ConfirmModal } from '../../../../../components/ui/ConfirmModal';
import {
  Server, ArrowLeft, Cpu, HardDrive, MemoryStick,
  Monitor, CheckCircle2, Loader2, RefreshCw, Package, FileText, X, Trash2, Terminal, Play, RotateCcw, Copy,
} from 'lucide-react';

const jobStatusCfg: Record<JobStatus, { label: string; dot: string; text: string }> = {
  pending:    { label: 'Pending',    dot: 'bg-gray-400',               text: 'text-gray-500' },
  installing: { label: 'Installing', dot: 'bg-blue-400 animate-pulse', text: 'text-blue-600' },
  success:    { label: 'Success',    dot: 'bg-green-500',              text: 'text-green-600' },
  failed:     { label: 'Failed',     dot: 'bg-red-500',                text: 'text-red-600' },
  retrying:   { label: 'Retrying',   dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-600' },
};
import Link from 'next/link';

function StatusBadge({ status }: { status: MachineStatus }) {
  const cfg: Record<MachineStatus, { label: string; dot: string; badge: string }> = {
    pending: { label: 'Pending', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    online:  { label: 'Online',  dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200' },
    offline: { label: 'Offline', dot: 'bg-red-400',   badge: 'bg-red-50 text-red-600 border-red-200' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function SpecCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Logs modal ───────────────────────────────────────────────────────────────
function LogsModal({ job, onClose }: { job: IJob; onClose: () => void }) {
  const cfg = jobStatusCfg[job.status] ?? jobStatusCfg.pending;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{job.softwareName || '—'} — Install Logs</p>
            <p className="mt-0.5 font-mono text-xs text-gray-400">{job._id}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          <span className="text-xs text-gray-400">{job.attempts} attempt{job.attempts !== 1 ? 's' : ''}</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-5">
          {job.logs ? (
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-gray-700">{job.logs}</pre>
          ) : (
            <p className="text-sm text-gray-400">No logs yet.</p>
          )}
        </div>
        <div className="border-t border-gray-100 px-5 py-3 text-right">
          <button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Live job row for the Installation History table ─────────────────────────
function LiveJobEntry({ job: initialJob, isAuthenticated, onViewLogs }: {
  job: IJob;
  isAuthenticated: boolean;
  onViewLogs: (job: IJob) => void;
}) {
  const job = useJobStream(initialJob, isAuthenticated);
  const cfg = jobStatusCfg[job.status] ?? jobStatusCfg.pending;
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
      <td className="px-5 py-2.5 font-medium text-gray-800">{job.softwareName || '—'}</td>
      <td className="px-5 py-2.5">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </td>
      <td className="px-5 py-2.5 text-xs text-gray-400">{job.attempts}</td>
      <td className="px-5 py-2.5 text-xs text-gray-400">{new Date(job.updatedAt).toLocaleString()}</td>
      <td className="px-5 py-2.5">
        <button
          onClick={() => onViewLogs(job)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
        >
          <FileText className="h-3 w-3" />
          {job.logs ? 'View logs' : 'No logs'}
        </button>
      </td>
    </tr>
  );
}

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { addToast, toasts, dismiss } = useToast();
  const { catalog, loading: catalogLoading } = useSoftwareCatalog(isAuthenticated);

  const [machine, setMachine] = useState<IMachine | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<IJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<IJob | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [removingAgent, setRemovingAgent] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Reset state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'resetting' | 'success' | 'failed'>('idle');
  const [resetError, setResetError] = useState<string>('');
  const sseRef = useRef<EventSource | null>(null);

  // Terminal tabs state — each tab is an independent terminal session
  interface TerminalEntry { command: string; output: string; exitCode: number; ts: string }
  interface TerminalTab { id: number; label: string; history: TerminalEntry[]; input: string; historyIndex: number; running: boolean }
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([
    { id: 1, label: 'Terminal 1', history: [], input: '', historyIndex: -1, running: false }
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const nextTabId = useRef(2);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  const activeTab = terminalTabs.find((t) => t.id === activeTabId) ?? terminalTabs[0];

  const updateTab = (id: number, patch: Partial<TerminalTab>) =>
    setTerminalTabs((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));

  const addTab = () => {
    const id = nextTabId.current++;
    const label = `Terminal ${id}`;
    setTerminalTabs((prev) => [...prev, { id, label, history: [], input: '', historyIndex: -1, running: false }]);
    setActiveTabId(id);
  };

  const closeTab = (id: number) => {
    setTerminalTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) return prev; // keep at least one
      if (activeTabId === id) setActiveTabId(remaining[remaining.length - 1].id);
      return remaining;
    });
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, allJobs] = await Promise.all([
        fetchMachine(id),
        fetchJobs(),
      ]);
      setMachine(m);
      setJobs(allJobs.filter((j) => j.machineId === id));
    } catch {
      addToast('error', 'Failed to load machine.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  const toggle = (swId: string) =>
    setSelected((prev) => prev.includes(swId) ? prev.filter((s) => s !== swId) : [...prev, swId]);

  const handleInstall = async () => {
    if (!selected.length || !machine) return;
    setInstalling(true);
    try {
      await createJobs({ machineIds: [machine._id], softwareIds: selected });
      addToast('success', `${selected.length} install job(s) queued.`);
      setSelected([]);
      router.push('/console/machine-manager/jobs');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to queue jobs.');      setInstalling(false);
    }
  };

  const handleRemoveAgent = async () => {
    if (!machine) return;
    setRemovingAgent(true);
    try {
      await deleteMachine(machine._id);
      addToast('success', `"${machine.name}" removed. Agent will uninstall within a few seconds.`);
      router.push('/console/machine-manager/machines');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to remove machine.');
      setRemovingAgent(false);
    }
  };

  // Cleanup SSE on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  const handleReset = async () => {
    if (!machine) return;
    setShowResetConfirm(false);
    setResetting(true);
    setResetStatus('resetting');
    setResetError('');

    try {
      const sessionId = `reset-${Date.now()}`;
      const result = await resetMachines([machine._id], sessionId);

      if (result.offline.includes(machine._id)) {
        setResetStatus('failed');
        setResetError('Agent is offline. Cannot reset.');
        setResetting(false);
        return;
      }

      // Open SSE stream to track completion
      const ticket = await issueResetStreamTicket(sessionId);
      const sse = openResetStatusStream(sessionId, ticket.streamToken);
      sseRef.current = sse;

      sse.onmessage = (e: MessageEvent) => {
        const event = JSON.parse(e.data as string) as {
          type: string;
          machineId?: string;
          success?: boolean;
          error?: string;
        };
        if (event.type === 'reset_complete') {
          sse.close();
          sseRef.current = null;
          if (event.success) {
            setResetStatus('success');
            addToast('success', `"${machine.name}" reset successfully.`);
            // Reload page data — jobs cleared, machine fresh
            setTimeout(() => void load(), 1500);
          } else {
            setResetStatus('failed');
            setResetError(event.error ?? 'Reset failed.');
            addToast('error', `Reset failed: ${event.error ?? 'Unknown error'}`);
          }
          setResetting(false);
        }
      };

      sse.onerror = () => {
        sse.close();
        sseRef.current = null;
        setResetStatus('failed');
        setResetError('Lost connection to agent.');
        setResetting(false);
      };
    } catch (err) {
      setResetStatus('failed');
      setResetError(err instanceof ApiError ? err.message : 'Failed to initiate reset.');
      addToast('error', err instanceof ApiError ? err.message : 'Failed to initiate reset.');
      setResetting(false);
    }
  };

  const handleExec = async () => {
    if (!activeTab.input.trim() || !machine || activeTab.running) return;
    const cmd = activeTab.input.trim();
    const tabId = activeTab.id;
    updateTab(tabId, { input: '', historyIndex: -1, running: true });
    try {
      const result = await execCommand(machine._id, cmd);
      setTerminalTabs((prev) => prev.map((t) =>
        t.id === tabId
          ? { ...t, history: [...t.history, { command: cmd, output: result.output, exitCode: result.exitCode, ts: new Date().toLocaleTimeString() }], running: false }
          : t
      ));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Command failed.');
      setTerminalTabs((prev) => prev.map((t) =>
        t.id === tabId
          ? { ...t, history: [...t.history, { command: cmd, output: msg, exitCode: 1, ts: new Date().toLocaleTimeString() }], running: false }
          : t
      ));
    }
  };

  // Auto-scroll terminal to bottom on new output in active tab
  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab?.history]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!machine) return null;

  const specs = machine.specs;
  // Filter catalog to OS-compatible software
  const compatible = catalog.filter((sw) => sw.supportedOS.includes(machine.os));

  return (
    <div className="max-w-4xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      {selectedJob && <LogsModal job={selectedJob} onClose={() => setSelectedJob(null)} />}

      {showRemoveConfirm && machine && (
        <ConfirmModal
          open
          title="Remove Machine"
          description={`This will uninstall the Racko agent from "${machine.name}" and remove it from your machine list.`}
          confirmLabel="Remove Machine"
          confirmVariant="danger"
          loading={removingAgent}
          onConfirm={() => void handleRemoveAgent()}
          onCancel={() => setShowRemoveConfirm(false)}
        />
      )}

      {showResetConfirm && machine && (
        <ConfirmModal
          open
          title="Reset VM"
          description={`This will uninstall all user-installed software from "${machine.name}". This cannot be undone.`}
          confirmLabel="Reset VM"
          confirmVariant="danger"
          loading={resetting}
          onConfirm={() => void handleReset()}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {/* Back */}
      <Link href="/console/machine-manager/machines"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> My Machines
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{machine.name}</h1>
            <p className="mt-0.5 font-mono text-sm text-gray-400">{machine.ipAddress}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={machine.status} />
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting || machine.status !== 'online'}
            title={machine.status !== 'online' ? 'Agent must be online to reset' : 'Reset VM — removes all user-installed software'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resetting
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resetting…</>
              : <><RotateCcw className="h-3.5 w-3.5" /> Reset VM</>
            }
          </button>
          <button
            onClick={() => setShowRemoveConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove Machine
          </button>
        </div>
      </div>

      {/* Reset status banner */}
      {resetStatus !== 'idle' && (
        <div className={`mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          resetStatus === 'resetting' ? 'border-blue-200 bg-blue-50 text-blue-700'
          : resetStatus === 'success' ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {resetStatus === 'resetting' && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
          {resetStatus === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {resetStatus === 'failed' && <X className="h-4 w-4 shrink-0" />}
          <span>
            {resetStatus === 'resetting' && 'Reset in progress — this may take a few minutes...'}
            {resetStatus === 'success' && 'VM reset successfully. All user-installed software has been removed.'}
            {resetStatus === 'failed' && `Reset failed: ${resetError}`}
          </span>
          {(resetStatus === 'success' || resetStatus === 'failed') && (
            <button onClick={() => setResetStatus('idle')} className="ml-auto shrink-0 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Machine info */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Machine Info</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 text-sm">
          {[
            ['OS', machine.os],
            ['Agent ID', machine.agentId || '—'],
            ['Last Seen', machine.lastSeen ? new Date(machine.lastSeen).toLocaleString() : '—'],
            ['Added', new Date(machine.createdAt).toLocaleString()],
          ].map(([label, val]) => (
            <div key={label}>
              <dt className="text-xs text-gray-400">{label}</dt>
              <dd className="mt-0.5 font-medium text-gray-900 capitalize truncate">{val}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Specs */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">System Specs</h2>
        {specs ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SpecCard icon={Monitor}     label="Hostname"  value={specs.hostname  ?? '—'} />
            <SpecCard icon={Cpu}         label="CPU Cores" value={specs.cpuCores != null ? `${specs.cpuCores} cores` : '—'} />
            <SpecCard icon={MemoryStick} label="RAM"       value={specs.ramGb    != null ? `${specs.ramGb} GB` : '—'} />
            <SpecCard icon={HardDrive}   label="Disk (C:)" value={specs.diskGb   != null ? `${specs.diskGb} GB` : '—'} />
          </div>
        ) : (
          <p className="text-sm text-gray-400">Specs will appear after the next heartbeat (~30s).</p>
        )}
      </div>

      {/* Installation History */}
      {jobs.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <Package className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Installation History</h2>
            <span className="ml-auto text-xs text-gray-400">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Software', 'Status', 'Attempts', 'Updated', 'Logs'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <LiveJobEntry key={j._id} job={j} isAuthenticated={isAuthenticated} onViewLogs={setSelectedJob} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Remote Terminal — tabbed like VS Code */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-950 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-gray-800 overflow-x-auto">
          <div className="flex items-center shrink-0">
            <Terminal className="ml-3 h-3.5 w-3.5 text-green-400 shrink-0" />
          </div>
          <div className="flex items-center flex-1 overflow-x-auto">
            {terminalTabs.map((tab) => (
              <div
                key={tab.id}
                className={`group flex items-center gap-1.5 px-3 py-2.5 text-xs font-mono cursor-pointer border-r border-gray-800 shrink-0 select-none transition-colors ${
                  tab.id === activeTabId
                    ? 'bg-gray-900 text-green-400 border-b-2 border-b-green-400'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/50'
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.running && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />}
                {terminalTabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* Clear active tab */}
          {activeTab.history.length > 0 && (
            <button
              onClick={() => updateTab(activeTabId, { history: [] })}
              className="shrink-0 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-300 transition-colors border-l border-gray-800"
              title="Clear terminal"
            >
              Clear
            </button>
          )}
          {/* + new tab */}
          <button
            onClick={addTab}
            className="shrink-0 px-3 py-2.5 text-gray-500 hover:text-green-400 transition-colors border-l border-gray-800"
            title="New terminal"
          >
            <span className="text-base leading-none">+</span>
          </button>
          {/* offline badge */}
          {machine.status !== 'online' && (
            <span className="shrink-0 mx-2 rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-400">
              Offline
            </span>
          )}
        </div>

        {/* Output area — shows active tab's history */}
        <div className="h-72 overflow-y-auto p-4 font-mono text-xs">
          {activeTab.history.length === 0 && (
            <p className="text-gray-600">Type a PowerShell command below and press Enter or click Run.</p>
          )}
          {activeTab.history.map((entry, i) => (
            <div key={i} className="mb-3">
              <div className="flex items-start gap-2 text-green-400">
                <span className="text-gray-600 text-[10px] mt-0.5 shrink-0">{entry.ts}</span>
                <span className="text-gray-500 shrink-0">PS&gt;</span>
                <pre className="whitespace-pre-wrap break-all text-green-400">{entry.command}</pre>
              </div>
              <pre className={`mt-1 whitespace-pre-wrap break-all leading-relaxed ${entry.exitCode === 0 ? 'text-gray-200' : 'text-red-400'}`}>
                {entry.output || '(no output)'}
              </pre>
            </div>
          ))}
          {activeTab.running && (
            <div className="flex items-center gap-2 text-yellow-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              <span>Running…</span>
            </div>
          )}
          <div ref={terminalBottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex items-start gap-2 border-t border-gray-800 px-4 py-3">
          <span className="mt-1 shrink-0 text-xs text-gray-500 font-mono">PS&gt;</span>
          <textarea
            value={activeTab.input}
            onChange={(e) => updateTab(activeTabId, { input: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleExec();
              }
              if (e.key === 'ArrowUp' && !activeTab.input.includes('\n')) {
                const cmds = activeTab.history.map((h) => h.command);
                const next = Math.min(activeTab.historyIndex + 1, cmds.length - 1);
                updateTab(activeTabId, { historyIndex: next, input: cmds[cmds.length - 1 - next] ?? '' });
              }
              if (e.key === 'ArrowDown' && !activeTab.input.includes('\n')) {
                const cmds = activeTab.history.map((h) => h.command);
                const next = Math.max(activeTab.historyIndex - 1, -1);
                updateTab(activeTabId, { historyIndex: next, input: next === -1 ? '' : (cmds[cmds.length - 1 - next] ?? '') });
              }
            }}
            disabled={activeTab.running || machine.status !== 'online'}
            placeholder={machine.status !== 'online' ? 'Agent is offline' : 'Enter to run · Shift+Enter for new line'}
            rows={activeTab.input.split('\n').length > 3 ? activeTab.input.split('\n').length : Math.max(1, activeTab.input.split('\n').length)}
            className="flex-1 resize-none bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none font-mono disabled:opacity-40 leading-relaxed"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={() => void handleExec()}
            disabled={activeTab.running || !activeTab.input.trim() || machine.status !== 'online'}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-600 disabled:opacity-40"
          >
            {activeTab.running
              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Play className="h-3 w-3" />
            }
            Run
          </button>
        </div>
      </div>

      {/* Install Software */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Install Software</h2>          {selected.length > 0 && (
            <button
              onClick={() => void handleInstall()}
              disabled={installing}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
            >
              {installing
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Installing…</>
                : <><CheckCircle2 className="h-4 w-4" /> Install {selected.length} item{selected.length !== 1 ? 's' : ''}</>
              }
            </button>
          )}
        </div>

        {catalogLoading ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
        ) : compatible.length === 0 ? (
          <p className="text-sm text-gray-400">No software available for {machine.os}.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {compatible.map((sw) => {
              const isSelected = selected.includes(sw._id);
              return (
                <button
                  key={sw._id}
                  type="button"
                  onClick={() => toggle(sw._id)}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isSelected
                      ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div>
                    <p className="font-medium">{sw.name}</p>
                    <p className="text-xs text-gray-400">{sw.version} · {sw.installMethod}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
