import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './state.js';
import { makeRetriever } from '../shared/retrieval.js';
import { formatDocs } from './utils.js';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import {
  DOCUMENT_RESPONSE_PROMPT,
  DIRECT_RESPONSE_PROMPT,
  ROUTER_SYSTEM_PROMPT,
} from './prompts.js';
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

function cleanMessageHistory(messages: any[]): BaseMessage[] {
  if (!Array.isArray(messages)) return [];
  const result: BaseMessage[] = [];
  for (const m of messages) {
    const normalized = normalizeMessage(m);
    if (normalized) {
      result.push(normalized);
    }
  }
  return result;
}

async function checkQueryType(
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<{
  route: 'retrieve' | 'direct';
}> {
  try {
    const model = await loadChatModel('openai/gpt-oss-20b', 0.0);

    const routingPrompt = ROUTER_SYSTEM_PROMPT;
    const formattedPrompt = await routingPrompt.invoke({
      query: state.query,
    });

    const response = await model.invoke(formattedPrompt.toChatMessages());
    const text =
      typeof response.content === 'string' ? response.content.toLowerCase() : '';

    if (text.includes('direct') && !text.includes('retrieve')) {
      return { route: 'direct' };
    }
    return { route: 'retrieve' };
  } catch {
    return { route: 'direct' };
  }
}

async function answerQueryDirectly(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  const userHumanMessage = new HumanMessage({ content: state.query });
  const configuration = ensureAgentConfiguration(config);
  const model = await loadChatModel(configuration.queryModel, 0.1);

  const formattedPrompt = await DIRECT_RESPONSE_PROMPT.invoke({
    question: state.query,
  });
  const promptMessages = formattedPrompt.toChatMessages();
  const systemMsg =
    promptMessages[0] ||
    new SystemMessage({ content: 'You are an accurate, helpful AI assistant.' });

  const cleanedHistory = cleanMessageHistory(state.messages);
  const history = [systemMsg, ...cleanedHistory, userHumanMessage];
  const response = await model.invoke(history);
  const cleanResponse = new AIMessage({
    content: typeof response.content === 'string' ? response.content : String(response.content || ''),
  });
  return { messages: [userHumanMessage, cleanResponse] };
}

async function routeQuery(
  state: typeof AgentStateAnnotation.State,
): Promise<'retrieveDocuments' | 'generateDirectAnswer'> {
  const route = state.route;
  if (!route) {
    return 'retrieveDocuments';
  }

  if (route === 'retrieve') {
    return 'retrieveDocuments';
  } else if (route === 'direct') {
    return 'generateDirectAnswer';
  } else {
    return 'retrieveDocuments';
  }
}

async function retrieveDocuments(
  state: typeof AgentStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> {
  try {
    const retriever = await makeRetriever(config);
    let response = await retriever.invoke(state.query);
    if (!response || response.length === 0) {
      const { getMemoryVectorStore } = await import('../shared/retrieval.js');
      const memoryRetriever = getMemoryVectorStore().asRetriever({ k: 5 });
      response = await memoryRetriever.invoke(state.query);
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
      const response = await memoryRetriever.invoke(state.query);
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
  const configuration = ensureAgentConfiguration(config);
  const context = formatDocs(state.documents);
  const model = await loadChatModel(configuration.queryModel, 0.1);
  const userHumanMessage = new HumanMessage({ content: state.query });

  let systemMsg: any;
  if (context && context.trim().length > 0) {
    const formattedPrompt = await DOCUMENT_RESPONSE_PROMPT.invoke({
      question: state.query,
      context,
    });
    const promptMessages = formattedPrompt.toChatMessages();
    systemMsg = promptMessages[0];
  } else {
    const formattedPrompt = await DIRECT_RESPONSE_PROMPT.invoke({
      question: state.query,
    });
    const promptMessages = formattedPrompt.toChatMessages();
    systemMsg = promptMessages[0];
  }

  const cleanedHistory = cleanMessageHistory(state.messages);
  const messageHistory = [systemMsg, ...cleanedHistory, userHumanMessage];
  const response = await model.invoke(messageHistory);
  const cleanResponse = new AIMessage({
    content: typeof response.content === 'string' ? response.content : String(response.content || ''),
  });

  return { messages: [userHumanMessage, cleanResponse] };
}

const builder = new StateGraph(
  AgentStateAnnotation,
  AgentConfigurationAnnotation,
)
  .addNode('retrieveDocuments', retrieveDocuments)
  .addNode('generateResponse', generateResponse)
  .addNode('checkQueryType', checkQueryType)
  .addNode('generateDirectAnswer', answerQueryDirectly)
  .addEdge(START, 'checkQueryType')
  .addConditionalEdges('checkQueryType', routeQuery, [
    'retrieveDocuments',
    'generateDirectAnswer',
  ])
  .addEdge('retrieveDocuments', 'generateResponse')
  .addEdge('generateResponse', END)
  .addEdge('generateDirectAnswer', END);

export const graph = builder.compile().withConfig({
  runName: 'RetrievalGraph',
});
