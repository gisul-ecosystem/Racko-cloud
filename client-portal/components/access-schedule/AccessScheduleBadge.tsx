'use client';

import { getAccessScheduleStatus, type AccessSchedule } from '@/lib/accessSchedule';

const TONE_CLASS: Record<string, string> = {
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
};

export function AccessScheduleBadge({
  schedule,
  className = '',
}: {
  schedule: AccessSchedule | null | undefined;
  className?: string;
}) {
  const status = getAccessScheduleStatus(schedule);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[status.tone]} ${className}`}
      title={status.reason}
    >
      {status.label}
    </span>
  );
}
