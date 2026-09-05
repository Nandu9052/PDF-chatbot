-- ============================================================
-- Supabase Setup for AI PDF Chatbot (Groq + Local Embeddings)
-- Run this SQL in your Supabase SQL Editor:
--   https://app.supabase.com -> Your Project -> SQL Editor
-- ============================================================

-- 1. Enable the pgvector extension (required for vector similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Drop existing table if migrating dimensions (optional)
-- DROP TABLE IF EXISTS documents CASCADE;

-- 3. Create the documents table (384-dim for local all-MiniLM embeddings)
CREATE TABLE IF NOT EXISTS documents (
  id        BIGSERIAL PRIMARY KEY,
  content   TEXT,
  metadata  JSONB,
  embedding VECTOR(384)
);

-- 4. Create an index for fast approximate nearest-neighbour search
CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 5. Create the match_documents function used by LangChain's SupabaseVectorStore
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding  VECTOR(384),
  match_count      INT     DEFAULT 5,
  filter           JSONB   DEFAULT '{}'
)
RETURNS TABLE (
  id         BIGINT,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE
    CASE
      WHEN filter::TEXT = '{}' THEN TRUE
      ELSE documents.metadata @> filter
    END
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
