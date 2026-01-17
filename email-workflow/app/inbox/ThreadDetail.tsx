'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useConversation } from '../../hooks/useConversation';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';

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
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Clean email content - remove raw HTML tags and convert links
// This should be called on the ENTIRE message content before splitting by newlines
function cleanEmailContent(text: string): string {
  // Remove <img ...> tags entirely (handle multi-line and various formats)
  // Use [\s\S] to match across newlines
  let cleaned = text.replace(/<img[\s\S]*?(?:>|\/\s*>)/gi, '');

  // Convert HTML links <a href='url'>text</a> to markdown [text](url)
  // Handle both single and double quotes, and multi-line attributes
  cleaned = cleaned.replace(/<a\s+href=['"]([^'"]+)['"][\s\S]*?>([^<]*)<\/a>/gi, '[$2]($1)');

  // Remove any remaining HTML tags (but keep their content)
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Remove empty markdown links [](url) - links with no display text
  cleaned = cleaned.replace(/\[\]\([^)]+\)/g, '');

  // Remove ### markers (used as separators in email signatures)
  cleaned = cleaned.replace(/\s*#{2,}\s*/g, ' '); // inline ### become spaces
  cleaned = cleaned.replace(/^\s*#{1,6}\s*/gm, ''); // start of line ### removed

  // Clean up --- and *** separators
  cleaned = cleaned.replace(/^-{3,}$/gm, '');
  cleaned = cleaned.replace(/^\*{3,}$/gm, '');
  cleaned = cleaned.replace(/\\--/g, ''); // escaped dashes

  // Clean up markdown bold/italic formatting
  cleaned = cleaned.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1'); // remove ***text*** or **text** or *text*

  // Clean up stray asterisks that are formatting markers (adjacent to word chars)
  cleaned = cleaned.replace(/\*+(\w)/g, '$1'); // asterisks before word
  cleaned = cleaned.replace(/(\w)\*+/g, '$1'); // asterisks after word

  // Clean up markdown link syntax that spans multiple lines (broken links)
  // Match [text that spans
  // multiple lines](url) - join them
  cleaned = cleaned.replace(/\[([^\]]*)\n([^\]]*)\]\(/g, '[$1 $2](');

  // Also handle broken URLs in markdown links
  cleaned = cleaned.replace(/\]\(([^)\n]*)\n([^)\n]*)\)/g, ']($1$2)');

  // Clean up multiple consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Clean up multiple spaces
  cleaned = cleaned.replace(/  +/g, ' ');

  // Clean up lines that are just whitespace or special chars
  cleaned = cleaned.split('\n')
    .map(line => line.trim())
    .filter(line => line && line !== '###' && line !== '---' && line !== '***' && line !== '-')
    .join('\n');

  return cleaned.trim();
}

// Parse markdown links to React elements (assumes text is already cleaned)
function parseMarkdownLinks(text: string): (string | React.ReactElement)[] {
  // Match markdown links: [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = markdownLinkRegex.exec(text)) !== null) {
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
          {parseMarkdownLinks(line.replace(/^>\s*/, ''))}
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

// Filter out quoted text (lines starting with >)
function filterQuotedText(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.trim().startsWith('>'))
    .join('\n')
    .trim();
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
  const [historyCollapsed, setHistoryCollapsed] = useState(true);

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
        const session = JSON.parse(localStorage.getItem('session') || '{}');
        session.draftedCount = (session.draftedCount || 0) + 1;
        localStorage.setItem('session', JSON.stringify(session));
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
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <h1 className="text-xl font-bold">{thread.subject}</h1>

          {/* Messages */}
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <Card key={msg.id} className="shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{msg.from[0]?.name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{msg.from[0]?.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {i === messages.length - 1 && (
                        <Badge variant="default" className="text-xs">Latest</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(msg.date)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                    {renderEmailContent(msg.conversation)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Conversation History (collapsed by default) */}
          {isLoaded && conversationMessages.length > 0 && (
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setHistoryCollapsed(!historyCollapsed)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="text-xs">{historyCollapsed ? '▶' : '▼'}</span>
                <span>Draft iterations ({conversationMessages.length})</span>
              </button>

              {!historyCollapsed && (
                <div className="mt-3 space-y-2 pl-4 border-l-2 border-muted">
                  {conversationMessages.map((msg, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-xs text-muted-foreground">
                        {msg.role === 'user' ? 'Feedback:' : 'Draft:'}
                      </span>
                      <p className={`mt-0.5 ${msg.role === 'user' ? 'text-muted-foreground italic' : ''}`}>
                        {msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Storage warning */}
          {storageWarning && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded text-warning text-sm">
              {storageWarning}
            </div>
          )}

          {/* Draft Preview */}
          {draft && (
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
          )}
        </div>
      </div>

      {/* Sticky Bottom Controls */}
      <div className="border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-sm mb-3">
              {error}
            </div>
          )}

          {!draft ? (
            <div className="space-y-3">
              <Textarea
                placeholder="What should I say in the reply?"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                className="resize-none text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  onClick={generateDraft}
                  disabled={loading || !instructions.trim()}
                  className="flex-1"
                  size="lg"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Generating...' : 'Generate Draft'}
                </Button>
                <Button
                  onClick={handleSkip}
                  variant="ghost"
                  size="lg"
                >
                  Skip
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                placeholder="Need changes? Tell me what to improve..."
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                className="resize-none text-sm"
                rows={2}
                disabled={loading}
              />
              <div className="flex gap-2">
                <Button
                  onClick={regenerateDraft}
                  disabled={loading || !feedback.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Regenerate
                </Button>
                <Button
                  onClick={handleSkip}
                  disabled={saving}
                  variant="ghost"
                >
                  Skip
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={saving || loading}
                  className="flex-1"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? 'Saving...' : 'Approve & Save'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
