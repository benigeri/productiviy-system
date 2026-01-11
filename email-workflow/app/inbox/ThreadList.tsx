'use client';

import { useState, useEffect } from 'react';

interface Thread {
  id: string;
  subject: string;
  message_ids: string[];
  latest_draft_or_message: {
    from: Array<{ name: string; email: string }>;
    date: number;
  };
}

export function ThreadList({ threads }: { threads: Thread[] }) {
  // Get session count from localStorage
  const [draftedCount, setDraftedCount] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const session = JSON.parse(localStorage.getItem('session') || '{"draftedCount": 0}');
      setDraftedCount(session.draftedCount || 0);
    }
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <div className="text-sm text-gray-600">
          Drafted this session: <span className="font-bold">{draftedCount}</span>
        </div>
      </div>
      <div className="space-y-2">
        {threads.length === 0 ? (
          <div className="p-8 bg-white rounded border text-center text-gray-500">
            No emails to respond to. Great job!
          </div>
        ) : (
          threads.map(thread => (
            <a
              key={thread.id}
              href={`/inbox?thread=${thread.id}`}
              className="block p-4 bg-white rounded-lg border hover:border-blue-300 hover:shadow-md transition"
            >
              <h3 className="font-semibold text-lg mb-1">{thread.subject}</h3>
              <p className="text-sm text-gray-600">
                {thread.latest_draft_or_message.from[0]?.name || 'Unknown'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(thread.latest_draft_or_message.date * 1000).toLocaleString()}
              </p>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
