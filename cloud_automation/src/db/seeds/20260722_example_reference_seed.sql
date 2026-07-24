-- Example reference-data seed.
-- Add new seed files as: YYYYMMDD_description.sql
-- Prefer idempotent upserts so re-baselines / retries stay safe.
--
-- This file is a no-op template. Replace / add real seeds as needed.
-- Example pattern:
--
-- INSERT INTO public.service_categories (id, name)
-- VALUES (1, 'Compute')
-- ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

SELECT 1;
