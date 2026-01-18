'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useKeyboardSubmit } from '@/hooks/useKeyboardSubmit';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function ComposeView({ onClose }: { onClose: () => void }) {
  const [instructions, setInstructions] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [recipients, setRecipients] = useState<{ to: string[]; cc: string[] }>({
    to: [],
    cc: [],
  });
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function generateDraft() {
    if (loading || saving) return;
    if (!instructions.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions,
          conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate draft');
      }

      const { subject: newSubject, to = [], cc = [], body } = data;

      setDraft(body);
      setSubject(newSubject);
      setRecipients({ to, cc });
      setConversationHistory([
        ...conversationHistory,
        { role: 'user', content: instructions },
        { role: 'assistant', content: body },
      ]);
      setInstructions('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate draft';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateDraft() {
    if (!feedback.trim()) return;
    if (loading || saving) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: feedback,
          conversationHistory: [...conversationHistory, { role: 'user', content: feedback }],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate draft');
      }

      const { subject: newSubject, to = [], cc = [], body } = data;

      setDraft(body);
      setSubject(newSubject);
      setRecipients({ to, cc });
      setConversationHistory([
        ...conversationHistory,
        { role: 'user', content: feedback },
        { role: 'assistant', content: body },
      ]);
      setFeedback('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate draft';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!draft) return;
    if (loading || saving) return;

    setSaving(true);
    setError('');

    try {
      if (recipients.to.length === 0) {
        throw new Error('No recipients specified. Please regenerate with recipients.');
      }

      const res = await fetch('/api/compose/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          draftBody: draft,
          to: recipients.to,
          cc: recipients.cc,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save draft');
      }

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save draft';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const handleInstructionsKeyDown = useKeyboardSubmit(generateDraft);
  const handleFeedbackKeyDown = useKeyboardSubmit(regenerateDraft);

  return (
    <div className="h-full flex flex-col">
      {/* Sticky Header */}
      <div className="flex-none px-6 py-4 border-b bg-background">
        <h1 className="text-xl font-bold">
          {draft ? subject || 'New Email' : 'Draft New Email'}
        </h1>
        {draft && recipients.to.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            To: {recipients.to.join(', ')}
            {recipients.cc.length > 0 && ` · Cc: ${recipients.cc.join(', ')}`}
          </p>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4">
          {/* Draft Preview */}
          {draft && (
            <div className="flex gap-4 mb-4">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-xs">You</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-none">Your Draft</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {recipients.to.length > 0 ? recipients.to.join(', ') : 'No recipients'}
                    </p>
                  </div>
                  <Badge variant="secondary">Draft</Badge>
                </div>
                <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {draft}
                </div>
              </div>
            </div>
          )}

          {/* Conversation History */}
          {conversationHistory.length > 2 && (
            <>
              <Separator className="my-4" />
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Previous iterations ({Math.floor(conversationHistory.length / 2)})
                </summary>
                <div className="mt-2 space-y-2 pl-4 border-l-2 border-muted">
                  {conversationHistory.slice(0, -2).map((msg, i) => (
                    <div key={i}>
                      <span className="text-xs text-muted-foreground">
                        {msg.role === 'user' ? 'You:' : 'Draft:'}
                      </span>
                      <p className={msg.role === 'user' ? 'text-muted-foreground italic' : ''}>
                        {msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>
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
                placeholder="What email would you like to write? Include recipients and context..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onKeyDown={handleInstructionsKeyDown}
                className="resize-none text-sm"
                rows={3}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">⌘</kbd> + <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to generate
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={generateDraft}
                disabled={loading || !instructions.trim()}
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
                onChange={(e) => setFeedback(e.target.value)}
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
                onClick={regenerateDraft}
                disabled={loading || !feedback.trim()}
                variant="outline"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Regenerate
              </Button>
              <Button
                onClick={handleApprove}
                disabled={saving || loading || recipients.to.length === 0}
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
