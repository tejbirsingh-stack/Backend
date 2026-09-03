-- Phase 2a: per-asset people appearances + scene insights (no face vectors)
CREATE TABLE IF NOT EXISTS "ai_asset_person_appearances" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetId" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "vi_face_id" VARCHAR(100),
  "display_label" VARCHAR(255) NOT NULL,
  "start_ms" INTEGER NOT NULL,
  "end_ms" INTEGER NOT NULL,
  "thumbnail_url" TEXT,
  "ordinal" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_asset_person_appearances_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_asset_person_appearances_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_asset_person_appearances_assetId_idx"
  ON "ai_asset_person_appearances"("assetId");
CREATE INDEX IF NOT EXISTS "ai_asset_person_appearances_orgId_idx"
  ON "ai_asset_person_appearances"("orgId");

CREATE TABLE IF NOT EXISTS "ai_scene_insights" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetId" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "label" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "start_ms" INTEGER NOT NULL,
  "end_ms" INTEGER NOT NULL,
  "confidence" REAL,
  "ordinal" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_scene_insights_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_scene_insights_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_scene_insights_assetId_idx"
  ON "ai_scene_insights"("assetId");
CREATE INDEX IF NOT EXISTS "ai_scene_insights_orgId_idx"
  ON "ai_scene_insights"("orgId");
