'use client';

import { useState } from 'react';
import { Loader2, Power, RefreshCw, ToggleLeft } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import type { CatalogVmPowerAction } from '../../lib/vmCatalogApi';

const POWER_BUTTONS = [
  {
    action: 'virtualizor' as const,
    label: 'Enable virtualization',
    tone: 'bg-slate-600 hover:bg-slate-700',
    icon: ToggleLeft,
  },
  {
    action: 'start' as const,
    label: 'Start',
    tone: 'bg-emerald-500 hover:bg-emerald-600',
    icon: Power,
  },
  {
    action: 'stop' as const,
    label: 'Stop',
    tone: 'bg-red-500 hover:bg-red-600',
    icon: Power,
  },
  {
    action: 'reboot' as const,
    label: 'Restart',
    tone: 'bg-blue-500 hover:bg-blue-600',
    icon: RefreshCw,
  },
] as const;

function successMessage(action: CatalogVmPowerAction): string {
  switch (action) {
    case 'virtualizor':
      return 'Opened virtualization panel.';
    case 'start':
      return 'Start requested.';
    case 'stop':
      return 'Stop requested.';
    case 'reboot':
      return 'Restart requested.';
    default:
      return 'Power action completed.';
  }
}

export function CatalogVmPowerControls({
  vmId,
  instanceId,
  disabled,
  onPowerAction,
}: {
  vmId: string;
  instanceId?: string;
  disabled?: boolean;
  onPowerAction: (
    id: string,
    action: CatalogVmPowerAction,
    instanceId?: string
  ) => Promise<{ action: CatalogVmPowerAction; panelUrl?: string }>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  const rowKey = instanceId ? `${vmId}:${instanceId}` : vmId;

  async function handleClick(action: CatalogVmPowerAction) {
    setBusyKey(`${rowKey}:${action}`);
    setFeedback(null);
    try {
      const result = await onPowerAction(vmId, action, instanceId);
      if (action === 'virtualizor' && result.panelUrl) {
        window.open(result.panelUrl, '_blank', 'noopener,noreferrer');
      }
      setFeedback({ tone: 'success', message: successMessage(action) });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err instanceof ApiError ? err.message : `${action} failed.`,
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Power controls</p>
      <div className="flex flex-wrap items-center gap-2">
        {POWER_BUTTONS.map((btn) => {
          const busy = busyKey === `${rowKey}:${btn.action}`;
          const Icon = btn.icon;
          return (
            <button
              key={btn.action}
              type="button"
              disabled={disabled || Boolean(busyKey)}
              onClick={() => void handleClick(btn.action)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              title={btn.label}
            >
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${btn.tone}`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                <span className="text-[11px]">{btn.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {feedback ? (
        <p
          className={`text-xs ${feedback.tone === 'success' ? 'text-green-700' : 'text-red-600'}`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
