import type { AssignmentSchedulePublic, ExternalVmAssignmentSummary } from './externalVmApi';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatAssignmentSchedule(
  schedule: AssignmentSchedulePublic | null | undefined
): string {
  if (!schedule) return 'Always on';
  const from = String(schedule.effectiveFrom).slice(0, 10);
  const to = schedule.effectiveTo ? String(schedule.effectiveTo).slice(0, 10) : '∞';
  const days = (schedule.daysOfWeek ?? []).map((d) => DAY[d] ?? d).join(',');
  return `${from}→${to} · ${days} · ${schedule.dailyStart}–${schedule.dailyEnd} (${schedule.timezone})`;
}

export function formatAssignmentHolders(assignments: ExternalVmAssignmentSummary[] | undefined): {
  labels: string[];
  schedules: string[];
} {
  if (!assignments?.length) {
    return { labels: ['Unassigned'], schedules: ['—'] };
  }
  return {
    labels: assignments.map(
      (a) => a.email ?? a.username ?? a.userId ?? a.tenantUserId ?? 'Unknown'
    ),
    schedules: assignments.map((a) => formatAssignmentSchedule(a.schedule)),
  };
}
