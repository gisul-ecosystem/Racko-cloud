'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { generateGcpConsoleUrl } from '../../../../cloud_automation_gcp/api/managePortalClient';

export default function LaunchConsoleButton({
  requestId,
  userIndex,
  jwtToken,
  suspended,
  servicePeriodBlocked,
  servicePeriodMessage,
  onFeedback,
}) {
  const [loading, setLoading] = useState(false);
  const blocked = suspended || servicePeriodBlocked;

  async function handleLaunch(event) {
    event?.stopPropagation?.();

    if (suspended) {
      onFeedback?.('User is suspended. Reinstate first.');
      return;
    }

    if (servicePeriodBlocked) {
      onFeedback?.(servicePeriodMessage || 'Lab access is not available yet.');
      return;
    }

    setLoading(true);
    onFeedback?.(null);

    try {
      const result = await generateGcpConsoleUrl(requestId, userIndex, jwtToken);
      window.open(result.consoleUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      onFeedback?.(`Failed to launch console: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLaunch}
      disabled={loading || blocked}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-[var(--cloud-accent,#B91C1C)]/30 hover:bg-[var(--cloud-accent-soft,rgba(185,28,28,0.1))] hover:text-[var(--cloud-accent,#B91C1C)] disabled:cursor-not-allowed disabled:opacity-50"
      title={
        servicePeriodBlocked
          ? servicePeriodMessage || 'Lab access is not available yet'
          : 'Open Gcp Console for this user'
      }
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ExternalLink className="h-3.5 w-3.5" />
      )}
      Console
    </button>
  );
}
