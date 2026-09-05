'use client';

import type React from 'react';

import { useToast } from '@/hooks/use-toast';
import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Paperclip, ArrowUp, Loader2 } from 'lucide-react';
import { ExamplePrompts } from '@/components/example-prompts';
import { ChatMessage } from '@/components/chat-message';
import { FilePreview } from '@/components/file-preview';
import { client } from '@/lib/langgraph-client';
import {
  AgentState,
  documentType,
  PDFDocument,
  RetrieveDocumentsNodeUpdates,
} from '@/types/graphTypes';
import { Card, CardContent } from '@/components/ui/card';
import { cleanResponseText } from '@/lib/utils';
export default function Home() {
  const { toast } = useToast(); // Add this hook
  const [messages, setMessages] = useState<
    Array<{
      role: 'user' | 'assistant';
      content: string;
      sources?: PDFDocument[];
    }>
  >([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null); // Track the AbortController
  const messagesEndRef = useRef<HTMLDivElement>(null); // Add this ref
  const lastRetrievedDocsRef = useRef<PDFDocument[]>([]); // useRef to store the last retrieved documents

  useEffect(() => {
    // Create a thread when the component mounts
    const initThread = async () => {
      // Skip if we already have a thread
      if (threadId) return;

      try {
        const thread = await client.createThread();
        setThreadId(thread.thread_id);
      } catch (error) {
        console.warn('Initial thread creation fallback to UUID:', error);
        // Ensure user can immediately start typing with a client-generated thread ID
        setThreadId(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `thread_${Date.now()}`);
      }
    };
    initThread();
  }, [threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    let activeThreadId = threadId;
    if (!activeThreadId) {
      activeThreadId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `thread_${Date.now()}`;
      setThreadId(activeThreadId);
    }

    const userMessage = input.trim();
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, sources: undefined }, // Clear sources for new user message
      { role: 'assistant', content: '', sources: undefined }, // Clear sources for new assistant message
    ]);
    setInput('');
    setIsLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    lastRetrievedDocsRef.current = []; // Clear the last retrieved documents

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          threadId: activeThreadId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let streamText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = decoder.decode(value);
        const lines = chunkStr.split('\n').filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const sseString = line.slice('data: '.length);
          let sseEvent: any;
          try {
            sseEvent = JSON.parse(sseString);
          } catch (err) {
            console.error('Error parsing SSE line:', err, line);
            continue;
          }

          const { event, data } = sseEvent;

          // Helper to extract text content from various LangChain message formats
          const getMsgContent = (msg: any): string => {
            if (!msg) return '';
            if (typeof msg === 'string') return msg;
            if (typeof msg.content === 'string') return msg.content;
            if (typeof msg.kwargs?.content === 'string') return msg.kwargs.content;
            if (Array.isArray(msg.content)) {
              return msg.content
                .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
                .join('');
            }
            return '';
          };

          const isHumanMsg = (msg: any): boolean => {
            return (
              msg?.type === 'human' ||
              msg?.id?.includes?.('HumanMessage') ||
              msg?.kwargs?.id?.includes?.('HumanMessage') ||
              msg?._getType?.() === 'human'
            );
          };

          // 1. Handle error events from LangGraph or proxy route
          if (event === 'error' || sseEvent.error) {
            const rawError =
              data?.message || data?.error || sseEvent.error || 'An error occurred';
            console.error('SSE error event received:', rawError);
            toast({
              title: 'Generation Error',
              description: String(rawError),
              variant: 'destructive',
            });
            setMessages((prev) => {
              const newArr = [...prev];
              if (
                newArr.length > 0 &&
                newArr[newArr.length - 1].role === 'assistant'
              ) {
                newArr[newArr.length - 1].content = `⚠️ **Error:** ${String(
                  rawError,
                )}`;
              }
              return newArr;
            });
            continue;
          }

          // 2. Handle streaming token updates (messages/partial or messages)
          if (event === 'messages/partial') {
            const msgList = Array.isArray(data) ? data : [data];
            for (const item of msgList) {
              const rawText = getMsgContent(item);
              if (
                rawText &&
                !isHumanMsg(item) &&
                !rawText.startsWith('{"route"')
              ) {
                streamText = rawText;
                setMessages((prev) => {
                  const newArr = [...prev];
                  if (
                    newArr.length > 0 &&
                    newArr[newArr.length - 1].role === 'assistant'
                  ) {
                    newArr[newArr.length - 1].content = cleanResponseText(streamText);
                    newArr[newArr.length - 1].sources =
                      lastRetrievedDocsRef.current;
                  }
                  return newArr;
                });
              }
            }
          } else if (event === 'messages') {
            const msgList = Array.isArray(data) ? data : [data];
            const item = msgList[0];
            const token = getMsgContent(item);
            if (
              token &&
              !isHumanMsg(item) &&
              !token.startsWith('{"route"')
            ) {
              if (token.length > streamText.length && token.startsWith(streamText)) {
                streamText = token;
              } else {
                streamText += token;
              }
              setMessages((prev) => {
                const newArr = [...prev];
                if (
                  newArr.length > 0 &&
                  newArr[newArr.length - 1].role === 'assistant'
                ) {
                  newArr[newArr.length - 1].content = cleanResponseText(streamText);
                  newArr[newArr.length - 1].sources =
                    lastRetrievedDocsRef.current;
                }
                return newArr;
              });
            }
          }
          // 3. Handle node update completions
          else if (event === 'updates' && data && typeof data === 'object') {
            // Capture retrieved documents
            if (
              'retrieveDocuments' in data &&
              data.retrieveDocuments &&
              Array.isArray(data.retrieveDocuments.documents)
            ) {
              const retrievedDocs = (data as RetrieveDocumentsNodeUpdates)
                .retrieveDocuments.documents as PDFDocument[];
              lastRetrievedDocsRef.current = retrievedDocs;
            }

            // Capture final message output from any responding node
            for (const key of Object.keys(data)) {
              const nodeVal = (data as any)[key];
              if (nodeVal && Array.isArray(nodeVal.messages)) {
                for (let i = nodeVal.messages.length - 1; i >= 0; i--) {
                  const m = nodeVal.messages[i];
                  const text = getMsgContent(m);
                  if (
                    text &&
                    !isHumanMsg(m) &&
                    !text.startsWith('{"route"')
                  ) {
                    streamText = text;
                    setMessages((prev) => {
                      const newArr = [...prev];
                      if (
                        newArr.length > 0 &&
                        newArr[newArr.length - 1].role === 'assistant'
                      ) {
                        newArr[newArr.length - 1].content = cleanResponseText(text);
                        newArr[newArr.length - 1].sources =
                          lastRetrievedDocsRef.current;
                      }
                      return newArr;
                    });
                    break;
                  }
                }
              }
            }
          }
          // 4. Handle complete graph values
          else if (
            event === 'values' &&
            data?.messages &&
            Array.isArray(data.messages)
          ) {
            for (let i = data.messages.length - 1; i >= 0; i--) {
              const m = data.messages[i];
              const text = getMsgContent(m);
              if (
                text &&
                !isHumanMsg(m) &&
                !text.startsWith('{"route"')
              ) {
                streamText = text;
                setMessages((prev) => {
                  const newArr = [...prev];
                  if (
                    newArr.length > 0 &&
                    newArr[newArr.length - 1].role === 'assistant'
                  ) {
                    newArr[newArr.length - 1].content = cleanResponseText(text);
                    newArr[newArr.length - 1].sources =
                      lastRetrievedDocsRef.current;
                  }
                  return newArr;
                });
                break;
              }
            }
          }
        }
      }

      // Check if message ended up empty after stream finished
      setMessages((prev) => {
        const newArr = [...prev];
        if (
          newArr.length > 0 &&
          newArr[newArr.length - 1].role === 'assistant' &&
          !newArr[newArr.length - 1].content
        ) {
          newArr[newArr.length - 1].content =
            '⚠️ No response was received. Please ensure the backend server is running with `yarn langgraph:dev` and GROQ_API_KEY is configured in backend/.env.';
        }
        return newArr;
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description:
          'Failed to send message. Please try again.\n' +
          (error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
      setMessages((prev) => {
        const newArr = [...prev];
        newArr[newArr.length - 1].content =
          'Sorry, there was an error processing your message: ' +
          (error instanceof Error ? error.message : 'Unknown error');
        return newArr;
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const nonPdfFiles = selectedFiles.filter(
      (file) => file.type !== 'application/pdf',
    );
    if (nonPdfFiles.length > 0) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload PDF files only',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload files');
      }

      setFiles((prev) => [...prev, ...selectedFiles]);
      toast({
        title: 'Success',
        description: `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} uploaded successfully`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: 'Upload failed',
        description:
          'Failed to upload files. Please try again.\n' +
          (error instanceof Error ? error.message : 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (fileToRemove: File) => {
    setFiles(files.filter((file) => file !== fileToRemove));
    toast({
      title: 'File removed',
      description: `${fileToRemove.name} has been removed`,
      variant: 'default',
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-24 max-w-5xl mx-auto w-full">
      {messages.length === 0 ? (
        <>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="font-medium text-muted-foreground max-w-md mx-auto">
                This ai chatbot is an example template to accompany the book:{' '}
                <a
                  href="https://www.oreilly.com/library/view/learning-langchain/9781098167271/"
                  className="underline hover:text-foreground"
                >
                  Learning LangChain (O'Reilly): Building AI and LLM
                  applications with LangChain and LangGraph
                </a>
              </p>
            </div>
          </div>
          <ExamplePrompts onPromptSelect={setInput} />
        </>
      ) : (
        <div className="w-full space-y-4 mb-20">
          {messages.map((message, i) => (
            <ChatMessage key={i} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background">
        <div className="max-w-5xl mx-auto space-y-4">
          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {files.map((file, index) => (
                <FilePreview
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={() => handleRemoveFile(file)}
                />
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative">
            <div className="flex gap-2 border rounded-md overflow-hidden bg-gray-50">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf"
                multiple
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-none h-12"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isUploading ? 'Uploading PDF...' : 'Send a message...'
                }
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 bg-transparent"
                disabled={isUploading || isLoading}
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-none h-12"
                disabled={!input.trim() || isUploading || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
