'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatRelativeDate } from '@/lib/date-utils';
import { ThreadDetail } from './ThreadDetail';
import { ComposeView } from './ComposeView';
import type { ThreadWithPreview, Message } from '@/types/email';

interface MailProps {
  threads: ThreadWithPreview[];
  initialThreadId?: string;
  initialMessages?: Message[];
}

type ViewMode = 'thread' | 'compose';

export function Mail({ threads, initialThreadId, initialMessages }: MailProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(initialThreadId);
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('thread');

  const selectedThread = threads.find(t => t.id === selectedThreadId);

  // Keyboard shortcut: Cmd+N to compose
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setViewMode('compose');
        setSelectedThreadId(undefined);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleSelectThread(thread: ThreadWithPreview) {
    if (thread.id === selectedThreadId && viewMode === 'thread') return;

    setViewMode('thread');
    setSelectedThreadId(thread.id);
    setLoadingMessages(true);

    try {
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

  function handleCompose() {
    setViewMode('compose');
    setSelectedThreadId(undefined);
  }

  function handleComposeClose() {
    setViewMode('thread');
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Thread List Panel */}
      <ResizablePanel id="thread-list" defaultSize="35%" minSize="25%" maxSize="50%">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h1 className="text-xl font-bold">Inbox</h1>
              <p className="text-xs text-muted-foreground">
                {threads.length} {threads.length === 1 ? 'email' : 'emails'} to respond
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleCompose}
            >
              <Plus className="h-4 w-4" />
              Compose
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {threads.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  No emails to respond to.
                </div>
              ) : (
                threads.map((thread) => {
                  const isSelected = thread.id === selectedThreadId && viewMode === 'thread';
                  return (
                    <Card
                      key={thread.id}
                      onClick={() => handleSelectThread(thread)}
                      className={`cursor-pointer p-3 transition-colors ${
                        isSelected
                          ? 'bg-muted'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                          {thread.latest_draft_or_message.from[0]?.name || 'Unknown'}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatRelativeDate(thread.latest_draft_or_message.date)}
                        </span>
                      </div>
                      <span className="text-sm truncate block mt-1">
                        {thread.subject}
                      </span>
                      <span className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {thread.latest_draft_or_message.snippet || ''}
                      </span>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Detail Panel */}
      <ResizablePanel id="thread-detail" defaultSize="65%" minSize="40%">
        {viewMode === 'compose' ? (
          <ComposeView onClose={handleComposeClose} />
        ) : loadingMessages ? (
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
