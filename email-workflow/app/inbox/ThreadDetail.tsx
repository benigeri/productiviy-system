'use client';

import { useState } from 'react';
import { useConversation } from '../../hooks/useConversation';

interface Thread {
  id: string;
  subject: string;
  message_ids: string[];
}

interface Message {
  id: string;
  from: Array<{ name: string; email: string }>;
  to: Array<{ name: string; email: string }>;
  cc?: Array<{ name: string; email: string }>;
  date: number;
  conversation: string;
}

export function ThreadDetail({
  thread,
  messages,
  allThreads,
}: {
  thread: Thread;
  messages: Message[];
  allThreads?: Thread[];
}) {
  const {
    conversation,
    isLoaded,
    addMessage,
    updateDraft,
    clear: clearConversation,
    messages: conversationMessages,
    currentDraft: storedDraft,
  } = useConversation(thread.id);

  const [instructions, setInstructions] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState(storedDraft || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function generateDraft() {
    setLoading(true);
    setError('');

    // Save user instructions to conversation history
    if (instructions.trim()) {
      addMessage('user', instructions);
    }

    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          subject: thread.subject,
          messages: messages.map(m => ({
            from: m.from,
            to: m.to,
            date: m.date,
            body: m.conversation,
          })),
          instructions,
          latestMessageId: messages[messages.length - 1].id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate draft');
      }

      // Save assistant's draft to conversation history
      addMessage('assistant', data.body);
      updateDraft(data.body);
      setDraft(data.body);
      setInstructions(''); // Clear instructions after generating
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate draft';
      setError(message);
      console.error('Draft generation error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateDraft() {
    if (!feedback.trim()) return;

    setLoading(true);
    setError('');

    // Add feedback to conversation history
    addMessage('user', feedback);

    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          subject: thread.subject,
          messages: messages.map(m => ({
            from: m.from,
            to: m.to,
            date: m.date,
            body: m.conversation,
          })),
          instructions: feedback,
          latestMessageId: messages[messages.length - 1].id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate draft');
      }

      // Update draft with new version
      addMessage('assistant', data.body);
      updateDraft(data.body);
      setDraft(data.body);
      setFeedback(''); // Clear feedback after regenerating
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate draft';
      setError(message);
      console.error('Draft regeneration error:', error);
    } finally {
      setLoading(false);
    }
  }

  function getNextThreadId(): string | null {
    if (!allThreads || allThreads.length === 0) return null;
    const currentIndex = allThreads.findIndex(t => t.id === thread.id);
    if (currentIndex === -1 || currentIndex === allThreads.length - 1) return null;
    return allThreads[currentIndex + 1].id;
  }

  function handleSkip() {
    clearConversation();
    const nextThreadId = getNextThreadId();
    if (nextThreadId) {
      window.location.href = `/inbox?thread=${nextThreadId}`;
    } else {
      window.location.href = '/inbox';
    }
  }

  async function handleApprove() {
    if (!draft) return;

    setSaving(true);
    setError('');

    try {
      const lastMessage = messages[messages.length - 1];

      // Save draft to Gmail and update labels
      const res = await fetch('/api/drafts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          subject: thread.subject,
          draftBody: draft,
          to: lastMessage.from,
          cc: lastMessage.to.slice(1), // Exclude first recipient (sender)
          latestMessageId: messages[messages.length - 1].id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save draft');
      }

      // Update session count in localStorage
      if (typeof window !== 'undefined') {
        const session = JSON.parse(localStorage.getItem('session') || '{}');
        session.draftedCount = (session.draftedCount || 0) + 1;
        localStorage.setItem('session', JSON.stringify(session));
      }

      // Clear conversation and navigate to next thread
      clearConversation();
      const nextThreadId = getNextThreadId();
      if (nextThreadId) {
        window.location.href = `/inbox?thread=${nextThreadId}`;
      } else {
        window.location.href = '/inbox';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save draft';
      setError(message);
      console.error('Draft save error:', error);
      setSaving(false);
    }
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <a href="/inbox" className="text-blue-600 hover:underline inline-block mb-2">
        ← Back to Inbox
      </a>

      <h1 className="text-2xl font-bold">{thread.subject}</h1>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg, i) => (
          <div key={msg.id} className="p-4 bg-white rounded-lg border">
            <div className="flex justify-between mb-3 items-start">
              <div>
                <strong className="block text-lg">{msg.from[0]?.name || 'Unknown'}</strong>
                <span className="text-xs text-gray-500">{msg.from[0]?.email}</span>
              </div>
              <div className="text-right">
                {i === messages.length - 1 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mb-1 inline-block font-medium">
                    Latest
                  </span>
                )}
                <p className="text-xs text-gray-400">
                  {new Date(msg.date * 1000).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {msg.conversation}
            </div>
          </div>
        ))}
      </div>

      {/* Conversation History */}
      {isLoaded && conversationMessages.length > 0 && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-3">Draft Iteration History</h3>
          <div className="space-y-2">
            {conversationMessages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded ${
                  msg.role === 'user'
                    ? 'bg-white border border-blue-200'
                    : 'bg-blue-100 border border-blue-300'
                }`}
              >
                <div className="text-xs font-semibold text-blue-700 mb-1">
                  {msg.role === 'user' ? '👤 You' : '🤖 Assistant'}
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Draft form or draft preview */}
      {!draft ? (
        <div className="space-y-4 sticky bottom-4 bg-white p-6 rounded-lg border-2 border-gray-200 shadow-lg">
          <label className="block">
            <span className="text-sm font-semibold mb-2 block text-gray-700">
              What should I say?
            </span>
            <textarea
              placeholder="Tell me what to say in the reply..."
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
            />
          </label>
          <button
            onClick={generateDraft}
            disabled={loading || !instructions.trim()}
            className="w-full bg-blue-600 text-white p-4 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-sm"
          >
            {loading ? 'Generating Draft...' : 'Generate Draft'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Draft preview */}
          <div className="p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-3 text-lg">Draft Reply</h3>
            <div className="text-sm whitespace-pre-wrap leading-relaxed p-4 bg-white rounded border">
              {draft}
            </div>
          </div>

          {/* Feedback for iteration */}
          <div className="space-y-3 p-6 bg-white rounded-lg border-2 border-gray-200">
            <label className="block">
              <span className="text-sm font-semibold mb-2 block text-gray-700">
                Need changes? Tell me what to improve:
              </span>
              <textarea
                placeholder="e.g., Make it shorter, add more details about X, change the tone..."
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
                disabled={loading}
              />
            </label>
            <button
              onClick={regenerateDraft}
              disabled={loading || !feedback.trim()}
              className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Regenerating...' : 'Regenerate Draft'}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              disabled={saving}
              className="flex-1 bg-gray-500 text-white p-4 rounded-lg font-semibold hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              Skip
            </button>
            <button
              onClick={handleApprove}
              disabled={saving}
              className="flex-1 bg-green-600 text-white p-4 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving...' : 'Approve & Send to Gmail'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
