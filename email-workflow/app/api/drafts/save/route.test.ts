import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, buildGmailQuotedReply } from './route';
import { NextResponse } from 'next/server';

// Mock fetch globally
global.fetch = vi.fn();

describe('buildGmailQuotedReply', () => {
  it('generates Gmail-native HTML structure with proper classes for quote collapsing', () => {
    const draftBody = `Thanks for the update!

Best,
Paul

On Sat, Jan 18, 2026 at 10:30 AM John Doe <john@example.com> wrote:
> Here is the original message content.
> This is line 2 of the original.`;

    const result = buildGmailQuotedReply(draftBody);

    // Should have gmail_extra wrapper (recognized by quote detection libraries)
    expect(result).toContain('class="gmail_extra"');

    // Should have gmail_attr class on attribution line (for "On [date] wrote:" detection)
    expect(result).toContain('class="gmail_attr"');

    // Should have gmail_quote class on outer div
    expect(result).toContain('class="gmail_quote"');

    // Should have blockquote with gmail_quote class and proper styling
    expect(result).toContain('<blockquote class="gmail_quote"');
    expect(result).toContain('border-left:1px solid rgb(204,204,204)');

    // Should have dir="ltr" attributes for proper text direction
    expect(result).toContain('dir="ltr"');

    // Should contain the reply content
    expect(result).toContain('Thanks for the update!');

    // Should contain the quoted content
    expect(result).toContain('Here is the original message content');
    expect(result).toContain('This is line 2 of the original');

    // Should contain the attribution (without "wrote:" since we add it in HTML)
    expect(result).toContain('John Doe');
  });

  it('returns simple structure when no quoted content is present', () => {
    const draftBody = `Just a simple reply with no quotes.

Best,
Paul`;

    const result = buildGmailQuotedReply(draftBody);

    // Should NOT have gmail_extra or gmail_quote classes
    expect(result).not.toContain('gmail_extra');
    expect(result).not.toContain('gmail_quote');
    expect(result).not.toContain('gmail_attr');

    // Should have dir="ltr" wrapper
    expect(result).toContain('dir="ltr"');

    // Should contain the reply content
    expect(result).toContain('Just a simple reply');
  });

  it('properly escapes HTML in quoted content', () => {
    const draftBody = `Reply here.

On Sat, Jan 18, 2026 at 10:30 AM Sender <s@example.com> wrote:
> Check this <script>alert('xss')</script> content`;

    const result = buildGmailQuotedReply(draftBody);

    // Should NOT contain raw script tag
    expect(result).not.toContain('<script>');
    // Should contain escaped version
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('POST /api/drafts/save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NYLAS_API_KEY = 'test-key';
    process.env.NYLAS_GRANT_ID = 'test-grant-id';
    // Gmail label env vars (required by gmail-labels module)
    process.env.GMAIL_LABEL_DRAFTED = 'Label_215';
    process.env.GMAIL_LABEL_TO_RESPOND_PAUL = 'Label_139';
    process.env.GMAIL_LABEL_REVIEW = 'Label_999';
  });

  it('filters current user email from CC recipients', async () => {
    const userEmail = 'user@example.com';
    const ccRecipients = [
      { email: 'user@example.com', name: 'Current User' },
      { email: 'other@example.com', name: 'Other User' },
    ];

    // Mock grant API response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { email: userEmail },
      }),
    });

    // Mock draft creation response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { id: 'draft-123' },
      }),
    });

    // Mock label update response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
    });

    const request = new Request('http://localhost:3000/api/drafts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-1',
        subject: 'Test Subject',
        draftBody: 'Test draft body',
        to: [{ email: 'sender@example.com', name: 'Sender' }],
        cc: ccRecipients,
        latestMessageId: 'msg-123',
      }),
    });

    await POST(request);

    // Verify draft creation was called with filtered CC (user removed)
    const draftCall = (fetch as any).mock.calls[1];
    const draftBody = JSON.parse(draftCall[1].body);

    expect(draftBody.cc).toHaveLength(1);
    expect(draftBody.cc[0].email).toBe('other@example.com');
    expect(draftBody.cc.find((r: any) => r.email === 'user@example.com')).toBeUndefined();
  });

  it('includes all CC recipients when grant fetch fails', async () => {
    const ccRecipients = [
      { email: 'user@example.com', name: 'Current User' },
      { email: 'other@example.com', name: 'Other User' },
    ];

    // Mock grant API failure
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    // Mock draft creation response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { id: 'draft-123' },
      }),
    });

    // Mock label update response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
    });

    const request = new Request('http://localhost:3000/api/drafts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-1',
        subject: 'Test Subject',
        draftBody: 'Test draft body',
        to: [{ email: 'sender@example.com', name: 'Sender' }],
        cc: ccRecipients,
        latestMessageId: 'msg-123',
      }),
    });

    await POST(request);

    // Verify draft creation was called with ALL CC recipients (no filtering)
    const draftCall = (fetch as any).mock.calls[1];
    const draftBody = JSON.parse(draftCall[1].body);

    expect(draftBody.cc).toHaveLength(2);
    expect(draftBody.cc.find((r: any) => r.email === 'user@example.com')).toBeDefined();
    expect(draftBody.cc.find((r: any) => r.email === 'other@example.com')).toBeDefined();
  });
});
