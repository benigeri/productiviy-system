'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Thread {
  id: string;
  subject: string;
  message_ids: string[];
  latest_draft_or_message: {
    from: Array<{ name: string; email: string }>;
    date: number;
  };
}

// Relative time formatting
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const date = timestamp * 1000;
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

export function ThreadList({ threads }: { threads: Thread[] }) {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {threads.length} {threads.length === 1 ? 'email' : 'emails'} to respond
        </p>
      </div>

      <div className="space-y-3">
        {threads.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No emails to respond to. Great job!</p>
            </CardContent>
          </Card>
        ) : (
          threads.map((thread, index) => (
            <a
              key={thread.id}
              href={`/inbox?thread=${thread.id}`}
              className="block group"
            >
              <Card className="transition-all hover:shadow-md hover:border-primary/20 group-hover:bg-accent/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                        {thread.subject}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {thread.latest_draft_or_message.from[0]?.name || 'Unknown'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {index === 0 && (
                        <Badge variant="secondary" className="text-xs">New</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(thread.latest_draft_or_message.date)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
