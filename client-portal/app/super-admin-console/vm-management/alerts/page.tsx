'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchActiveAlerts, fetchAlertHistory, type NodeAlert } from '../../../../lib/vmApi';
import { ApiError } from '../../../../lib/apiClient';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, History } from 'lucide-react';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';

type Severity = NodeAlert['severity'];
type Resource = NodeAlert['resource'];

const severityConfig: Record<Severity, { label: string; badge: string; dot: string; icon: React.ReactNode }> = {
  warning:  { label: 'Warning',  badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  critical: { label: 'Critical', badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  full:     { label: 'Full',     badge: 'bg-red-100 text-red-700 border-red-200',          dot: 'bg-red-500',    icon: <XCircle className="w-3.5 h-3.5" /> },
};

const resourceLabel: Record<Resource, string> = {
  cpu: 'CPU', ram: 'RAM', storage: 'Storage',
};

function AlertRow({ alert }: { alert: NodeAlert }) {
  const sev = severityConfig[alert.severity];
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <td className="px-6 py-3.5">
        <p className="text-sm font-medium text-gray-900">{alert.node}</p>
        {alert.storagePool && <p className="text-xs text-gray-400">{alert.storagePool}</p>}
      </td>
      <td className="px-4 py-3.5">
        <span className="text-xs font-medium text-gray-700">{resourceLabel[alert.resource]}</span>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${sev.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
          {sev.label}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-20">
            <div
              className={`h-full rounded-full ${
                alert.severity === 'full' ? 'bg-red-500' :
                alert.severity === 'critical' ? 'bg-orange-500' : 'bg-yellow-400'
              }`}
              style={{ width: `${Math.min(100, alert.currentPercent)}%` }}
            />
          </div>
          <span className="text-xs text-gray-600 w-10">{alert.currentPercent.toFixed(1)}%</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">Threshold: {alert.thresholdPercent}%</p>
      </td>
      <td className="px-4 py-3.5">
        {alert.status === 'active' ? (
          <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle className="w-3 h-3" />
            Resolved
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-xs text-gray-400">
        {new Date(alert.createdAt).toLocaleString()}
      </td>
      {alert.resolvedAt && (
        <td className="px-4 py-3.5 text-xs text-gray-400">
          {new Date(alert.resolvedAt).toLocaleString()}
        </td>
      )}
    </tr>
  );
}

export default function AlertsPage() {
  const [activeAlerts, setActiveAlerts] = useState<NodeAlert[]>([]);
  const [history, setHistory] = useState<NodeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadActive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const alerts = await fetchActiveAlerts();
      setActiveAlerts(alerts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const alerts = await fetchAlertHistory(100);
      setHistory(alerts);
    } catch {
      // best-effort
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActive();
    const id = setInterval(() => void loadActive(), 30_000);
    return () => clearInterval(id);
  }, [loadActive]);

  async function handleShowHistory() {
    setShowHistory(true);
    await loadHistory();
  }

  const fullCount = activeAlerts.filter((a) => a.severity === 'full').length;
  const critCount = activeAlerts.filter((a) => a.severity === 'critical').length;
  const warnCount = activeAlerts.filter((a) => a.severity === 'warning').length;

  return (
    <div className="max-w-screen-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Node Alerts</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${activeAlerts.length} active alert${activeAlerts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void handleShowHistory()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <History className="w-3.5 h-3.5" />
            History
          </button>
          <button onClick={loadActive} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Full</p>
            <p className="text-2xl font-bold text-red-700">{fullCount}</p>
          </div>
          <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">Critical</p>
            <p className="text-2xl font-bold text-orange-700">{critCount}</p>
          </div>
          <div className="bg-white border border-yellow-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide mb-1">Warning</p>
            <p className="text-2xl font-bold text-yellow-700">{warnCount}</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Active Alerts</h2>
        </div>
        {loading ? (
          <TableSkeleton rows={3} cols={6} />
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">{error}</div>
        ) : activeAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-gray-500 text-sm font-medium">All clear</p>
            <p className="text-gray-400 text-xs mt-1">No active alerts on any node.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Node', 'Resource', 'Severity', 'Usage', 'Status', 'Triggered'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide first:px-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeAlerts.map((alert) => <AlertRow key={alert._id} alert={alert} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showHistory && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Alert History</h2>
          </div>
          {historyLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No alert history.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Node', 'Resource', 'Severity', 'Usage', 'Status', 'Triggered', 'Resolved'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide first:px-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((alert) => <AlertRow key={alert._id} alert={alert} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
