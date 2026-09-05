import { Client } from '@langchain/langgraph-sdk';
import { LangGraphBase } from './langgraph-base';

// Frontend client singleton instance
let clientInstance: LangGraphBase | null = null;

/**
 * Creates or returns a singleton instance of the LangGraph client for frontend use.
 * Falls back to http://127.0.0.1:2024 if NEXT_PUBLIC_LANGGRAPH_API_URL is not set.
 */
export const createClient = () => {
  if (clientInstance) {
    return clientInstance;
  }

  const rawUrl =
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || 'http://127.0.0.1:2024';
  const apiUrl = rawUrl.replace('localhost', '127.0.0.1');

  const client = new Client({
    apiUrl,
  });

  clientInstance = new LangGraphBase(client);
  return clientInstance;
};

export const client = createClient();
