-- Timed transcript + AI job tracking for AssemblyAI Phase 0

CREATE TABLE "ai_analysis_jobs" (
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

CREATE UNIQUE INDEX "ai_analysis_jobs_assetId_key" ON "ai_analysis_jobs"("assetId");
CREATE INDEX "ai_analysis_jobs_orgId_idx" ON "ai_analysis_jobs"("orgId");
CREATE INDEX "ai_analysis_jobs_status_idx" ON "ai_analysis_jobs"("status");

ALTER TABLE "ai_analysis_jobs"
    ADD CONSTRAINT "ai_analysis_jobs_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_analysis_jobs"
    ADD CONSTRAINT "ai_analysis_jobs_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_transcript_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "ai_transcript_segments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_transcript_segments_assetId_idx" ON "ai_transcript_segments"("assetId");
CREATE INDEX "ai_transcript_segments_orgId_idx" ON "ai_transcript_segments"("orgId");

ALTER TABLE "ai_transcript_segments"
    ADD CONSTRAINT "ai_transcript_segments_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
