-- Ensure request junction tables cascade when a lab request is deleted.
ALTER TABLE request_service_roles
  DROP CONSTRAINT IF EXISTS request_service_roles_request_id_fkey;

ALTER TABLE request_service_roles
  ADD CONSTRAINT request_service_roles_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF to_regclass('public.request_services') IS NOT NULL THEN
    ALTER TABLE request_services
      DROP CONSTRAINT IF EXISTS request_services_request_id_fkey;

    ALTER TABLE request_services
      ADD CONSTRAINT request_services_request_id_fkey
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
  END IF;
END $$;
