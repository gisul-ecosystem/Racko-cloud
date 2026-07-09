import type { OrgAdminUser } from '../types/orgAdmin';

export const LIVE_COST_TICK_MS = 45_000;

export const roundCost = (value: number) => Number(Number(value || 0).toFixed(4));

export function getHourlyRateForUser(user: OrgAdminUser): number {
  return parseFloat(
    String(user.hourlyRate ?? user.hourlyResourceRate ?? 0)
  );
}

/** Recompute live estimate from polled session fields (no API call). */
export function computeClientLiveCost(user: OrgAdminUser, nowMs = Date.now()): number {
  const hourlyRate = getHourlyRateForUser(user);
  if (hourlyRate <= 0) {
    return 0;
  }

  const closedTodayMinutes = Math.max(
    0,
    Math.round(
      user.storedMinsToday ??
        Math.max(
          0,
          Math.round(Number(user.todayMinutes ?? user.usedTodayMinutes ?? 0)) -
            Math.floor(Number(user.activeSessionMinutes ?? user.liveSessionMins ?? 0))
        )
    )
  );

  let activeMinutes = 0;
  if (user.hasActiveSession && user.sessionStartedAt) {
    activeMinutes = Math.max(
      0,
      Math.floor((nowMs - new Date(user.sessionStartedAt).getTime()) / 60_000)
    );
  } else {
    activeMinutes = Math.floor(Number(user.activeSessionMinutes ?? user.liveSessionMins ?? 0));
  }

  const totalMinutes = closedTodayMinutes + activeMinutes;
  if (totalMinutes <= 0) {
    return 0;
  }

  return roundCost((totalMinutes / 60) * hourlyRate);
}

export function getMinutesTodayForDisplay(user: OrgAdminUser, nowMs = Date.now()): number {
  const closedTodayMinutes = Math.max(
    0,
    Math.round(
      user.storedMinsToday ??
        Math.max(
          0,
          Math.round(Number(user.todayMinutes ?? user.usedTodayMinutes ?? 0)) -
            Math.floor(Number(user.activeSessionMinutes ?? user.liveSessionMins ?? 0))
        )
    )
  );

  if (user.hasActiveSession && user.sessionStartedAt) {
    const activeMinutes = Math.max(
      0,
      Math.floor((nowMs - new Date(user.sessionStartedAt).getTime()) / 60_000)
    );
    return closedTodayMinutes + activeMinutes;
  }

  return Math.round(Number(user.todayMinutes ?? user.usedTodayMinutes ?? 0));
}

export function formatSyncedAgo(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) {
    return 'never';
  }

  const diffMs = Math.max(0, nowMs - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}
