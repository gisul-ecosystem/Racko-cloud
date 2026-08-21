import { AlertCircle, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';

export interface ResetMachineStatus {
  inventoryId: string;
  vmLabel: string;
  status: 'pending' | 'resetting' | 'success' | 'failed' | 'offline';
  error?: string;
  completedAt?: number;
}

interface ResetProgressModalProps {
  isOpen: boolean;
  machines: ResetMachineStatus[];
  onClose: () => void;
  isStreaming: boolean;
  acceptedCount: number;
  offlineCount: number;
}

export function ResetProgressModal(props: ResetProgressModalProps) {
  if (!props.isOpen) return null;

  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'text-gray-500',
      bg: 'bg-gray-100',
      label: 'Pending',
    },
    resetting: {
      icon: RotateCcw,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
      label: 'Resetting',
    },
    success: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-100',
      label: 'Success',
    },
    failed: {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-100',
      label: 'Failed',
    },
    offline: {
      icon: AlertCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
      label: 'Offline',
    },
  };

  const completedCount = props.machines.filter(
    (m) => m.status === 'success' || m.status === 'failed' || m.status === 'offline'
  ).length;
  const totalCount = props.machines.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reset VM Progress</h2>
              <p className="mt-1 text-sm text-gray-500">
                {completedCount} of {totalCount} completed
              </p>
            </div>
            {!props.isStreaming && (
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Machine List */}
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            {props.machines.map((machine) => {
              const config = statusConfig[machine.status];
              const Icon = config.icon;

              return (
                <div
                  key={machine.inventoryId}
                  className={`flex items-start gap-3 rounded-lg border border-gray-200 p-3 ${config.bg}`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{machine.vmLabel}</p>
                        <p className="text-xs text-gray-500">{machine.inventoryId}</p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-medium text-gray-600">
                        {config.label}
                      </span>
                    </div>
                    {machine.error && (
                      <p className="mt-1 text-xs text-red-700">{machine.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Summary */}
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-gray-600">
                <span className="font-medium text-green-700">{props.acceptedCount}</span> accepted
              </p>
              <p className="text-gray-600">
                <span className="font-medium text-amber-700">{props.offlineCount}</span> offline
              </p>
            </div>
            {props.isStreaming && (
              <p className="text-xs text-gray-500 animate-pulse">Monitoring progress...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
