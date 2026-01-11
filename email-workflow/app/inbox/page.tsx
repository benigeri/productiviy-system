// Server Component - fetches data directly
import { ThreadList } from './ThreadList';
import { ThreadDetail } from './ThreadDetail';

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
  const res = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/threads?in=Label_139&limit=20`,
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
        ignore_images: false, // Changed: don't ignore images to avoid 'span' text
        html_as_markdown: true,
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

  let messages: Message[] = [];
  let selectedThread: Thread | undefined;

  if (selectedThreadId) {
    selectedThread = threads.find(t => t.id === selectedThreadId);
    if (selectedThread) {
      messages = await getMessages(selectedThread.message_ids);
      messages.sort((a, b) => a.date - b.date);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {!selectedThreadId ? (
        <ThreadList threads={threads} />
      ) : (
        <ThreadDetail thread={selectedThread!} messages={messages} allThreads={threads} />
      )}
    </div>
  );
}
