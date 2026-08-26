-- Timed transcript + AI job tracking for AssemblyAI Phase 0

CREATE TABLE IF NOT EXISTS "ai_analysis_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'queued',
    "steps" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_analysis_jobs_assetId_key" ON "ai_analysis_jobs"("assetId");
CREATE INDEX IF NOT EXISTS "ai_analysis_jobs_orgId_idx" ON "ai_analysis_jobs"("orgId");
CREATE INDEX IF NOT EXISTS "ai_analysis_jobs_status_idx" ON "ai_analysis_jobs"("status");

DO $$ BEGIN
    ALTER TABLE "ai_analysis_jobs"
        ADD CONSTRAINT "ai_analysis_jobs_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ai_analysis_jobs"
        ADD CONSTRAINT "ai_analysis_jobs_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ai_transcript_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "ai_transcript_segments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_transcript_segments_assetId_idx" ON "ai_transcript_segments"("assetId");
CREATE INDEX IF NOT EXISTS "ai_transcript_segments_orgId_idx" ON "ai_transcript_segments"("orgId");

DO $$ BEGIN
    ALTER TABLE "ai_transcript_segments"
        ADD CONSTRAINT "ai_transcript_segments_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
