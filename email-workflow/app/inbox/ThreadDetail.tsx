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

// Hoisted RegExp patterns to avoid recreation on each call
const IMG_TAG_REGEX = /<img[\s\S]*?(?:>|\/\s*>)/gi;
const HTML_LINK_REGEX = /<a\s+href=['"]([^'"]+)['"][\s\S]*?>([^<]*)<\/a>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const EMPTY_MD_LINK_REGEX = /\[\]\([^)]+\)/g;
const INLINE_HASH_REGEX = /\s*#{2,}\s*/g;
const LINE_START_HASH_REGEX = /^\s*#{1,6}\s*/gm;
const DASH_SEPARATOR_REGEX = /^-{3,}$/gm;
const STAR_SEPARATOR_REGEX = /^\*{3,}$/gm;
const ESCAPED_DASH_REGEX = /\\--/g;
const BOLD_ITALIC_REGEX = /\*{1,3}([^*\n]+)\*{1,3}/g;
const ASTERISK_BEFORE_WORD_REGEX = /\*+(\w)/g;
const ASTERISK_AFTER_WORD_REGEX = /(\w)\*+/g;
const BRACKET_NEWLINE_REGEX = /\[([^\]]*)\n([^\]]*)\]/g;
const PAREN_NEWLINE_REGEX = /\]\(([^)\s]*)\n([^)\s]*)\)/g;
const URL_NEWLINE_REGEX = /\]\(([^)]*)\n([^)]*)\)/g;
const DAY_WROTE_REGEX = /^On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^<]*<[^>]+>\s*wrote:\s*$/gim;
const MONTH_WROTE_REGEX = /^On\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)[^w]*wrote:\s*$/gim;
const MULTIPLE_NEWLINES_REGEX = /\n{3,}/g;
const MULTIPLE_SPACES_REGEX = /  +/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const INLINE_DAY_WROTE_REGEX = /\s*On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^<]*<[^>]+>\s*wrote:\s*/gi;
const INLINE_MONTH_WROTE_REGEX = /\s*On\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)[^w]*wrote:\s*/gi;
const INLINE_QUOTE_REGEX = /\s*>\s*.*/g;
const QUOTE_START_REGEX = /^>\s*/;

// Clean email content - remove raw HTML tags and convert links
// This should be called on the ENTIRE message content before splitting by newlines
function cleanEmailContent(text: string): string {
  // Remove <img ...> tags entirely (handle multi-line and various formats)
  let cleaned = text.replace(IMG_TAG_REGEX, '');

  // Convert HTML links <a href='url'>text</a> to markdown [text](url)
  cleaned = cleaned.replace(HTML_LINK_REGEX, '[$2]($1)');

  // Remove any remaining HTML tags (but keep their content)
  cleaned = cleaned.replace(HTML_TAG_REGEX, '');

  // Remove empty markdown links [](url) - links with no display text
  cleaned = cleaned.replace(EMPTY_MD_LINK_REGEX, '');

  // Remove ### markers (used as separators in email signatures)
  cleaned = cleaned.replace(INLINE_HASH_REGEX, ' '); // inline ### become spaces
  cleaned = cleaned.replace(LINE_START_HASH_REGEX, ''); // start of line ### removed

  // Clean up --- and *** separators
  cleaned = cleaned.replace(DASH_SEPARATOR_REGEX, '');
  cleaned = cleaned.replace(STAR_SEPARATOR_REGEX, '');
  cleaned = cleaned.replace(ESCAPED_DASH_REGEX, ''); // escaped dashes

  // Clean up markdown bold/italic formatting
  cleaned = cleaned.replace(BOLD_ITALIC_REGEX, '$1');

  // Clean up stray asterisks that are formatting markers (adjacent to word chars)
  cleaned = cleaned.replace(ASTERISK_BEFORE_WORD_REGEX, '$1');
  cleaned = cleaned.replace(ASTERISK_AFTER_WORD_REGEX, '$1');

  // Fix broken markdown links that span multiple lines
  cleaned = cleaned.replace(BRACKET_NEWLINE_REGEX, '[$1 $2]');
  cleaned = cleaned.replace(PAREN_NEWLINE_REGEX, ']($1$2)');

  // Handle case where URL has line break and more content
  let prevCleaned = '';
  while (prevCleaned !== cleaned) {
    prevCleaned = cleaned;
    cleaned = cleaned.replace(URL_NEWLINE_REGEX, ']($1$2)');
  }

  // Remove quoted reply headers
  cleaned = cleaned.replace(DAY_WROTE_REGEX, '');
  cleaned = cleaned.replace(MONTH_WROTE_REGEX, '');

  // Clean up multiple consecutive blank lines
  cleaned = cleaned.replace(MULTIPLE_NEWLINES_REGEX, '\n\n');

  // Clean up multiple spaces
  cleaned = cleaned.replace(MULTIPLE_SPACES_REGEX, ' ');

  // Clean up lines that are just whitespace or special chars
  cleaned = cleaned.split('\n')
    .map(line => line.trim())
    .filter(line => line && line !== '###' && line !== '---' && line !== '***' && line !== '-')
    .join('\n');

  return cleaned.trim();
}

// Parse markdown links to React elements (assumes text is already cleaned)
function parseMarkdownLinks(text: string): (string | React.ReactElement)[] {
  // Create a new regex instance for this call (needed since we use lastIndex)
  const regex = new RegExp(MARKDOWN_LINK_REGEX.source, MARKDOWN_LINK_REGEX.flags);
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the link
    const linkText = match[1].trim();
    const linkUrl = match[2].trim();
    // Skip empty links or placeholder links
    if (linkText && linkUrl && !linkUrl.startsWith('data:')) {
      parts.push(
        <a
          key={match.index}
          href={linkUrl}
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {linkText}
        </a>
      );
    } else if (linkText) {
      // Just show the text if URL is invalid
      parts.push(linkText);
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// Render email content: clean first, then split by lines and parse links
function renderEmailContent(content: string): React.ReactNode {
  const cleanedContent = cleanEmailContent(content);
  const lines = cleanedContent.split('\n');

  return lines.map((line, idx) => {
    const isQuoted = line.trim().startsWith('>');
    if (isQuoted) {
      return (
        <p key={idx} className="text-muted-foreground text-xs italic pl-3 border-l-2 border-muted my-1">
          {parseMarkdownLinks(line.replace(QUOTE_START_REGEX, ''))}
        </p>
      );
    }
    // Skip empty lines but preserve spacing
    if (!line.trim()) {
      return <p key={idx} className="my-1">&nbsp;</p>;
    }
    return (
      <p key={idx} className="my-1">
        {parseMarkdownLinks(line)}
      </p>
    );
  });
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
                disabled={saving}
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
