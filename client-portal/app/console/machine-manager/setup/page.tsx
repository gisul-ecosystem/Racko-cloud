'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';import { useAuth } from '../../../../context/AuthContext';
import { useSoftwareCatalog } from '../../../../hooks/useSoftwareCatalog';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { ApiError } from '../../../../lib/apiClient';
import { getGatewayBaseUrl } from '../../../../lib/gatewayUrl';
import {
  createMachine,
  pushAgentToVMs,
  issuePushStreamTicket,
  openPushStatusStream,
  fetchEnrollmentKey,
  fetchMachines,
  createJobs,
  issueAgentDownloadToken,
  buildPublicDownloadUrl,
  getEnrollmentAgentDownloadUrl,
  type IMachine,
  type MachineOS,
  type VMPushTarget,
  type JobStatus,
} from '../../../../lib/machineManagerApi';
import {
  Monitor, Server, Layers, Download, Check,
  RefreshCw, Plus, Trash2, Loader2, FileUp,
} from 'lucide-react';

// ─── Clipboard helper — works on HTTP and HTTPS ───────────────────────────────
function copyToClipboard(text: string): void {
  if (navigator.clipboard && window.isSecureContext) {
    void navigator.clipboard.writeText(text);
  } else {
    // Fallback for non-HTTPS (HTTP + local IP)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

// ─── Path selector ────────────────────────────────────────────────────────────
type SetupPath = 'physical' | 'vm' | 'template' | null;

function PathSelector({ onSelect }: { onSelect: (p: SetupPath) => void }) {
  const paths = [
    { id: 'physical' as const, icon: Monitor, title: 'Physical Machine', desc: 'Download and run the agent on your laptop, desktop, or any physical machine.' },
    { id: 'vm' as const, icon: Server, title: 'VM', desc: 'Add existing VMs by IP. The platform pushes the agent remotely via SSH/WinRM.' },
    { id: 'template' as const, icon: Layers, title: 'VM Template', desc: 'Bake the agent into a VM template. Every cloned VM auto-registers on first boot.' },
  ];
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Choose setup type</h2>
      <p className="mb-6 text-sm text-gray-500">How do you want to add machines?</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {paths.map(({ id, icon: Icon, title, desc }) => (
          <button key={id} type="button" onClick={() => onSelect(id)}
            className="flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 text-center transition hover:border-[#B91C1C] hover:shadow-md">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
              <Icon className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-8 flex items-center">
      {steps.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${done ? 'bg-[#B91C1C] text-white' : active ? 'border-2 border-[#B91C1C] text-[#B91C1C]' : 'border-2 border-gray-200 text-gray-400'}`}>
                {done ? <Check className="h-4 w-4" /> : num}
              </div>
              <span className={`mt-1.5 text-xs font-medium ${active ? 'text-[#B91C1C]' : done ? 'text-gray-600' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < steps.length - 1 && <div className={`mx-2 h-0.5 flex-1 ${done ? 'bg-[#B91C1C]' : 'bg-gray-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Job status badge ─────────────────────────────────────────────────────────
function JobStatusBadge({ status }: { status: JobStatus }) {
  const cfg: Record<JobStatus, { label: string; dot: string; badge: string }> = {
    pending:    { label: 'Pending',    dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    installing: { label: 'Installing', dot: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-700 border-blue-200' },
    success:    { label: 'Success',    dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 border-green-200' },
    failed:     { label: 'Failed',     dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200' },
    retrying:   { label: 'Retrying',   dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Shared: Install Software step ───────────────────────────────────────────
function SoftwareStep({
  machines, isAuthenticated,
}: {
  machines: IMachine[];
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const { catalog, loading, error, refetch } = useSoftwareCatalog(isAuthenticated);
  const { addToast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);

  const toggle = (id: string) =>
    setSelected((p) => p.includes(id) ? p.filter((s) => s !== id) : [...p, id]);

  const handleInstall = async () => {
    if (!selected.length || !machines.length) return;
    setInstalling(true);
    try {
      await createJobs({ machineIds: machines.map((m) => m._id), softwareIds: selected });
      addToast('success', `${selected.length * machines.length} install job(s) queued.`);
      router.push('/console/machine-manager/jobs');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to queue jobs.');
      setInstalling(false);
    }
  };

  if (error && !loading) return <ErrorState title="Failed to load catalog" message={error} onRetry={refetch} />;
  if (loading) return <TableSkeleton rows={3} cols={3} embedded />;
  if (!catalog.length) return (
    <div className="rounded-lg border border-gray-200 p-10 text-center">
      <p className="text-sm text-gray-400">No software in catalog yet. A super admin must add packages first.</p>
    </div>
  );

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Installing on <span className="font-medium text-gray-900">{machines.length} machine{machines.length !== 1 ? 's' : ''}</span>. Select packages:
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {catalog.map((sw) => {
          const sel = selected.includes(sw._id);
          return (
            <button key={sw._id} type="button" onClick={() => toggle(sw._id)}
              className={`rounded-xl border p-4 text-left transition ${sel ? 'border-[#B91C1C] bg-red-50 ring-1 ring-[#B91C1C]' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{sw.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">v{sw.version} · {sw.installMethod}</p>
                </div>
                {sel && <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B91C1C]"><Check className="h-3 w-3 text-white" /></div>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {sw.supportedOS.map((o) => (
                  <span key={o} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs capitalize text-gray-500">{o}</span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end border-t border-gray-100 pt-5">
        <button onClick={() => void handleInstall()} disabled={!selected.length || installing}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-40">
          {installing && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Install on All Machines
        </button>
      </div>
    </div>
  );
}

// ─── FLOW 1: Physical Machine ─────────────────────────────────────────────────
function PhysicalFlow({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [machine, setMachine] = useState<IMachine | null>(null);
  const [os, setOs] = useState<MachineOS>('windows');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll for machine to come online — gives up after 5 minutes
  const startPolling = useCallback((machineId: string) => {
    setWaiting(true);
    setTimedOut(false);

    intervalRef.current = setInterval(async () => {
      try {
        const all = await fetchMachines();
        const found = all.find((m) => m._id === machineId && m.status === 'online');
        if (found) {
          clearInterval(intervalRef.current!);
          clearTimeout(timeoutRef.current!);
          setMachine(found);
          setWaiting(false);
          setStep(2);
        }
      } catch { /* ignore */ }
    }, 4000);

    // Give up after 5 minutes
    timeoutRef.current = setTimeout(() => {
      clearInterval(intervalRef.current!);
      setWaiting(false);
      setTimedOut(true);
    }, 5 * 60 * 1000);
  }, []);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleCreateAndDownload = async () => {
    if (!name.trim()) { addToast('error', 'Enter a name for this machine.'); return; }
    setCreating(true);
    try {
      // Create machine record to get accountToken
      const m = await createMachine({ name: name.trim(), ipAddress: '0.0.0.0', os });
      setMachine(m);

      // Linux: skip binary download but still start polling for agent connection
      if (os === 'linux') {
        startPolling(m._id);
        return;
      }

      // Issue short-lived download token then navigate browser to download
      const { downloadToken } = await issueAgentDownloadToken(m._id, os);
      window.location.href = buildPublicDownloadUrl(downloadToken) + `&os=${os}`;
      // Start polling for the machine to come online
      startPolling(m._id);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to create machine.');
    } finally {
      setCreating(false);
    }
  };

  const STEPS = ['Download Agent', 'Install Software'];
  const linuxInstallCommand = machine
    ? `curl -fsSL ${getGatewayBaseUrl()}/api/v1/agent/install/linux?token=${machine.accountToken} | sudo bash`
    : '';

  return (
    <div>
      <StepIndicator steps={STEPS} current={step} />

      {step === 1 && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <Monitor className="h-8 w-8 text-[#B91C1C]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Download Agent</h2>
          {os === 'linux' ? (
            <p className="mt-2 text-sm text-gray-500">Copy the command below and run it on your Linux machine.</p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              Name your machine, pick OS, then download. Run the installer — it will ask for your account token.
            </p>
          )}

          {!machine ? (
            <div className="mx-auto mt-6 max-w-sm space-y-4 text-left">
              <div>
                <label className={labelClass}>Machine name <span className="text-red-500">*</span></label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Laptop" />
              </div>
              <div>
                <label className={labelClass}>Operating system</label>
                <select className={inputClass} value={os} onChange={(e) => setOs(e.target.value as MachineOS)}>
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                  <option value="macos">macOS</option>
                </select>
              </div>

              <button onClick={() => void handleCreateAndDownload()} disabled={!name.trim() || creating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717] disabled:opacity-50">
                {creating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Download className="h-4 w-4" />}
                Download Agent
              </button>

              {os === 'windows' && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500 leading-relaxed">
                  Double-click <code className="font-mono">racko-agent.exe</code> → click Yes on UAC prompt → paste your token → click Install.
                </div>
              )}
            </div>
          ) : os === 'linux' ? (
            <div className="mx-auto mt-6 max-w-sm text-left">
              <p className="mb-2 text-xs font-medium text-gray-700">Run this on your Linux machine:</p>
              <div className="flex items-start justify-between gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <code className="select-all break-all font-mono text-xs leading-relaxed text-green-400">
                  {linuxInstallCommand}
                </code>
                <button
                  onClick={() => void navigator.clipboard.writeText(linuxInstallCommand)}
                  className="shrink-0 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 transition hover:bg-gray-600"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Downloads and installs the agent as a systemd service. Requires sudo.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                Waiting for agent to connect...
              </div>
            </div>
          ) : timedOut ? (
            <div className="mt-8 flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <span className="text-2xl">⏱</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Agent didn&apos;t connect within 5 minutes.</p>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-left text-xs text-gray-600 space-y-1">
                <p className="mb-2 font-medium text-gray-700">Check the following:</p>
                <p>• The installer ran successfully and the service is running</p>
                <p>• The token was pasted correctly (no extra spaces)</p>
                <p>• The machine can reach the platform URL</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setTimedOut(false); if (machine) startPolling(machine._id); }}
                  className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717]"
                >
                  Try Again
                </button>
                <button
                  onClick={() => { setWaiting(false); setTimedOut(false); }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Start Over
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center gap-4">
              {machine && (
                <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Account Token</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto rounded border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-900 whitespace-nowrap">
                      {machine.accountToken}
                    </code>
                    <button
                      onClick={() => { copyToClipboard(machine.accountToken); addToast('success', 'Copied!'); }}
                      className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
              <p className="text-sm font-medium text-gray-700">Waiting for agent to connect…</p>
              <p className="text-xs text-gray-400">Run the installer, paste the token above, click Install.</p>
            </div>
          )}
        </div>
      )}

      {step === 2 && machine && (
        <div>
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500"><Check className="h-3.5 w-3.5 text-white" /></div>
            <span className="text-sm font-medium text-green-700">{machine.name} connected</span>
          </div>
          <SoftwareStep machines={[machine]} isAuthenticated={isAuthenticated} />
        </div>
      )}

    </div>
  );
}

// ─── FLOW 2: VM (SSH/WinRM Push) ──────────────────────────────────────────────
function VMFlow({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [vmRows, setVmRows] = useState<VMPushTarget[]>([{ name: '', ipAddress: '', os: 'linux', username: '', password: '' }]);
  const [machines, setMachines] = useState<IMachine[]>([]);
  const [pushing, setPushing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — per-machine live status
  type VMStatus = { pushSuccess?: boolean; pushError?: string; agentConnected: boolean };
  const [vmStatus, setVmStatus] = useState<Record<string, VMStatus>>({});
  const [timeoutReached, setTimeoutReached] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(180);
  const sseRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const PUSH_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

  const connectedMachines = machines.filter((m) => vmStatus[m._id]?.agentConnected);
  const allResolved = machines.length > 0 && machines.every(
    (m) => vmStatus[m._id]?.agentConnected || vmStatus[m._id]?.pushSuccess === false
  );

  // Cleanup SSE + timers
  const cleanup = useCallback(() => {
    sseRef.current?.close();
    sseRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const updateRow = (i: number, field: keyof VMPushTarget, value: string) => {
    setVmRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };
  const addRow = () => setVmRows((p) => [...p, { name: '', ipAddress: '', os: 'linux', username: '', password: '' }]);
  const removeRow = (i: number) => setVmRows((p) => p.filter((_, idx) => idx !== i));

  const downloadSample = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'IP Address', 'OS', 'Username', 'Password'],
      ['Web Server 01', '192.168.1.10', 'windows', 'Administrator', 'YourPassword'],
      ['DB Server', '10.0.0.5', 'linux', 'root', 'YourPassword'],
    ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VMs');
    XLSX.writeFile(wb, 'racko-vms-template.xlsx');
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
      const parsed: VMPushTarget[] = rows
        .filter((r) => r['IP Address']?.trim())
        .map((r) => ({
          name:      (r['Name'] || '').trim(),
          ipAddress: (r['IP Address'] || '').trim(),
          os:        ((r['OS'] || 'linux').toString().toLowerCase().trim()) as MachineOS,
          username:  (r['Username'] || '').trim(),
          password:  (r['Password'] || '').toString().trim(),
        }))
        .filter((r) => r.ipAddress);
      if (!parsed.length) { addToast('error', 'No valid rows found.'); return; }
      setVmRows(parsed);
      addToast('success', `${parsed.length} VM${parsed.length !== 1 ? 's' : ''} loaded.`);
    } catch {
      addToast('error', 'Failed to parse Excel file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePush = async () => {
    const valid = vmRows.filter((r) => r.name.trim() && r.ipAddress.trim() && r.username.trim() && r.password.trim());
    if (!valid.length) { addToast('error', 'Fill in all required fields.'); return; }
    setPushing(true);

    try {
      // Generate a unique session ID for this push batch
      const sessionId = `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Issue SSE stream ticket first (before opening EventSource)
      const { streamToken } = await issuePushStreamTicket(sessionId);

      // Open SSE stream
      const sse = openPushStatusStream(sessionId, streamToken);
      sseRef.current = sse;

      // Start 3-minute countdown
      setSecondsLeft(180);
      setTimeoutReached(false);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(countdownRef.current!);
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      // 3-minute timeout — move forward regardless
      timerRef.current = setTimeout(() => {
        setTimeoutReached(true);
        cleanup();
      }, PUSH_TIMEOUT_MS);

      // Handle SSE events
      sse.onmessage = (e: MessageEvent) => {
        type PushEvent = { type: string; machineId: string; success?: boolean; error?: string; machineName?: string };
        const event = JSON.parse(e.data as string) as PushEvent;
        if (event.type === 'push_result') {
          setVmStatus((prev) => ({
            ...prev,
            [event.machineId]: {
              ...prev[event.machineId],
              pushSuccess: event.success,
              pushError: event.error,
              agentConnected: prev[event.machineId]?.agentConnected ?? false,
            },
          }));
        } else if (event.type === 'agent_connected') {
          setVmStatus((prev) => ({
            ...prev,
            [event.machineId]: {
              ...prev[event.machineId],
              pushSuccess: prev[event.machineId]?.pushSuccess ?? true,
              agentConnected: true,
            },
          }));
        }
      };

      sse.onerror = () => {
        // SSE connection closed by server after stream ends — normal
        sse.close();
      };

      // Trigger the actual push (runs in parallel with SSE receiving events)
      const result = await pushAgentToVMs(valid, sessionId);
      setMachines(result.machines);

      // Initialize status map for all machines
      setVmStatus(Object.fromEntries(result.machines.map((m) => [m._id, { agentConnected: false }])));

      // Move to step 2 immediately after push API responds
      setStep(2);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to push agent.');
      cleanup();
    } finally {
      setPushing(false);
    }
  };

  const handleContinue = () => {
    cleanup();
    setStep(3);
  };

  const STEPS = ['Add VMs', 'Connection Status', 'Install Software'];

  return (
    <div>
      <StepIndicator steps={STEPS} current={step} />

      {/* ── Step 1: Enter VMs ── */}
      {step === 1 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Add VMs</h2>
          <p className="mb-5 text-sm text-gray-500">Enter VM details. The platform will SSH/WinRM into each VM and install the agent automatically.</p>

          <div className="mb-4 flex items-center gap-2">
            <button type="button" onClick={() => void downloadSample()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> Download Sample Excel
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">
              <FileUp className="h-3.5 w-3.5" /> Upload Excel
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => void handleExcelUpload(e)} />
          </div>

          <div className="space-y-3">
            {vmRows.map((row, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-5">
                <div><label className={labelClass}>Name *</label>
                  <input className={inputClass} value={row.name} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="Web Server 01" /></div>
                <div><label className={labelClass}>IP Address *</label>
                  <input className={inputClass} value={row.ipAddress} onChange={(e) => updateRow(i, 'ipAddress', e.target.value)} placeholder="192.168.1.10" /></div>
                <div><label className={labelClass}>OS</label>
                  <select className={inputClass} value={row.os} onChange={(e) => updateRow(i, 'os', e.target.value as MachineOS)}>
                    <option value="linux">Linux</option>
                    <option value="windows">Windows</option>
                    <option value="macos">macOS</option>
                  </select></div>
                <div><label className={labelClass}>Username *</label>
                  <input className={inputClass} value={row.username} onChange={(e) => updateRow(i, 'username', e.target.value)} placeholder="root" /></div>
                <div className="relative"><label className={labelClass}>Password *</label>
                  <input className={inputClass} type="password" value={row.password} onChange={(e) => updateRow(i, 'password', e.target.value)} placeholder="••••••••" />
                  {vmRows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="absolute right-2 top-7 text-gray-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button onClick={addRow} className="inline-flex items-center gap-1.5 text-sm text-[#B91C1C] hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add another VM
            </button>
          </div>

          <div className="mt-6 flex justify-end border-t border-gray-100 pt-5">
            <button onClick={() => void handlePush()} disabled={pushing}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50">
              {pushing && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Push Agent to All VMs
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Live Connection Status ── */}
      {step === 2 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Connection Status</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {timeoutReached
                  ? 'Timed out after 3 minutes.'
                  : allResolved
                  ? 'All VMs have reported a status.'
                  : `Waiting for agents to connect… ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} remaining`
                }
              </p>
            </div>
            {!timeoutReached && !allResolved && (
              <button onClick={handleContinue}
                className="text-sm text-gray-400 hover:text-gray-700 underline">
                Skip waiting
              </button>
            )}
          </div>

          {/* Progress bar */}
          {!timeoutReached && !allResolved && (
            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-[#B91C1C] transition-all duration-1000"
                style={{ width: `${((180 - secondsLeft) / 180) * 100}%` }}
              />
            </div>
          )}

          {/* Summary chips */}
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {connectedMachines.length} connected
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {machines.filter((m) => vmStatus[m._id]?.pushSuccess === false).length} push failed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
              {machines.filter((m) => vmStatus[m._id]?.pushSuccess !== false && !vmStatus[m._id]?.agentConnected).length} connecting
            </span>
          </div>

          {/* Per-VM table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Machine', 'IP', 'Push', 'Agent'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => {
                  const st = vmStatus[m._id];
                  return (
                    <tr key={m._id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.ipAddress}</td>
                      <td className="px-4 py-3">
                        {st?.pushSuccess === undefined ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" /> Pushing…
                          </span>
                        ) : st.pushSuccess ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                            <Check className="h-3.5 w-3.5" /> Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600" title={st.pushError}>
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            Failed{st.pushError ? ` — ${st.pushError.slice(0, 40)}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {st?.agentConnected ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                            <Check className="h-3.5 w-3.5" /> Connected
                          </span>
                        ) : st?.pushSuccess === false ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" /> Waiting…
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
            <p className="text-xs text-gray-400">
              {connectedMachines.length > 0
                ? `${connectedMachines.length} machine${connectedMachines.length !== 1 ? 's' : ''} will receive software in the next step.`
                : 'No machines connected yet.'}
            </p>
            <button
              onClick={handleContinue}
              disabled={connectedMachines.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-40"
            >
              Continue with {connectedMachines.length} VM{connectedMachines.length !== 1 ? 's' : ''} →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Install Software ── */}
      {step === 3 && (
        <div>
          {connectedMachines.length > 0 ? (
            <>
              <div className="mb-5 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-medium text-green-700">
                  {connectedMachines.length} VM{connectedMachines.length !== 1 ? 's' : ''} connected and ready
                </span>
              </div>
              <SoftwareStep machines={connectedMachines} isAuthenticated={isAuthenticated} />
            </>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500">No machines connected. Go to <a href="/console/machine-manager/machines" className="text-[#B91C1C] hover:underline">My Machines</a> to manage your VMs.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FLOW 3: VM Template ──────────────────────────────────────────────────────
function TemplateFlow({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [loadingKey, setLoadingKey] = useState(true);
  const [os, setOs] = useState<MachineOS>('windows');
  const [enrolledMachines, setEnrolledMachines] = useState<IMachine[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchEnrollmentKey()
      .then(setEnrollmentKey)
      .catch(() => addToast('error', 'Failed to load enrollment key.'))
      .finally(() => setLoadingKey(false));
  }, [addToast]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const startPollingForEnrolled = () => {
    intervalRef.current = setInterval(async () => {
      try {
        const all = await fetchMachines();
        const newMachines = all.filter((m) => m.status === 'online' && !seenIdsRef.current.has(m._id));
        if (newMachines.length > 0) {
          newMachines.forEach((m) => seenIdsRef.current.add(m._id));
          setEnrolledMachines((prev) => [...prev, ...newMachines]);
        }
      } catch { /* ignore */ }
    }, 4000);
  };

  const handleDownload = () => {
    window.location.href = getEnrollmentAgentDownloadUrl(os);
    startPollingForEnrolled();
  };

  const STEPS = ['Download Template Agent', 'Enrolled Machines', 'Install Software'];

  return (
    <div>
      <StepIndicator steps={STEPS} current={step} />

      {step === 1 && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <Layers className="h-8 w-8 text-[#B91C1C]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Download Template Agent</h2>
          <p className="mt-2 text-sm text-gray-500">
            This agent has your enrollment key baked in. Install it on one VM, make it a template,
            then clone as many VMs as you want — each one auto-registers when it boots.
          </p>

          <div className="mx-auto mt-6 max-w-sm space-y-4">
            {/* Enrollment key display */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Your Enrollment Key</p>
              {loadingKey ? (
                <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
              ) : (
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate text-sm font-mono text-gray-900">{enrollmentKey}</code>
                  <button onClick={() => { void navigator.clipboard.writeText(enrollmentKey); addToast('success', 'Copied!'); }}
                    className="text-xs text-[#B91C1C] hover:underline shrink-0">Copy</button>
                </div>
              )}
              <p className="mt-1.5 text-xs text-gray-400">For reference only — it&apos;s already baked into the download.</p>
            </div>

            <div>
              <label className={labelClass}>Target OS</label>
              <select className={inputClass} value={os} onChange={(e) => setOs(e.target.value as MachineOS)}>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
                <option value="macos">macOS</option>
              </select>
            </div>

            <button onClick={handleDownload} disabled={loadingKey}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717] disabled:opacity-50">
              <Download className="h-4 w-4" />
              Download Template Agent
            </button>

            <p className="text-xs text-gray-400">
              After installing on your base VM, convert it to a template. Once you start cloning and booting VMs, they will appear below automatically.
            </p>

            <button onClick={() => setStep(2)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
              I&apos;ve done this — see enrolled machines →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Enrolled Machines</h2>
          <p className="mb-4 text-sm text-gray-500">
            Machines appear here as cloned VMs boot and the agent registers. Polling every 4 seconds.
          </p>

          {enrolledMachines.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
              <p className="text-sm text-gray-500">Waiting for VMs to boot and register…</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {enrolledMachines.map((m) => (
                <div key={m._id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.ipAddress} · {m.os}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                    <Check className="h-4 w-4" /> Online
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-gray-100 pt-5">
            <button onClick={() => setStep(3)} disabled={enrolledMachines.length === 0}
              className="rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-40">
              Install Software on These Machines →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <SoftwareStep machines={enrolledMachines} isAuthenticated={isAuthenticated} />
      )}

    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────
export default function SetupWizardPage() {
  const { isAuthenticated } = useAuth();
  const { toasts, addToast, dismiss } = useToast();
  const [path, setPath] = useState<SetupPath>(null);

  return (
    <div className="max-w-3xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Setup Wizard</h1>
        <p className="mt-0.5 text-sm text-gray-500">Choose how you want to add and manage machines.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {!path && <PathSelector onSelect={setPath} />}

        {path && (
          <div>
            <button onClick={() => setPath(null)}
              className="mb-5 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
              ← Change setup type
            </button>

            {path === 'physical' && <PhysicalFlow isAuthenticated={isAuthenticated} />}
            {path === 'vm' && <VMFlow isAuthenticated={isAuthenticated} />}
            {path === 'template' && <TemplateFlow isAuthenticated={isAuthenticated} />}
          </div>
        )}
      </div>
    </div>
  );
}
