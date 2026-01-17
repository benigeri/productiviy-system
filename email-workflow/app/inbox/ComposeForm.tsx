'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function ComposeForm({ onClose }: { onClose: () => void }) {
  const [instructions, setInstructions] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [recipients, setRecipients] = useState<{ to: string[]; cc: string[] }>({
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
    if (loading || saving) return; // Prevent double-click
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

      // Extract structured response: subject, to, cc, body
      const { subject, to = [], cc = [], body } = data;

      console.log('Compose draft generated:', {
        subject,
        to,
        cc,
        bodyLength: body.length,
        instructions,
      });

      // Update state with draft
      setDraft(body);
      setSubject(subject);
      setRecipients({ to, cc });

      // Update conversation history
      setConversationHistory([
        ...conversationHistory,
        { role: 'user', content: instructions },
        { role: 'assistant', content: body },
      ]);

      setInstructions(''); // Clear instructions after generating
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate draft';
      setError(message);
      console.error('Compose draft generation error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateDraft() {
    if (!feedback.trim()) return;
    if (loading || saving) return; // Prevent double-click

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: feedback,
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

      // Extract structured response
      const { subject, to = [], cc = [], body } = data;

      console.log('Draft regenerated:', {
        subject,
        to,
        cc,
        bodyLength: body.length,
        feedback,
      });

      // Update state with new draft
      setDraft(body);
      setSubject(subject);
      setRecipients({ to, cc });

      // Update conversation history
      setConversationHistory([
        ...conversationHistory,
        { role: 'user', content: feedback },
        { role: 'assistant', content: body },
      ]);

      setFeedback(''); // Clear feedback after regenerating
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to regenerate draft';
      setError(message);
      console.error('Draft regeneration error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!draft) return;
    if (loading || saving) return; // Prevent double-click

    setSaving(true);
    setError('');

    try {
      // Validate we have recipients
      if (recipients.to.length === 0) {
        throw new Error('No recipients specified. Please regenerate with recipients.');
      }

      console.log('Approving compose draft:', {
        subject,
        to: recipients.to,
        cc: recipients.cc,
      });

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

      console.log('Draft saved to Gmail:', data);

      // Close modal on success
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save draft';
      setError(message);
      console.error('Draft save error:', error);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    onClose();
  }

  // Sanitize email addresses for display (security fix)
  function sanitizeEmail(email: string): string {
    return encodeURIComponent(email);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Compose New Email</h2>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded text-error text-sm">
          {error}
        </div>
      )}

      {/* Initial Instructions Textarea (when no draft) */}
      {!draft && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Instructions
          </label>
          <p className="text-sm text-muted-foreground mb-2">
            Provide a brief instruction including recipients. Example: "Email
            john@example.com about Q1 results"
          </p>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Email john@example.com and cc jane@example.com about Q1 financial results"
            className="w-full h-32 p-3 border border-input rounded resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
          />
          <Button
            onClick={generateDraft}
            disabled={loading || !instructions.trim()}
            className="mt-3"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              'Generate Draft'
            )}
          </Button>
        </div>
      )}

      {/* Draft Preview (when draft exists) */}
      {draft && (
        <>
          {/* Subject Display */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Subject</label>
            <div className="p-3 bg-muted border border-border rounded">
              {subject}
            </div>
          </div>

          {/* Recipients Display (with sanitization) */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Recipients</label>
            <div className="p-3 bg-muted border border-border rounded space-y-1">
              <div>
                <strong>To:</strong>{' '}
                {recipients.to.length > 0
                  ? recipients.to.map(sanitizeEmail).join(', ')
                  : '(No recipients)'}
              </div>
              {recipients.cc.length > 0 && (
                <div>
                  <strong>CC:</strong> {recipients.cc.map(sanitizeEmail).join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Draft Body */}
          <Card className="mb-4">
            <CardContent className="p-4 bg-muted">
              <h3 className="font-semibold mb-2">Draft:</h3>
              <div className="whitespace-pre-wrap">{draft}</div>
            </CardContent>
          </Card>

          {/* Feedback Textarea */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Feedback (optional)
            </label>
            <p className="text-sm text-muted-foreground mb-2">
              Provide feedback to iterate on the draft. Example: "Make it more
              concise" or "Add Jane to CC"
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Make it shorter"
              className="w-full h-24 p-3 border border-input rounded resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={loading}
            />
            <Button
              onClick={regenerateDraft}
              disabled={loading || !feedback.trim()}
              className="mt-3"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Regenerating...
                </>
              ) : (
                'Regenerate Draft'
              )}
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleCancel}
              variant="outline"
              disabled={loading || saving}
            >
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
                'Approve & Send to Gmail'
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
