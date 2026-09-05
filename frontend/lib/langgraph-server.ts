import { Client } from '@langchain/langgraph-sdk';
import { LangGraphBase } from './langgraph-base';

// Server client singleton instance
let clientInstance: LangGraphBase | null = null;

/**
 * Creates or returns a singleton instance of the LangGraph client for server-side use.
 * LANGCHAIN_API_KEY is optional — only needed for LangSmith tracing or cloud deployments.
 */
export const createServerClient = () => {
  if (clientInstance) {
    return clientInstance;
  }

  const rawUrl =
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || 'http://127.0.0.1:2024';
  const apiUrl = rawUrl.replace('localhost', '127.0.0.1');

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add the API key header when it is actually set (optional for local dev)
  if (process.env.LANGCHAIN_API_KEY) {
    defaultHeaders['X-Api-Key'] = process.env.LANGCHAIN_API_KEY;
  }

  const client = new Client({
    apiUrl,
    defaultHeaders,
  });

  clientInstance = new LangGraphBase(client);
  return clientInstance;
};

// Export all methods from the base class instance
export const langGraphServerClient = createServerClient();
