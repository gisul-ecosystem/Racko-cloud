-- Recalculate consumed_minutes from actual closed sessions for today
UPDATE daily_usage_tracking dt
SET consumed_minutes = (
  SELECT COALESCE(SUM(
    COALESCE(
      us.minutes_used,
      EXTRACT(EPOCH FROM (us.logout_at - us.login_at)) / 60
    )
  ), 0)
  FROM user_usage_sessions us
  WHERE us.user_id = dt.azure_user_id
    AND DATE(us.login_at AT TIME ZONE 'Asia/Kolkata') = dt.tracking_date
    AND us.logout_at IS NOT NULL
),
updated_at = NOW()
WHERE dt.tracking_date = CURRENT_DATE;

-- Reset azure_users.used_today_minutes to match closed sessions today
UPDATE azure_users au
SET used_today_minutes = (
  SELECT COALESCE(SUM(
    COALESCE(
      us.minutes_used,
      EXTRACT(EPOCH FROM (us.logout_at - us.login_at)) / 60
    )
  ), 0)::INTEGER
  FROM user_usage_sessions us
  WHERE us.user_id = au.id
    AND DATE(us.login_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
    AND us.logout_at IS NOT NULL
)
WHERE COALESCE(au.is_deleted, FALSE) = FALSE;

-- Verify
SELECT
  au.username,
  au.used_today_minutes,
  dt.consumed_minutes AS daily_tracking_mins,
  (
    SELECT COALESCE(SUM(
      COALESCE(
        us.minutes_used,
        EXTRACT(EPOCH FROM (us.logout_at - us.login_at)) / 60
      )
    ), 0)
    FROM user_usage_sessions us
    WHERE us.user_id = au.id
      AND DATE(us.login_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
      AND us.logout_at IS NOT NULL
  ) AS actual_closed_session_mins
FROM azure_users au
LEFT JOIN daily_usage_tracking dt
  ON dt.azure_user_id = au.id
  AND dt.tracking_date = CURRENT_DATE
WHERE COALESCE(au.is_deleted, FALSE) = FALSE
ORDER BY au.username;
