'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useConversation } from '../../hooks/useConversation';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

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
  const router = useRouter();
  const {
    conversation,
    isLoaded,
    addMessage,
    updateDraft,
    clear: clearConversation,
    messages: conversationMessages,
    currentDraft: storedDraft,
    storageWarning,
  } = useConversation(thread.id);

  const [instructions, setInstructions] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState(storedDraft || '');
  const [draftTo, setDraftTo] = useState<string[]>([]);
  const [draftCc, setDraftCc] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(true);

  // Sync draft state with storedDraft when thread changes (prevents stale drafts)
  useEffect(() => {
    setDraft(storedDraft || '');
  }, [storedDraft, thread.id]);

  // Clear recipients only when thread changes (not when draft content changes)
  useEffect(() => {
    setDraftTo([]);
    setDraftCc([]);
  }, [thread.id]);

  async function generateDraft() {
    if (loading) return;
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

      // Extract structured response: to, cc, body
      const { to = [], cc = [], body } = data;
      console.log('Draft generated - structured response:', {
        to,
        cc,
        bodyLength: body.length,
        instructions,
      });

      // Save assistant's draft to conversation history
      addMessage('assistant', body);
      updateDraft(body);
      setDraft(body);
      setDraftTo(to);
      setDraftCc(cc);

      console.log('Draft state updated:', {
        draftTo: to,
        draftCc: cc,
      });
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
    if (!feedback.trim() || loading) return;

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

      // Extract structured response: to, cc, body
      const { to = [], cc = [], body } = data;
      console.log('Draft regenerated - structured response:', {
        to,
        cc,
        bodyLength: body.length,
        feedback,
      });

      // Update draft with new version
      addMessage('assistant', body);
      updateDraft(body);
      setDraft(body);
      setDraftTo(to);
      setDraftCc(cc);

      console.log('Draft state updated after regeneration:', {
        draftTo: to,
        draftCc: cc,
      });
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

  function getPrevThreadId(): string | null {
    if (!allThreads || allThreads.length === 0) return null;
    const currentIndex = allThreads.findIndex(t => t.id === thread.id);
    if (currentIndex === -1 || currentIndex === 0) return null;
    return allThreads[currentIndex - 1].id;
  }

  function handleSkip() {
    clearConversation();
    const nextThreadId = getNextThreadId();
    if (nextThreadId) {
      router.push(`/inbox?thread=${nextThreadId}`);
    } else {
      router.push('/inbox');
    }
  }

  async function handleApprove() {
    if (!draft) return;

    setSaving(true);
    setError('');

    try {
      const lastMessage = messages[messages.length - 1];

      // Save draft to Gmail and update labels
      // Use draftTo/draftCc from Braintrust prompt if available, otherwise fallback to defaults
      const toRecipients = draftTo.length > 0
        ? draftTo.map(email => ({ email }))
        : lastMessage.from;

      // Use CC from Braintrust prompt - if empty, no CC is added (don't fallback to lastMessage.to)
      const ccRecipients = draftCc.map(email => ({ email }));

      console.log('Approving draft - before save:', {
        draftTo,
        draftCc,
        toRecipients,
        ccRecipients,
        threadId: thread.id,
      });

      const res = await fetch('/api/drafts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          subject: thread.subject,
          draftBody: draft,
          to: toRecipients,
          cc: ccRecipients, // Use CC from Braintrust prompt (API filters out self)
          latestMessageId: messages[messages.length - 1].id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save draft');
      }

      // Log warning if label update failed (but continue - draft was saved)
      if (data.warning) {
        console.warn('Label update warning:', data.warning);
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
        router.push(`/inbox?thread=${nextThreadId}`);
      } else {
        router.push('/inbox');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save draft';
      setError(message);
      console.error('Draft save error:', error);
      setSaving(false);
    }
  }

  const prevThreadId = useMemo(() => getPrevThreadId(), [allThreads, thread.id]);
  const nextThreadId = useMemo(() => getNextThreadId(), [allThreads, thread.id]);

  // Auto-link URLs in plain text
  function autoLinkUrls(text: string): (string | React.ReactElement)[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }

  return (
    <div className="h-screen h-dvh flex flex-col">
      {/* Sticky Top Navigation */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <a href="/inbox" className="text-blue-600 hover:underline">
          ← Back to Inbox
        </a>
        <div className="flex gap-2">
          {prevThreadId ? (
            <a
              href={`/inbox?thread=${prevThreadId}`}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              ← Prev
            </a>
          ) : (
            <span className="px-3 py-1 text-sm text-gray-400 rounded">← Prev</span>
          )}
          {nextThreadId ? (
            <a
              href={`/inbox?thread=${nextThreadId}`}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              Next →
            </a>
          ) : (
            <span className="px-3 py-1 text-sm text-gray-400 rounded">Next →</span>
          )}
        </div>
      </div>

      {/* Scrollable Middle Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 max-w-4xl mx-auto space-y-4">
          <h1 className="text-2xl font-bold">{thread.subject}</h1>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg, i) => (
          <Card key={msg.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <strong className="block text-lg">{msg.from[0]?.name || 'Unknown'}</strong>
                  <span className="text-xs text-muted-foreground">{msg.from[0]?.email}</span>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {i === messages.length - 1 && (
                    <Badge variant="default">Latest</Badge>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(msg.date * 1000).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.conversation.split('\n').map((line, idx) => {
                  // Check if line is a quoted reply (starts with >)
                  const isQuoted = line.trim().startsWith('>');
                  return (
                    <p
                      key={idx}
                      className={isQuoted ? 'text-muted-foreground italic pl-4 border-l-2 border-muted' : ''}
                    >
                      {autoLinkUrls(line.replace(/^>\s*/, '') || '\u00A0')}
                    </p>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conversation History */}
      {isLoaded && conversationMessages.length > 0 && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Button
            onClick={() => setHistoryCollapsed(!historyCollapsed)}
            variant="ghost"
            className="w-full flex items-center justify-between text-left mb-3 h-auto p-2"
          >
            <h3 className="font-semibold text-blue-800">
              Draft Iteration History ({conversationMessages.length})
            </h3>
            <span className="text-blue-800">
              {historyCollapsed ? '▶' : '▼'}
            </span>
          </Button>

          {!historyCollapsed && (
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
          )}
        </div>
      )}

      {/* Storage warning message */}
      {storageWarning && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
          {storageWarning}
        </div>
      )}

      {/* Draft preview (if exists) */}
      {draft && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Draft Reply</h3>
              <span className="text-xs text-muted-foreground">Ready to send</span>
            </div>

            {/* Email Headers - Gmail-style */}
            <div className="space-y-2 mt-4 text-sm">
              {/* To Field */}
              <div className="flex">
                <span className="text-muted-foreground font-medium w-16 flex-shrink-0">To:</span>
                <div className="flex-1">
                  {draftTo.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {draftTo.map((email, i) => (
                        <Badge key={i} variant="secondary" className="font-normal">
                          {email}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">No recipients specified</span>
                  )}
                </div>
              </div>

              {/* CC Field - only show if CC exists */}
              {draftCc.length > 0 && (
                <div className="flex">
                  <span className="text-muted-foreground font-medium w-16 flex-shrink-0">Cc:</span>
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-1">
                      {draftCc.map((email, i) => (
                        <Badge key={i} variant="outline" className="font-normal">
                          {email}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Subject Field */}
              <div className="flex">
                <span className="text-muted-foreground font-medium w-16 flex-shrink-0">Subject:</span>
                <span className="flex-1">{thread.subject}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {draft.split('\n').map((line, idx) => {
                // Check if line is a quoted reply (starts with >)
                const isQuoted = line.trim().startsWith('>');
                return (
                  <p
                    key={idx}
                    className={isQuoted ? 'text-muted-foreground italic pl-4 border-l-2 border-muted' : ''}
                  >
                    {autoLinkUrls(line.replace(/^>\s*/, '') || '\u00A0')}
                  </p>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
        </div>
      </div>

      {/* Sticky Bottom Controls */}
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-3">
              {error}
            </div>
          )}

          {!draft ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold mb-2 block text-gray-700">
                  What should I say?
                </span>
                <textarea
                  placeholder="Tell me what to say in the reply..."
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                />
              </label>
              <Button
                onClick={generateDraft}
                disabled={loading || !instructions.trim()}
                className="w-full h-12"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Generating Draft...' : 'Generate Draft'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold mb-2 block text-gray-700">
                  Need changes? Tell me what to improve:
                </span>
                <textarea
                  placeholder="e.g., Make it shorter, add more details about X, change the tone..."
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={2}
                  disabled={loading}
                />
              </label>
              <Button
                onClick={regenerateDraft}
                disabled={loading || !feedback.trim()}
                className="w-full h-12 mb-2"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Regenerating...' : 'Regenerate Draft'}
              </Button>
              <div className="flex gap-3">
                <Button
                  onClick={handleSkip}
                  disabled={saving}
                  variant="outline"
                  className="flex-1 h-12"
                >
                  Skip
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={saving || loading}
                  className="flex-1 h-12"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? 'Saving...' : 'Approve & Send to Gmail'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
