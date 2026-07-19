import { DateTime } from 'luxon';
import {
  formatMinutes,
  getSessionStatsForUser,
  resolveUsageUserId,
} from './usageService.js';
import {
  getConsumedMinutesTodayForUser,
  getDailyLimitHours,
  getRequestTimezone,
  isDailyHourLimitReached,
} from '../utils/usageWindowAccess.js';
import { getUserDailyLimitState } from '../utils/provisionedUsers.js';

export function attachLiveUsageToUsers(request, users) {
  const timezone = getRequestTimezone(request);
  const sessions = request.usageSessions || [];
  const nowInTz = DateTime.now().setZone(timezone);
  const dailyLimitHours = getDailyLimitHours(request, nowInTz);

  const enrichedUsers = users.map((user) => {
    const userId = user.userId || resolveUsageUserId(request, user.userIndex);
    const stats = getSessionStatsForUser(sessions, userId, timezone);
    const consumedToday = getConsumedMinutesTodayForUser(request, userId, timezone);
    const limitReached = isDailyHourLimitReached(request, userId);
    const state = getUserDailyLimitState(request, userId);
    const dailyLimitMinutes = dailyLimitHours != null ? dailyLimitHours * 60 : null;
    const remainingMinutes =
      dailyLimitMinutes != null ? Math.max(0, dailyLimitMinutes - consumedToday) : null;

    return {
      ...user,
      hasActiveSession: stats.hasActiveSession,
      sessionStartedAt: stats.sessionStartedAt,
      lastLoginAt: stats.lastLoginAt,
      totalMinutesSpent: stats.totalMinutesSpent,
      todayMinutes: stats.todayMinutes,
      activeSessionMinutes: stats.activeSessionMinutes,
      usedTodayMinutes: Math.round(consumedToday),
      remainingMinutes: remainingMinutes != null ? Math.round(remainingMinutes) : null,
      dailyLimitHours,
      dailyLimitMinutes,
      dailyLimitReached: Boolean(limitReached || state?.dailyLimitReached),
      todayFormatted: formatMinutes(stats.todayMinutes),
      lifetimeFormatted: formatMinutes(stats.totalMinutesSpent),
    };
  });

  const activeSessions = enrichedUsers.filter((user) => user.hasActiveSession).length;
  const totalMinutesSpent = enrichedUsers.reduce(
    (sum, user) => sum + Number(user.totalMinutesSpent || 0),
    0
  );

  return {
    users: enrichedUsers,
    liveSummary: {
      activeSessions,
      totalMinutesSpent,
    },
  };
}
