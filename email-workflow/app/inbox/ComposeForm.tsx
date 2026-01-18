'use client';

import React, { useState } from 'react';
import { Loader2, Send, RefreshCw, Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useKeyboardSubmit } from '@/hooks/useKeyboardSubmit';
import type {
  ConversationMessage,
  Recipients,
  ComposeApiResponse,
} from '@/lib/schemas/email-generation';

export function ComposeForm({ onClose }: { onClose: () => void }) {
  const [instructions, setInstructions] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [recipients, setRecipients] = useState<Recipients>({
    to: [],
    cc: [],
  });
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
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
          conversationHistory:
            conversationHistory.length > 0 ? conversationHistory : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate draft');
      }

      const { subject, to = [], cc = [], body } = data;

      setDraft(body);
      setSubject(subject);
      setRecipients({ to, cc });
      setConversationHistory([
        ...conversationHistory,
        { role: 'user', content: instructions },
        { role: 'assistant', content: body },
      ]);
      setInstructions('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate draft';
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
          previousDraft: draft,
          previousSubject: subject,
          previousRecipients: recipients,
          conversationHistory: [
            ...conversationHistory,
            { role: 'user', content: feedback },
          ],
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to regenerate draft';
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
        throw new Error(
          'No recipients specified. Please regenerate with recipients.'
        );
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save draft';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  // Keyboard handlers for Cmd+Enter
  const handleInstructionsKeyDown = useKeyboardSubmit(generateDraft);
  const handleFeedbackKeyDown = useKeyboardSubmit(regenerateDraft);

  const isBlankState = !draft;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-6 pt-6 pb-4 border-b border-border">
        <h2 id="compose-modal-title" className="text-xl font-semibold tracking-tight">
          Compose New Email
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isBlankState
            ? 'Describe the email you want to write'
            : 'Review and refine your draft'}
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex-none mx-6 mt-4">
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isBlankState ? (
          /* ========== BLANK STATE ========== */
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                What would you like to write?
              </CardTitle>
              <CardDescription>
                Include recipients and context. For example: &quot;Email
                john@example.com about the Q1 results meeting&quot;
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onKeyDown={handleInstructionsKeyDown}
                placeholder="Email john@example.com and cc jane@example.com about scheduling the quarterly review..."
                className="min-h-32 resize-none"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to generate
              </p>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-4">
              <Button
                onClick={generateDraft}
                disabled={loading || !instructions.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    Generate Draft
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        ) : (
          /* ========== DRAFT STATE ========== */
          <div className="space-y-4">
            {/* Draft Card - Subject, Recipients, Body */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{subject}</CardTitle>
                  <Badge variant="secondary">Draft</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">To:</span>
                    {recipients.to.length > 0 ? (
                      <span>{recipients.to.join(', ')}</span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        No recipients
                      </span>
                    )}
                  </div>
                  {recipients.cc.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Cc:</span>
                      <span>{recipients.cc.join(', ')}</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {draft}
                </div>
              </CardContent>
            </Card>

            {/* Feedback / Iteration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className="size-4 text-muted-foreground" />
                  Refine Draft
                </CardTitle>
                <CardDescription>
                  Want changes? Describe what to adjust.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={handleFeedbackKeyDown}
                  placeholder="Make it more concise, add a deadline, change the tone..."
                  className="min-h-20 resize-none"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to regenerate
                </p>
              </CardContent>
              <CardFooter className="border-t pt-4">
                <Button
                  onClick={regenerateDraft}
                  disabled={loading || !feedback.trim()}
                  variant="secondary"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4 mr-2" />
                      Regenerate
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>

      {/* Footer Actions - Fixed */}
      {!isBlankState && (
        <div className="flex-none px-6 py-4 border-t border-border bg-background">
          <div className="flex items-center justify-between">
            <Button onClick={onClose} variant="ghost" disabled={loading || saving}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={loading || saving || recipients.to.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Send className="size-4 mr-2" />
                  Save to Gmail
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
