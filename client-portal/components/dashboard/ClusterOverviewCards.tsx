import { Server, Cpu, MemoryStick, HardDrive, Activity, MonitorCheck } from 'lucide-react';
import type { ClusterOverview } from '../../lib/proxmoxApi';

interface Props {
  overview: ClusterOverview;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'gray';
  bar?: { used: number; total: number };
}

const accentMap: Record<StatCardProps['accent'], { bg: string; icon: string; bar: string }> = {
  green:  { bg: 'bg-green-50',  icon: 'text-green-600',  bar: 'bg-green-500'  },
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   bar: 'bg-blue-500'   },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', bar: 'bg-purple-500' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-600', bar: 'bg-orange-500' },
  red:    { bg: 'bg-red-50',    icon: 'text-red-600',    bar: 'bg-red-500'    },
  gray:   { bg: 'bg-gray-100',  icon: 'text-gray-500',   bar: 'bg-gray-400'   },
};

function barColor(pct: number): string {
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 60) return 'bg-yellow-400';
  return 'bg-green-500';
}

function StatCard({ label, value, sub, icon, accent, bar }: StatCardProps) {
  const a = accentMap[accent];
  const pct = bar ? Math.min(100, Math.round((bar.used / bar.total) * 100)) : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${a.bg} flex items-center justify-center`}>
          <span className={a.icon}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {bar && bar.total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{bar.used.toFixed(1)} GB used</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ClusterOverviewCards({ overview }: Props) {
  const nodeAccent = overview.offlineNodes > 0 ? 'red' : 'green';
  const vmAccent: StatCardProps['accent'] = overview.runningVMs > 0 ? 'blue' : 'gray';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Nodes"
        value={overview.totalNodes}
        sub={`${overview.onlineNodes} online · ${overview.offlineNodes} offline`}
        icon={<Server className="w-4 h-4" />}
        accent={nodeAccent}
      />
      <StatCard
        label="Virtual Machines"
        value={overview.totalVMs}
        sub={`${overview.runningVMs} running · ${overview.stoppedVMs} stopped`}
        icon={<MonitorCheck className="w-4 h-4" />}
        accent={vmAccent}
      />
      <StatCard
        label="CPU Cores"
        value={overview.totalCPUCores}
        sub="Total allocated"
        icon={<Cpu className="w-4 h-4" />}
        accent="purple"
      />
      <StatCard
        label="Activity"
        value={`${overview.runningVMs} / ${overview.totalVMs}`}
        sub="VMs active"
        icon={<Activity className="w-4 h-4" />}
        accent="orange"
      />
      <StatCard
        label="Memory"
        value={`${overview.usedMemoryGB.toFixed(1)} GB`}
        sub={`of ${overview.totalMemoryGB.toFixed(1)} GB total`}
        icon={<MemoryStick className="w-4 h-4" />}
        accent="blue"
        bar={{ used: overview.usedMemoryGB, total: overview.totalMemoryGB }}
      />
      <StatCard
        label="Storage"
        value={`${overview.usedStorageGB.toFixed(1)} GB`}
        sub={`of ${overview.totalStorageGB.toFixed(1)} GB total`}
        icon={<HardDrive className="w-4 h-4" />}
        accent="purple"
        bar={{ used: overview.usedStorageGB, total: overview.totalStorageGB }}
      />
    </div>
  );
}
