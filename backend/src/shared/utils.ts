import 'dotenv/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { initChatModel } from 'langchain/chat_models/universal';

const SUPPORTED_PROVIDERS = [
  'groq',
  'openai',
  'anthropic',
  'azure_openai',
  'cohere',
  'google-vertexai',
  'google-vertexai-web',
  'google-genai',
  'ollama',
  'together',
  'fireworks',
  'mistralai',
  'bedrock',
  'cerebras',
  'deepseek',
  'xai',
] as const;

/**
 * Load a chat model from a fully specified name.
 * Uses groq/compound by default for real-time web search and live factual accuracy.
 * @param fullySpecifiedName - String in the format 'provider/model' or 'model'.
 * @returns A Promise that resolves to a BaseChatModel instance.
 */
export async function loadChatModel(
  fullySpecifiedName: string = 'groq/openai/gpt-oss-120b',
  temperature: number = 0.0,
): Promise<BaseChatModel> {
  const name = fullySpecifiedName || 'groq/openai/gpt-oss-120b';

  if (
    name.startsWith('groq') ||
    name.startsWith('openai/gpt-oss') ||
    name.startsWith('qwen/') ||
    name.startsWith('llama') ||
    name.startsWith('mixtral')
  ) {
    let groqModel = 'openai/gpt-oss-120b';
    if (name.includes('20b')) {
      groqModel = 'openai/gpt-oss-20b';
    } else if (name.includes('qwen')) {
      groqModel = 'qwen/qwen3.6-27b';
    }

    const groqKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    return new ChatOpenAI({
      model: groqModel,
      apiKey: groqKey,
      configuration: {
        baseURL: 'https://api.groq.com/openai/v1',
      },
      temperature,
    });
  }

  const index = name.indexOf('/');
  if (index === -1) {
    if (
      !SUPPORTED_PROVIDERS.includes(
        name as (typeof SUPPORTED_PROVIDERS)[number],
      )
    ) {
      throw new Error(`Unsupported model: ${name}`);
    }
    return await initChatModel(name, {
      temperature,
    });
  } else {
    const provider = name.slice(0, index);
    const model = name.slice(index + 1);

    if (
      !SUPPORTED_PROVIDERS.includes(
        provider as (typeof SUPPORTED_PROVIDERS)[number],
      )
    ) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    return await initChatModel(model, {
      modelProvider: provider,
      temperature,
    });
  }
}
