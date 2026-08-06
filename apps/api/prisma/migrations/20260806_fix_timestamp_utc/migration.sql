-- Convert all bare TIMESTAMP columns to TIMESTAMP WITH TIME ZONE (UTC)
-- The existing data was stored in IST (+05:30), so we subtract 5h30m to normalize to UTC.

-- workspaces
ALTER TABLE "workspaces"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING ("created_at" - INTERVAL '5 hours 30 minutes'),
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING ("updated_at" - INTERVAL '5 hours 30 minutes');

-- folders
ALTER TABLE "folders"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING ("created_at" - INTERVAL '5 hours 30 minutes'),
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING ("updated_at" - INTERVAL '5 hours 30 minutes');

-- projects
ALTER TABLE "projects"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING ("created_at" - INTERVAL '5 hours 30 minutes'),
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING ("updated_at" - INTERVAL '5 hours 30 minutes');

-- project_sources
ALTER TABLE "project_sources"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING ("created_at" - INTERVAL '5 hours 30 minutes');

-- system_timezones
ALTER TABLE "system_timezones"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING ("created_at" - INTERVAL '5 hours 30 minutes'),
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING ("updated_at" - INTERVAL '5 hours 30 minutes');
