-- Migration: add_tag_hierarchy_and_project_tags
-- Adds parent/child tag hierarchy and project default tags support.

-- ─────────────────────────────────────────────
-- 1. Extend the `tags` table
-- ─────────────────────────────────────────────

-- Add parentId for self-referencing hierarchy
ALTER TABLE "tags"
  ADD COLUMN IF NOT EXISTS "parent_id" UUID;

-- Add scope: personal | company | project  (default: company — matches existing behaviour)
ALTER TABLE "tags"
  ADD COLUMN IF NOT EXISTS "scope" VARCHAR(20) NOT NULL DEFAULT 'company';

-- Add workspaceId (required when scope = project)
ALTER TABLE "tags"
  ADD COLUMN IF NOT EXISTS "workspace_id" UUID;

-- Add createdById (required when scope = personal)
ALTER TABLE "tags"
  ADD COLUMN IF NOT EXISTS "created_by_id" UUID;

-- Add updatedAt
ALTER TABLE "tags"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- ─────────────────────────────────────────────
-- 2. Foreign keys on `tags`
-- ─────────────────────────────────────────────

-- Self-reference: parent tag must exist in same org (Restrict prevents orphaned children)
ALTER TABLE "tags"
  ADD CONSTRAINT "tags_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- createdBy user
ALTER TABLE "tags"
  ADD CONSTRAINT "tags_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- 3. Drop old unique constraint, add new one
-- ─────────────────────────────────────────────

-- Old: unique per (orgId, name) — too strict; disallows "Episode 5" under two different parents
ALTER TABLE "tags"
  DROP CONSTRAINT IF EXISTS "unique_tag_per_org";

-- New: unique per (orgId, parentId, name)
-- NULLS NOT DISTINCT makes two rows with parent_id = NULL compare equal (PostgreSQL 15+)
-- For older PG, use a partial unique index instead (see comment below).
ALTER TABLE "tags"
  ADD CONSTRAINT "unique_tag_name_per_parent"
  UNIQUE NULLS NOT DISTINCT ("orgId", "parent_id", "name");

-- If your PostgreSQL version is < 15, comment out the constraint above and use this instead:
-- CREATE UNIQUE INDEX IF NOT EXISTS "unique_tag_name_per_parent"
--   ON "tags" ("orgId", "name")
--   WHERE "parent_id" IS NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS "unique_tag_name_per_parent_with_parent"
--   ON "tags" ("orgId", "parent_id", "name")
--   WHERE "parent_id" IS NOT NULL;

-- ─────────────────────────────────────────────
-- 4. Indexes on `tags`
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "tags_parent_id_idx"    ON "tags" ("parent_id");
CREATE INDEX IF NOT EXISTS "tags_scope_idx"        ON "tags" ("scope");
CREATE INDEX IF NOT EXISTS "tags_workspace_id_idx" ON "tags" ("workspace_id");

-- ─────────────────────────────────────────────
-- 5. Create `project_tags` table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "project_tags" (
  "project_id"  TEXT        NOT NULL,
  "tag_id"      UUID        NOT NULL,
  "added_by_id" UUID,
  "addedAt"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "project_tags_pkey" PRIMARY KEY ("project_id", "tag_id"),

  CONSTRAINT "project_tags_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "project_tags_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "project_tags_added_by_id_fkey"
    FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_tags_project_id_idx" ON "project_tags" ("project_id");
CREATE INDEX IF NOT EXISTS "project_tags_tag_id_idx"     ON "project_tags" ("tag_id");
