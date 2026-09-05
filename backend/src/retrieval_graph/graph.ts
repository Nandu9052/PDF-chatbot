import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './state.js';
import { makeRetriever } from '../shared/retrieval.js';
import { formatDocs, cleanResponseText } from './utils.js';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { SYSTEM_PROMPT } from './prompts.js';
import { RunnableConfig } from '@langchain/core/runnables';
import {
  AgentConfigurationAnnotation,
  ensureAgentConfiguration,
} from './configuration.js';
import { loadChatModel } from '../shared/utils.js';

function normalizeMessage(msg: any): BaseMessage | null {
  if (!msg) return null;

  let content = '';
  if (typeof msg === 'string') {
    content = msg;
  } else if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (typeof msg.kwargs?.content === 'string') {
    content = msg.kwargs.content;
  } else if (typeof msg.text === 'string') {
    content = msg.text;
  } else if (Array.isArray(msg.content)) {
    content = msg.content
      .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
      .join('');
  }

  if (!content || !content.trim()) return null;

  const rawType = (
    msg.type ||
    msg._getType?.() ||
    msg.role ||
    msg.id ||
    ''
  ).toLowerCase();

  if (rawType.includes('human') || rawType.includes('user')) {
    return new HumanMessage({ content: content.trim() });
  } else if (rawType.includes('ai') || rawType.includes('assistant')) {
    return new AIMessage({ content: content.trim() });
  } else if (rawType.includes('system')) {
    return new SystemMessage({ content: content.trim() });
  }

  return new HumanMessage({ content: content.trim() });
}

function cleanMessageHistory(
  messages: any[],
  currentQuery?: string,
): BaseMessage[] {
  if (!Array.isArray(messages)) return [];
  const result: BaseMessage[] = [];
  for (const m of messages) {
    const normalized = normalizeMessage(m);
    if (!normalized) continue;

    // CRITICAL: Filter out any SystemMessages from history so that only ONE SystemMessage is ever at the top
    const type = normalized._getType?.() || (normalized as any).type;
    if (type === 'system') {
      continue;
    }

    // Skip trailing duplicate of the current user question if already recorded in messages
    if (
      currentQuery &&
      type === 'human' &&
      normalized.content.toString().trim() === currentQuery.trim()
    ) {
      continue;
    }

    result.push(normalized);
  }
  return result;
}

async function retrieveDocuments(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const query = state.query ? state.query.trim() : '';
  if (!query) {
    return { documents: [] };
  }

  try {
    const retriever = await makeRetriever(config);
    let response = await retriever.invoke(query);
    if (!response || response.length === 0) {
      const { getMemoryVectorStore } = await import('../shared/retrieval.js');
      const memoryRetriever = getMemoryVectorStore().asRetriever({ k: 5 });
      response = await memoryRetriever.invoke(query);
    }
    return { documents: response || [] };
  } catch (error) {
    console.warn(
      'Error in primary retriever, falling back to memory:',
      (error as Error)?.message,
    );
    try {
      const { getMemoryVectorStore } = await import('../shared/retrieval.js');
      const memoryRetriever = getMemoryVectorStore().asRetriever({ k: 5 });
      const response = await memoryRetriever.invoke(query);
      return { documents: response || [] };
    } catch {
      return { documents: [] };
    }
  }
}

async function generateResponse(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const userQuery = state.query ? state.query.trim() : '';
  const historyHumanMessage = new HumanMessage({
    content: userQuery || 'Hello',
  });

  // Handle empty or whitespace query
  if (!userQuery) {
    const defaultResponse = new AIMessage({
      content: 'Please provide a question about the uploaded document.',
    });
    return { messages: [historyHumanMessage, defaultResponse] };
  }

  const context = formatDocs(state.documents);
  const contextText = context && context.trim() ? context : 'None provided.';

  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.queryModel, 0.0);

  // 1. SystemMessage is ALWAYS the first message
  const systemMessage = new SystemMessage({
    content: SYSTEM_PROMPT,
  });

  // 2. Cleaned conversation history (only HumanMessage and AIMessage, NO SystemMessage)
  const cleanedHistory = cleanMessageHistory(state.messages, userQuery);

  // 3. Current user question with clearly separated retrieved context
  const currentPromptMessage = new HumanMessage({
    content: `RETRIEVED CONTEXT:\n${contextText}\n\nUSER QUESTION:\n${userQuery}`,
  });

  // Strict conceptual order: SystemMessage -> Conversation history -> Current question with context
  const messageSequence = [
    systemMessage,
    ...cleanedHistory,
    currentPromptMessage,
  ];

  const response = await model.invoke(messageSequence);
  const rawContent =
    typeof response.content === 'string'
      ? response.content
      : String(response.content || '');

  // Apply final normalization layer to eliminate any accidental markdown bold, italics, tables, or HTML
  const cleanedContent = cleanResponseText(rawContent);
  const cleanResponse = new AIMessage({
    content: cleanedContent,
  });

  return { messages: [historyHumanMessage, cleanResponse] };
}

const builder = new StateGraph(
  AgentStateAnnotation,
  AgentConfigurationAnnotation,
)
  .addNode('retrieveDocuments', retrieveDocuments)
  .addNode('generateResponse', generateResponse)
  .addEdge(START, 'retrieveDocuments')
  .addEdge('retrieveDocuments', 'generateResponse')
  .addEdge('generateResponse', END);

export const graph = builder.compile().withConfig({
  runName: 'RetrievalGraph',
});
