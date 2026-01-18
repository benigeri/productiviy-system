'use client';

import { useState } from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeDate } from '@/lib/date-utils';
import { ThreadDetail } from './ThreadDetail';
import type { ThreadWithPreview, Message } from '@/types/email';

interface MailProps {
  threads: ThreadWithPreview[];
  initialThreadId?: string;
  initialMessages?: Message[];
}

export function Mail({ threads, initialThreadId, initialMessages }: MailProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(initialThreadId);
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const selectedThread = threads.find(t => t.id === selectedThreadId);

  async function handleSelectThread(thread: ThreadWithPreview) {
    if (thread.id === selectedThreadId) return;

    setSelectedThreadId(thread.id);
    setLoadingMessages(true);

    try {
      // Fetch messages for this thread
      const res = await fetch(`/api/threads?threadId=${thread.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Thread List Panel */}
      <ResizablePanel id="thread-list" defaultSize="35%" minSize="25%" maxSize="50%">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b">
            <h1 className="text-lg font-semibold">Inbox</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {threads.length} {threads.length === 1 ? 'email' : 'emails'} to respond
            </p>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {threads.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground text-sm">No emails to respond to.</p>
                  </CardContent>
                </Card>
              ) : (
                threads.map((thread, index) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => handleSelectThread(thread)}
                    className={`w-full text-left p-3 rounded-md transition-colors ${
                      thread.id === selectedThreadId
                        ? 'bg-accent'
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {thread.latest_draft_or_message.from[0]?.name || 'Unknown'}
                        </p>
                        <p className="text-sm truncate mt-0.5">
                          {thread.subject}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {index === 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5">New</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeDate(thread.latest_draft_or_message.date)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Thread Detail Panel */}
      <ResizablePanel id="thread-detail" defaultSize="65%" minSize="40%">
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : selectedThread && messages.length > 0 ? (
          <ThreadDetail
            thread={selectedThread}
            messages={messages}
            allThreads={threads}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-muted-foreground">Select an email to read</p>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
