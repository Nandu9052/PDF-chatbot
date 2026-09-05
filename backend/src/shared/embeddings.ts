import 'dotenv/config';
import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import { pipeline } from '@xenova/transformers';

let pipelinePromise: Promise<any> | null = null;

async function getExtractor() {
  if (!pipelinePromise) {
    pipelinePromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipelinePromise;
}

/**
 * 100% Free, local Transformer embeddings powered by @xenova/transformers.
 * Runs in-process in Node.js (384 dimensions, all-MiniLM-L6-v2).
 * No API key or remote service required.
 */
export class LocalTransformersEmbeddings extends Embeddings {
  constructor(fields?: EmbeddingsParams) {
    super(fields ?? {});
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const extractor = await getExtractor();
    const results: number[][] = [];
    for (const doc of documents) {
      const output = await extractor(doc, {
        pooling: 'mean',
        normalize: true,
      });
      results.push(Array.from(output.data));
    }
    return results;
  }

  async embedQuery(document: string): Promise<number[]> {
    const extractor = await getExtractor();
    const output = await extractor(document, {
      pooling: 'mean',
      normalize: true,
    });
    return Array.from(output.data);
  }
}

/**
 * Helper to get embeddings instance based on environment configuration.
 * Defaults to free local embeddings if OPENAI_API_KEY is not set.
 */
export function getEmbeddings(): Embeddings {
  if (
    process.env.OPENAI_API_KEY &&
    !process.env.OPENAI_API_KEY.includes('YOUR_')
  ) {
    return new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
    });
  }
  return new LocalTransformersEmbeddings();
}
