'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LastUpdatedProps {
  fetchedAt: string;
  loading: boolean;
  onRefresh: () => void;
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function LastUpdated({ fetchedAt, loading, onRefresh }: LastUpdatedProps) {
  const [label, setLabel] = useState(() => timeAgo(fetchedAt));

  // Update relative time every 15 seconds
  useEffect(() => {
    setLabel(timeAgo(fetchedAt));
    const id = setInterval(() => setLabel(timeAgo(fetchedAt)), 15_000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  return (
    <div className="flex items-center justify-between pt-2 pb-1">
      <p className="text-xs text-gray-400">
        Last updated: <span className="text-gray-500 font-medium">{label}</span>
      </p>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition disabled:opacity-40"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}
