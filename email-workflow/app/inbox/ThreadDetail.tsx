'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useConversation } from '@/hooks/useConversation';
import { useKeyboardSubmit } from '@/hooks/useKeyboardSubmit';
import { formatRelativeTime } from '@/lib/date-utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import type { Thread, Message } from '@/types/email';

// Get initials from name (e.g., "William Smith" -> "WS")
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Minimal regex patterns - only what's truly needed
const MULTIPLE_NEWLINES_REGEX = /\n{3,}/g;
const MULTIPLE_SPACES_REGEX = /  +/g;
const INLINE_DAY_WROTE_REGEX = /\s*On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^<]*<[^>]+>\s*wrote:\s*/gi;
const INLINE_MONTH_WROTE_REGEX = /\s*On\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)[^w]*wrote:\s*/gi;
const INLINE_QUOTE_REGEX = /^>.*$/gm;

// HTML cleanup patterns - Nylas sometimes leaves HTML in the output
// Match img tags including malformed/incomplete ones (may lack closing >)
const IMG_TAG_REGEX = /<img[^>]*(?:>|\/\s*>|\s*$)/gi;
const LINK_TAG_REGEX = /<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>([^<]*)<\/a>/gi;
const REMAINING_HTML_REGEX = /<[^>]+>/g;
// Catch broken img tags that span lines or are incomplete
const BROKEN_IMG_REGEX = /<img\s+[^>]*["']\s*\/?$/gim;

// Minimal email content cleanup - let Nylas Clean do the heavy lifting
function cleanEmailContent(text: string): string {
  let cleaned = text;

  // Remove image tags (signatures, tracking pixels)
  cleaned = cleaned.replace(IMG_TAG_REGEX, '');
  // Also catch broken/incomplete img tags
  cleaned = cleaned.replace(BROKEN_IMG_REGEX, '');

  // Convert links to "text (url)" format for readability
  cleaned = cleaned.replace(LINK_TAG_REGEX, (_, url, linkText) => {
    if (linkText && linkText.trim()) {
      return `${linkText.trim()} (${url})`;
    }
    return url;
  });

  // Remove any remaining HTML tags
  cleaned = cleaned.replace(REMAINING_HTML_REGEX, '');

  // Collapse excessive blank lines (3+ newlines → 2)
  cleaned = cleaned.replace(MULTIPLE_NEWLINES_REGEX, '\n\n');

  return cleaned.trim();
}

// Simple email content rendering using whitespace-pre-wrap
function renderEmailContent(content: string): React.ReactNode {
  const cleaned = cleanEmailContent(content);
  return (
    <div className="whitespace-pre-wrap break-words">
      {cleaned}
    </div>
  );
}

// Filter out quoted text and reply headers from draft preview
function filterQuotedText(text: string): string {
  let filtered = text;

  // Remove "On [day], [date] at [time] [name] <email> wrote:" patterns
  filtered = filtered.replace(INLINE_DAY_WROTE_REGEX, ' ');
  filtered = filtered.replace(INLINE_MONTH_WROTE_REGEX, ' ');

  // Remove inline quoted text: anything from "> " followed by content to end
  filtered = filtered.replace(INLINE_QUOTE_REGEX, '');

  // Filter out lines starting with > (quoted text)
  filtered = filtered
    .split('\n')
    .filter(line => !line.trim().startsWith('>'))
    .join('\n');

  // Clean up multiple spaces
  filtered = filtered.replace(MULTIPLE_SPACES_REGEX, ' ');

  return filtered.trim();
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
  const draftRef = useRef<HTMLDivElement>(null);
  const {
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

  // Sync draft state with storedDraft when thread changes
  useEffect(() => {
    setDraft(storedDraft || '');
  }, [storedDraft, thread.id]);

  // Clear recipients only when thread changes
  useEffect(() => {
    setDraftTo([]);
    setDraftCc([]);
  }, [thread.id]);

  // Auto-scroll to draft when it's generated
  useEffect(() => {
    if (draft && draftRef.current) {
      draftRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [draft]);

  async function generateDraft() {
    if (loading) return;
    setLoading(true);
    setError('');

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

      const { to = [], cc = [], body } = data;
      addMessage('assistant', body);
      updateDraft(body);
      setDraft(body);
      setDraftTo(to);
      setDraftCc(cc);
      setInstructions('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate draft';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateDraft() {
    if (!feedback.trim() || loading) return;

    setLoading(true);
    setError('');
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
          // Pass previous draft for targeted edits instead of full rewrites
          previousDraft: draft,
          previousRecipients: { to: draftTo, cc: draftCc },
          // Pass full conversation history so LLM remembers all prior instructions
          conversationHistory: conversationMessages,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate draft');
      }

      const { to = [], cc = [], body } = data;
      addMessage('assistant', body);
      updateDraft(body);
      setDraft(body);
      setDraftTo(to);
      setDraftCc(cc);
      setFeedback('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate draft';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const getNextThreadId = useCallback((): string | null => {
    if (!allThreads || allThreads.length === 0) return null;
    const currentIndex = allThreads.findIndex(t => t.id === thread.id);
    if (currentIndex === -1 || currentIndex === allThreads.length - 1) return null;
    return allThreads[currentIndex + 1].id;
  }, [allThreads, thread.id]);

  function handleSkip() {
    clearConversation();
    const nextThreadId = getNextThreadId();
    if (nextThreadId) {
      router.push(`/inbox?thread=${nextThreadId}`);
    } else {
      router.push('/inbox');
    }
  }

  // Keyboard handlers for Cmd+Enter
  const handleInstructionsKeyDown = useKeyboardSubmit(generateDraft);
  const handleFeedbackKeyDown = useKeyboardSubmit(regenerateDraft);

  async function handleApprove() {
    if (!draft) return;

    setSaving(true);
    setError('');

    try {
      const lastMessage = messages[messages.length - 1];
      const toRecipients = draftTo.length > 0
        ? draftTo.map(email => ({ email }))
        : lastMessage.from;
      const ccRecipients = draftCc.map(email => ({ email }));

      const res = await fetch('/api/drafts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          subject: thread.subject,
          draftBody: draft,
          to: toRecipients,
          cc: ccRecipients,
          latestMessageId: messages[messages.length - 1].id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save draft');
      }

      if (typeof window !== 'undefined') {
        try {
          const session = JSON.parse(localStorage.getItem('session') || '{}');
          session.draftedCount = (session.draftedCount || 0) + 1;
          localStorage.setItem('session', JSON.stringify(session));
        } catch {
          // localStorage may be unavailable or quota exceeded
        }
      }

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
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sticky Header */}
      <div className="flex-none px-4 py-3 border-b bg-background">
        <h1 className="text-xl font-bold">{thread.subject}</h1>
        <p className="text-xs text-muted-foreground">
          {messages.length} {messages.length === 1 ? 'message' : 'messages'} in thread
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={msg.id}>
            {i > 0 && <Separator />}
            <div className="flex gap-4 px-6 py-4">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-xs">
                  {getInitials(msg.from[0]?.name || '')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-none">
                      {msg.from[0]?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {msg.from[0]?.email}
                    </p>
                    {msg.to && msg.to.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">To:</span>{' '}
                        {msg.to.map((p) => p.name || p.email).join(', ')}
                      </p>
                    )}
                    {msg.cc && msg.cc.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Cc:</span>{' '}
                        {msg.cc.map((p) => p.name || p.email).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(msg.date)}
                  </span>
                </div>
                <div className="mt-3 text-sm leading-relaxed">
                  {renderEmailContent(msg.conversation)}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Conversation History (collapsed by default) */}
        {isLoaded && conversationMessages.length > 0 && (
          <div className="px-6 pb-4">
            <Separator className="mb-4" />
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Draft iterations ({conversationMessages.length})
              </summary>
              <div className="mt-2 space-y-2 pl-4 border-l-2 border-muted">
                {conversationMessages.map((msg, i) => (
                  <div key={i}>
                    <span className="text-xs text-muted-foreground">
                      {msg.role === 'user' ? 'Feedback:' : 'Draft:'}
                    </span>
                    <p className={msg.role === 'user' ? 'text-muted-foreground italic' : ''}>
                      {msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Storage warning */}
        {storageWarning && (
          <div className="mx-6 mb-4 p-3 bg-warning/10 border border-warning/20 rounded text-warning text-sm">
            {storageWarning}
          </div>
        )}

        {/* Draft Preview */}
        {draft && (
          <div className="px-6 pb-4">
            <Card ref={draftRef} className="border-primary/30 shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Your Draft</h3>
                  <Badge variant="secondary">Ready to send</Badge>
                </div>

                <div className="space-y-1 mt-3 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-10">To:</span>
                    <div className="flex flex-wrap gap-1">
                      {draftTo.length > 0 ? (
                        draftTo.map((email, i) => (
                          <Badge key={i} variant="outline" className="font-normal text-xs">
                            {email}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground italic text-xs">Using reply-to</span>
                      )}
                    </div>
                  </div>
                  {draftCc.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-10">Cc:</span>
                      <div className="flex flex-wrap gap-1">
                        {draftCc.map((email, i) => (
                          <Badge key={i} variant="outline" className="font-normal text-xs">
                            {email}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="pt-2">
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {filterQuotedText(draft)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Sticky Bottom Controls */}
      <div className="flex-none border-t bg-background px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm mb-3">
            {error}
          </div>
        )}

        {!draft ? (
          <div className="space-y-3">
            <div>
              <Textarea
                placeholder="What should I say in the reply?"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                onKeyDown={handleInstructionsKeyDown}
                className="resize-none text-sm"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">⌘</kbd> + <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to generate
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleSkip}
                disabled={loading}
                variant="ghost"
              >
                Skip
              </Button>
              <Button
                onClick={generateDraft}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Generating...' : 'Generate Draft'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Textarea
                placeholder="Need changes? Tell me what to improve..."
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                onKeyDown={handleFeedbackKeyDown}
                className="resize-none text-sm"
                rows={2}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">⌘</kbd> + <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to regenerate
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleSkip}
                disabled={saving || loading}
                variant="ghost"
              >
                Skip
              </Button>
              <Button
                onClick={regenerateDraft}
                disabled={loading || !feedback.trim()}
                variant="outline"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Regenerate
              </Button>
              <Button
                onClick={handleApprove}
                disabled={saving || loading}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? 'Saving...' : 'Approve & Save'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
