import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/langgraph-server';

export async function POST() {
  try {
    const serverClient = createServerClient();
    const thread = await serverClient.createThread();
    return NextResponse.json({ thread_id: thread.thread_id });
  } catch (error: any) {
    console.error('Thread creation error on server:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create thread' },
      { status: 500 },
    );
  }
}
