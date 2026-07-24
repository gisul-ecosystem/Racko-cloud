'use client';

/**
 * ActivityLogPanel — shows the change log for a machine.
 * Displayed as a collapsible section on the machine detail page.
 * Fetched lazily (only when the user expands the panel).
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Loader2, FileText, HardDrive, Settings, Terminal, List, RefreshCw } from 'lucide-react';
import { fetchActivityLog, type ActivityEvent } from '../../lib/machineManagerApi';
import { ApiError } from '../../lib/apiClient';

// ─── Icon + label per activity type ──────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  file_write:       { label: 'File Write',       icon: FileText,  color: 'text-blue-500 bg-blue-50' },
  file_delete:      { label: 'File Delete',       icon: FileText,  color: 'text-red-500 bg-red-50' },
  file_rename:      { label: 'File Rename',       icon: FileText,  color: 'text-orange-500 bg-orange-50' },
  software_install: { label: 'Software Install',  icon: HardDrive, color: 'text-green-600 bg-green-50' },
  registry_change:  { label: 'Registry Change',   icon: Settings,  color: 'text-purple-500 bg-purple-50' },
  env_var_change:   { label: 'Env Variable',      icon: Terminal,  color: 'text-yellow-600 bg-yellow-50' },
  scheduled_task:   { label: 'Scheduled Task',    icon: List,      color: 'text-gray-600 bg-gray-100' },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, icon: FileText, color: 'text-gray-500 bg-gray-100' };
}

// ─── Summary line per event type ─────────────────────────────────────────────
function eventSummary(event: ActivityEvent): string {
  const p = event.payload;
  switch (event.type) {
    case 'file_write':
    case 'file_delete': {
      const path = (p['path'] as string) ?? '';
      const parts = path.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1] ?? path;
    }
    case 'file_rename':
      return `${(p['oldPath'] as string)?.split('\\').pop() ?? '?'} → ${(p['newPath'] as string)?.split('\\').pop() ?? '?'}`;
    case 'software_install':
      return (p['name'] as string) ?? 'Unknown software';
    case 'registry_change':
      return (p['keyPath'] as string) ?? 'Unknown key';
    case 'env_var_change':
      return `${p['scope'] ?? '?'}\\${p['key'] ?? '?'}`;
    case 'scheduled_task':
      return (p['name'] as string) ?? 'Unknown task';
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}

interface Props {
  machineId: string;
}

export function ActivityLogPanel({ machineId }: Props) {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [events, setEvents]     = useState<ActivityEvent[] | null>(null);
  const [error, setError]       = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchActivityLog(machineId);
      setEvents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  const handleToggle = () => {
    if (!open && events === null) {
      void load();
    }
    setOpen((p) => !p);
  };

  // Group events by type for the summary pill row
  const typeCounts: Record<string, number> = {};
  if (events) {
    for (const e of events) {
      typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <List className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 flex-1">Change Log</span>
        {events !== null && (
          <span className="text-xs text-gray-400">{events.length} event{events.length !== 1 ? 's' : ''}</span>
        )}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        {open
          ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Summary pills + refresh */}
          {events !== null && events.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-5 py-3 border-b border-gray-50">
              {Object.entries(typeCounts).map(([type, count]) => {
                const cfg = typeConfig(type);
                const Icon = cfg.icon;
                return (
                  <span key={type} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                    <Icon className="h-3 w-3" />
                    {count} {cfg.label}
                  </span>
                );
              })}
              <button
                onClick={() => void load()}
                className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          )}

          {/* Empty */}
          {!loading && !error && events !== null && events.length === 0 && (
            <div className="px-5 py-8 text-center">
              <List className="mx-auto mb-2 h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">No changes recorded yet.</p>
              <p className="mt-1 text-xs text-gray-400">
                Changes will appear here as the agent tracks activity on this machine.
              </p>
            </div>
          )}

          {/* Events list */}
          {!loading && !error && events !== null && events.length > 0 && (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {events.map((event) => {
                const cfg = typeConfig(event.type);
                const Icon = cfg.icon;
                const isExpanded = expandedId === event._id;
                const summary = eventSummary(event);

                return (
                  <div key={event._id}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : event._id)}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      {/* Type icon */}
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>

                      {/* Summary */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium text-gray-800" title={summary}>{summary}</p>
                        <p className="text-xs text-gray-400">{cfg.label}</p>
                      </div>

                      {/* Timestamp */}
                      <span className="shrink-0 text-xs text-gray-400">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>

                      {/* Expand chevron */}
                      {isExpanded
                        ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      }
                    </button>

                    {/* Expanded payload */}
                    {isExpanded && (
                      <div className="border-t border-gray-50 bg-gray-50/70 px-5 py-3">
                        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-gray-600 leading-relaxed max-h-48 overflow-y-auto">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
