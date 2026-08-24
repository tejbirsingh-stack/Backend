-- OpenAI embeddings (text-embedding-3-small, 1536 dims) for hybrid search

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "ai_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assetId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "start_ms" INTEGER,
    "end_ms" INTEGER,
    "embedding" vector(1536) NOT NULL,

    CONSTRAINT "ai_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_embeddings_assetId_idx" ON "ai_embeddings"("assetId");
CREATE INDEX IF NOT EXISTS "ai_embeddings_orgId_idx" ON "ai_embeddings"("orgId");

CREATE INDEX IF NOT EXISTS "ai_embeddings_embedding_hnsw_idx"
    ON "ai_embeddings" USING hnsw ("embedding" vector_cosine_ops);

DO $$ BEGIN
    ALTER TABLE "ai_embeddings"
        ADD CONSTRAINT "ai_embeddings_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ai_embeddings"
        ADD CONSTRAINT "ai_embeddings_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
