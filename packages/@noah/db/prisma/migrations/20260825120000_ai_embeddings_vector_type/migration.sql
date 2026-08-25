-- Ensure pgvector is available and ai_embeddings.embedding is vector(1536),
-- not jsonb (which prisma db push creates when the field is typed as Json).

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
  INTO col_type
  FROM pg_attribute a
  JOIN pg_class c ON a.attrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'ai_embeddings'
    AND a.attname = 'embedding'
    AND NOT a.attisdropped;

  IF col_type IS NULL THEN
    ALTER TABLE "ai_embeddings" ADD COLUMN embedding vector(1536) NOT NULL;
  ELSIF col_type LIKE 'vector%' THEN
    NULL;
  ELSE
    -- Regenerable embedding rows; truncate before type change
    TRUNCATE TABLE "ai_embeddings";
    DROP INDEX IF EXISTS "ai_embeddings_embedding_hnsw_idx";
    ALTER TABLE "ai_embeddings" DROP COLUMN embedding;
    ALTER TABLE "ai_embeddings" ADD COLUMN embedding vector(1536) NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ai_embeddings_embedding_hnsw_idx"
  ON "ai_embeddings" USING hnsw ("embedding" vector_cosine_ops);
