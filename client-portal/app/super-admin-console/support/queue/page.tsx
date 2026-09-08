'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  RotateCw,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchSupportQueue,
  type SupportQueueAgent,
  type SupportQueueOverview,
} from '@/lib/supportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { StatCardSkeleton } from '@/components/dashboard/LoadingSkeleton';

function formatRelativeTime(value: Date): string {
  const diffMs = Date.now() - value.getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 10) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 1) return 'Less than a minute ago';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return value.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function loadBarColor(pct: number): string {
  if (pct > 80) return 'bg-red-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-green-500';
}

function QueueSkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <StatCardSkeleton />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function AgentDistributionCard({
  agent,
  maxOpen,
}: {
  agent: SupportQueueAgent;
  maxOpen: number;
}) {
  const loadPct = maxOpen > 0 ? Math.round((agent.openTicketCount / maxOpen) * 100) : 0;
  const barWidth = maxOpen > 0 ? loadPct : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{agent.name}</p>
            {agent.isNext ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Next up
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">{agent.email}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{agent.openTicketCount}</p>
          <p className="text-xs text-gray-500">open tickets</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>Workload</span>
          <span>{maxOpen > 0 ? `${loadPct}% of max` : 'No open tickets'}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all ${maxOpen > 0 ? loadBarColor(loadPct) : ''}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      <Link
        href={`/super-admin-console/support/tickets?assigneeId=${agent._id}`}
        className="mt-4 inline-block text-sm font-medium text-[#B91C1C] hover:underline"
      >
        View tickets →
      </Link>
    </div>
  );
}

export default function SupportQueueOverviewPage() {
  const [queue, setQueue] = useState<SupportQueueOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);
  const [, setTick] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await fetchSupportQueue();
      setQueue(data);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load queue overview.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const nextAgent = useMemo(
    () => queue?.agents.find((agent) => agent.isNext) ?? null,
    [queue]
  );

  const maxOpen = useMemo(
    () => Math.max(0, ...(queue?.agents ?? []).map((agent) => agent.openTicketCount)),
    [queue]
  );

  if (loading && !queue) {
    return <QueueSkeleton />;
  }

  if (error && !queue) {
    return (
      <div className="mx-auto max-w-screen-xl">
        <ErrorState title="Failed to load queue" message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!queue) return null;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link href="/super-admin-console/support" className="hover:text-[#B91C1C] hover:underline">
          Support
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="font-medium text-gray-900">Queue Overview</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Queue Overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            Round-robin assignment state and agent workload distribution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lastRefreshed ? (
            <span className="text-sm text-gray-500">
              Last updated {formatRelativeTime(lastRefreshed)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-[#B91C1C] hover:text-[#B91C1C] disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <RotateCw className="h-5 w-5 text-[#B91C1C]" />
          <h2 className="text-lg font-semibold text-gray-900">Queue State</h2>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Total Assigned
            </p>
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {queue.totalAssigned.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Agent Count
            </p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{queue.agentCount}</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Next Up</p>
          {nextAgent ? (
            <>
              <p className="mt-2 text-lg font-semibold text-gray-900">{nextAgent.name}</p>
              <p className="text-sm text-gray-600">{nextAgent.email}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-900">
              No active agents in the queue. Add support agents to enable round-robin assignment.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Agent distribution</h2>
        {queue.agents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
            No support agents configured.{' '}
            <Link
              href="/super-admin-console/support/agents"
              className="font-medium text-[#B91C1C] hover:underline"
            >
              Add agents
            </Link>{' '}
            to populate the queue.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {queue.agents.map((agent) => (
              <AgentDistributionCard key={String(agent._id)} agent={agent} maxOpen={maxOpen} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setInfoOpen((open) => !open)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <h2 className="text-base font-semibold text-gray-900">How the queue works</h2>
          <ChevronDown
            className={`h-5 w-5 text-gray-400 transition ${infoOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {infoOpen ? (
          <div className="border-t border-gray-100 px-5 pb-5 pt-2 text-sm leading-relaxed text-gray-600">
            <p>
              When a ticket is escalated from a tenant or submitted directly, the system picks the
              next active support agent in rotation. Agents are ordered by their account creation
              date (_id). The queue pointer advances atomically on each assignment, so concurrent
              tickets never get assigned to the same agent twice.
            </p>
            <p className="mt-3">
              Manual reassignments by admins do not affect the queue pointer — the rotation continues
              from where it left off.
            </p>
            <p className="mt-3">
              Adding or removing agents takes effect immediately. The modulo calculation
              automatically adjusts: next = (lastIndex + 1) % agentCount.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
