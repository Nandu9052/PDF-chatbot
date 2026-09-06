import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/langgraph-server';
import { retrievalAssistantStreamConfig } from '@/constants/graphConfigs';

export async function POST(req: Request) {
  try {
    const { message, threadId } = await req.json();

    if (!message) {
      return new NextResponse(
        JSON.stringify({ error: 'Message is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (!threadId) {
      return new NextResponse(
        JSON.stringify({ error: 'Thread ID is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (!process.env.LANGGRAPH_RETRIEVAL_ASSISTANT_ID) {
      return new NextResponse(
        JSON.stringify({
          error:
            'LANGGRAPH_RETRIEVAL_ASSISTANT_ID is not set in environment variables',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    try {
      const assistantId = process.env.LANGGRAPH_RETRIEVAL_ASSISTANT_ID;
      const serverClient = createServerClient();

      let activeThreadId = threadId;
      try {
        await serverClient.client.threads.get(threadId);
      } catch {
        try {
          const newThread = await serverClient.client.threads.create({
            thread_id: threadId,
          });
          activeThreadId = newThread.thread_id;
        } catch {
          const newThread = await serverClient.client.threads.create();
          activeThreadId = newThread.thread_id;
        }
      }

      const stream = await serverClient.client.runs.stream(
        activeThreadId,
        assistantId,
        {
          input: { query: message },
          streamMode: ['messages', 'updates', 'values'],
          multitaskStrategy: 'rollback',
          config: {
            configurable: {
              ...retrievalAssistantStreamConfig,
            },
          },
        },
      );

      // Set up response as a stream
      const encoder = new TextEncoder();
      const customReadable = new ReadableStream({
        async start(controller) {
          try {
            // Forward each chunk from the graph to the client
            for await (const chunk of stream) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
              );
            }
          } catch (error: any) {
            console.error('Streaming error during graph execution:', error);
            const errorMessage =
              error?.message ||
              'Streaming error occurred during graph execution';
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  event: 'error',
                  data: { message: errorMessage },
                })}\n\n`,
              ),
            );
          } finally {
            controller.close();
          }
        },
      });

      // Return the stream with appropriate headers
      return new Response(customReadable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    } catch (error: any) {
      console.error('Stream initialization error:', error);
      const errorMessage =
        error?.message || 'Failed to connect to LangGraph backend server';
      return new NextResponse(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    console.error('Route error:', error);
    return new NextResponse(
      JSON.stringify({ error: error?.message || 'Invalid request' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
