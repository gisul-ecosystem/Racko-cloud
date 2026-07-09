-- Cleanup duplicate open usage sessions before applying:
--   src/db/migrations/20260709_one_open_session_per_user.sql
--
-- Problem: Graph sign-in races can leave multiple rows with logout_at IS NULL
-- for the same (request_id, user_id). The partial unique index will fail until
-- at most one open row remains per user per request.
--
-- Strategy (matches runtime endUsageSession — keeps newest open row):
--   1. Preview duplicates
--   2. Backfill kept session login_at to earliest login in the duplicate set
--   3. Close all other open rows at COALESCE(last_seen_at, login_at)
--   4. Verify zero duplicates remain
--
-- Run in psql / Supabase SQL editor. Review Step 1 output before Steps 2–3.

-- =============================================================================
-- Step 1 — Preview duplicate open sessions
-- =============================================================================
SELECT
  us.request_id,
  us.user_id,
  au.username,
  COUNT(*) AS open_session_count,
  MIN(us.login_at) AS earliest_login,
  MAX(us.login_at) AS latest_login,
  ARRAY_AGG(us.id ORDER BY us.login_at) AS session_ids,
  ARRAY_AGG(us.login_at ORDER BY us.login_at) AS login_times
FROM user_usage_sessions us
JOIN azure_users au ON au.id = us.user_id AND au.request_id = us.request_id
WHERE us.logout_at IS NULL
GROUP BY us.request_id, us.user_id, au.username
HAVING COUNT(*) > 1
ORDER BY open_session_count DESC, us.request_id, au.username;

-- Rows to close (everything except newest login_at per group)
WITH ranked AS (
  SELECT
    us.id,
    us.request_id,
    us.user_id,
    au.username,
    us.login_at,
    COALESCE(us.last_seen_at, us.login_at) AS effective_end,
    ROW_NUMBER() OVER (
      PARTITION BY us.request_id, us.user_id
      ORDER BY us.login_at DESC, us.id DESC
    ) AS rn
  FROM user_usage_sessions us
  JOIN azure_users au ON au.id = us.user_id AND au.request_id = us.request_id
  WHERE us.logout_at IS NULL
)
SELECT
  id AS session_id_to_close,
  request_id,
  user_id,
  username,
  login_at,
  effective_end AS proposed_logout_at
FROM ranked
WHERE rn > 1
ORDER BY request_id, user_id, login_at;

-- =============================================================================
-- Step 2 — Apply cleanup (uncomment and run after reviewing Step 1)
-- =============================================================================
/*
BEGIN;

-- 2a. Point the kept (newest) session at the true session start time.
WITH duplicate_groups AS (
  SELECT
    request_id,
    user_id,
    MIN(login_at) AS earliest_login
  FROM user_usage_sessions
  WHERE logout_at IS NULL
  GROUP BY request_id, user_id
  HAVING COUNT(*) > 1
),
keepers AS (
  SELECT DISTINCT ON (us.request_id, us.user_id)
    us.id,
    us.request_id,
    us.user_id,
    dg.earliest_login
  FROM user_usage_sessions us
  JOIN duplicate_groups dg
    ON dg.request_id = us.request_id
   AND dg.user_id = us.user_id
  WHERE us.logout_at IS NULL
  ORDER BY us.request_id, us.user_id, us.login_at DESC, us.id DESC
)
UPDATE user_usage_sessions uus
SET login_at = k.earliest_login
FROM keepers k
WHERE uus.id = k.id
  AND uus.login_at > k.earliest_login;

-- 2b. Close duplicate open rows (keep newest per request_id + user_id).
WITH ranked AS (
  SELECT
    id,
    login_at,
    COALESCE(last_seen_at, login_at) AS effective_end,
    ROW_NUMBER() OVER (
      PARTITION BY request_id, user_id
      ORDER BY login_at DESC, id DESC
    ) AS rn
  FROM user_usage_sessions
  WHERE logout_at IS NULL
),
to_close AS (
  SELECT
    id,
    login_at,
    effective_end
  FROM ranked
  WHERE rn > 1
)
UPDATE user_usage_sessions uus
SET
  logout_at = tc.effective_end,
  minutes_used = GREATEST(
    1,
    FLOOR(EXTRACT(EPOCH FROM (tc.effective_end - uus.login_at)) / 60)
  ),
  ended_reason = COALESCE(uus.ended_reason, 'duplicate_open_session_cleanup')
FROM to_close tc
WHERE uus.id = tc.id;

COMMIT;
*/

-- =============================================================================
-- Step 3 — Verify (must return zero rows before running the migration)
-- =============================================================================
SELECT
  request_id,
  user_id,
  COUNT(*) AS open_session_count
FROM user_usage_sessions
WHERE logout_at IS NULL
GROUP BY request_id, user_id
HAVING COUNT(*) > 1;

-- =============================================================================
-- Step 4 — Apply migration (after Step 3 is clean)
-- =============================================================================
-- \i src/db/migrations/20260709_one_open_session_per_user.sql
-- or paste:
--
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_user
--   ON user_usage_sessions (request_id, user_id)
--   WHERE logout_at IS NULL;
