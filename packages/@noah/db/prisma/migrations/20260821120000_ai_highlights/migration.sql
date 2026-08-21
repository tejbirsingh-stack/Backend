-- GPT-5-mini highlights (summary + tags) per asset

CREATE TABLE IF NOT EXISTS "ai_highlights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_highlights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_highlights_assetId_key" ON "ai_highlights"("assetId");
CREATE INDEX IF NOT EXISTS "ai_highlights_orgId_idx" ON "ai_highlights"("orgId");

DO $$ BEGIN
    ALTER TABLE "ai_highlights"
        ADD CONSTRAINT "ai_highlights_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ai_highlights"
        ADD CONSTRAINT "ai_highlights_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
