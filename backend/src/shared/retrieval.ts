import 'dotenv/config';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { createClient } from '@supabase/supabase-js';
import { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseConfigurationAnnotation,
  ensureBaseConfiguration,
} from './configuration.js';
import { getEmbeddings } from './embeddings.js';

// Shared in-memory vector store singleton for zero-config local runs
let memoryStoreSingleton: MemoryVectorStore | null = null;

export function getMemoryVectorStore(): MemoryVectorStore {
  if (!memoryStoreSingleton) {
    const embeddings = getEmbeddings();
    memoryStoreSingleton = new MemoryVectorStore(embeddings);
  }
  return memoryStoreSingleton;
}

export async function makeMemoryRetriever(
  configuration: typeof BaseConfigurationAnnotation.State,
): Promise<VectorStoreRetriever> {
  const store = getMemoryVectorStore();
  return store.asRetriever({
    k: configuration.k || 5,
  });
}

export async function makeSupabaseRetriever(
  configuration: typeof BaseConfigurationAnnotation.State,
): Promise<VectorStoreRetriever> {
  const hasSupabase =
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_URL.includes('YOUR_') &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('YOUR_');

  if (!hasSupabase) {
    console.log(
      'Supabase credentials not found or placeholder; falling back to in-memory vector store.',
    );
    return makeMemoryRetriever(configuration);
  }

  const embeddings = getEmbeddings();
  const supabaseClient = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );
  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents',
  });
  return vectorStore.asRetriever({
    k: configuration.k || 5,
    filter: configuration.filterKwargs,
  });
}

export async function makeRetriever(
  config: RunnableConfig,
): Promise<VectorStoreRetriever> {
  const configuration = ensureBaseConfiguration(config);
  switch (configuration.retrieverProvider) {
    case 'supabase':
      return makeSupabaseRetriever(configuration);
    case 'memory':
      return makeMemoryRetriever(configuration);
    default:
      return makeSupabaseRetriever(configuration);
  }
}
