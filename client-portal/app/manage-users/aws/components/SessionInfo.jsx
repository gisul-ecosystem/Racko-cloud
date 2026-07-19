'use client';

import { useEffect, useState } from 'react';

export default function SessionInfo({ requestId, userIndex, jwtToken }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const response = await fetch(
          `/api/v1/cloud-automation-aws/manage/aws/request/${requestId}/users/${userIndex}/sessions`,
          { headers: { Authorization: `Bearer ${jwtToken}` } }
        );
        const data = await response.json();
        if (!cancelled) {
          setStats(data.stats);
        }
      } catch {
        // ignore polling errors
      }
    }

    void loadStats();
    const intervalId = window.setInterval(() => {
      void loadStats();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [requestId, userIndex, jwtToken]);

  if (!stats) {
    return <span className="text-xs text-gray-400">Loading...</span>;
  }

  return (
    <div className="text-xs">
      <div className="mb-1">
        {stats.activeSession ? (
          <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
            🟢 Active session
          </span>
        ) : (
          <span className="text-gray-500">⚫ No active session</span>
        )}
      </div>
      <div className="text-gray-500">Sessions: {stats.totalSessions}</div>
      {stats.lastSessionAt && (
        <div className="text-gray-500">
          Last: {new Date(stats.lastSessionAt).toLocaleString()}
        </div>
      )}
      {stats.activeSession?.expiresAt && (
        <div className="font-semibold text-green-700">
          Expires: {new Date(stats.activeSession.expiresAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
