// Server Component - fetches data directly
import { Mail } from './Mail';
import { getLabelToRespondPaul } from '@/lib/gmail-labels';

// Force dynamic rendering - this page fetches live email data
export const dynamic = 'force-dynamic';

interface Thread {
  id: string;
  subject: string;
  message_ids: string[];
  latest_draft_or_message: {
    from: Array<{ name: string; email: string }>;
    date: number;
  };
}

interface Message {
  id: string;
  from: Array<{ name: string; email: string }>;
  to: Array<{ name: string; email: string }>;
  cc?: Array<{ name: string; email: string }>;
  date: number;
  conversation: string;
}

async function getThreads(): Promise<Thread[]> {
  const toRespondLabel = getLabelToRespondPaul();
  const res = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/threads?in=${toRespondLabel}&limit=20`,
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
  const threads = await getThreads();
  const params = await searchParams;
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
