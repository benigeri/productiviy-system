// Server Component - fetches data directly
import { Mail } from './Mail';
import { getLabelRespond } from '@/lib/gmail-labels';
import type { ThreadWithPreview, Message } from '@/types/email';

// Force dynamic rendering - this page fetches live email data
export const dynamic = 'force-dynamic';

async function getThreads(): Promise<ThreadWithPreview[]> {
  const respondLabel = getLabelRespond();
  const res = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/threads?in=${respondLabel}&limit=20`,
    {
      headers: { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    console.error('Failed to fetch threads:', await res.text());
    throw new Error('Failed to fetch threads');
  }
  const data = await res.json();
  return data.data || [];
}

async function getMessages(messageIds: string[]): Promise<Message[]> {
  const res = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/clean`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message_id: messageIds,
        ignore_links: false,     // Keep URLs in content
        ignore_images: false,    // Keep images (ignore_images: true causes 'span' text issues)
        html_as_markdown: true,  // Convert HTML to markdown for proper link rendering
      }),
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    console.error('Failed to fetch messages:', await res.text());
    throw new Error('Failed to fetch messages');
  }
  const data = await res.json();
  return data.data || [];
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  // Parallelize independent async operations to avoid waterfall
  const [threads, params] = await Promise.all([getThreads(), searchParams]);
  const selectedThreadId = params.thread;

  // Pre-fetch messages if thread is specified in URL
  let initialMessages: Message[] = [];
  if (selectedThreadId) {
    const selectedThread = threads.find(t => t.id === selectedThreadId);
    if (selectedThread) {
      initialMessages = await getMessages(selectedThread.message_ids);
      initialMessages.sort((a, b) => a.date - b.date);
    }
  }

  return (
    <div className="h-full bg-background">
      <Mail
        threads={threads}
        initialThreadId={selectedThreadId}
        initialMessages={initialMessages}
      />
    </div>
  );
}
