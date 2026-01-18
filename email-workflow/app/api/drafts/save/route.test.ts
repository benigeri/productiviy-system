import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, buildGmailQuotedReply, buildGmailQuotedReplyWithHtml, extractReplyText } from './route';
import { NextResponse } from 'next/server';

// Mock fetch globally
global.fetch = vi.fn();

describe('extractReplyText', () => {
  it('extracts reply text before quoted section', () => {
    const draftBody = `Thanks for the update!

Best,
Paul

On Sat, Jan 18, 2026 at 10:30 AM John Doe <john@example.com> wrote:
> Here is the original message content.`;

    const result = extractReplyText(draftBody);

    expect(result).toContain('Thanks for the update!');
    expect(result).toContain('Best,');
    expect(result).toContain('Paul');
    expect(result).not.toContain('On Sat, Jan 18');
    expect(result).not.toContain('Here is the original');
  });

  it('returns full text when no quoted section', () => {
    const draftBody = `Just a simple message.

Best,
Paul`;

    const result = extractReplyText(draftBody);
    expect(result).toBe(draftBody);
  });
});

describe('buildGmailQuotedReplyWithHtml', () => {
  it('includes original HTML in blockquote without escaping', () => {
    const replyText = 'Thanks for the update!';
    const originalHtml = '<div style="color:blue"><p>Original <strong>formatted</strong> message</p></div>';
    const sender = { name: 'John Doe', email: 'john@example.com' };
    const date = 1704067200; // Jan 1, 2024 UTC

    const result = buildGmailQuotedReplyWithHtml(replyText, originalHtml, sender, date);

    // Critical: Should contain ORIGINAL HTML unescaped (not &lt;div&gt;)
    expect(result).toContain('<div style="color:blue">');
    expect(result).toContain('<strong>formatted</strong>');
    expect(result).not.toContain('&lt;div');
    expect(result).not.toContain('&lt;strong');
  });

  it('uses Superhuman-compatible structure (no gmail_extra/gmail_attr)', () => {
    const result = buildGmailQuotedReplyWithHtml(
      'Reply',
      '<p>Original</p>',
      { name: 'Test', email: 'test@example.com' },
      1704067200
    );

    // MUST have gmail_quote class for quote detection
    expect(result).toContain('class="gmail_quote"');

    // MUST NOT have gmail_extra wrapper - breaks quote collapsing in Superhuman
    expect(result).not.toContain('gmail_extra');

    // MUST NOT have gmail_attr wrapper - breaks quote collapsing in Superhuman
    expect(result).not.toContain('gmail_attr');
  });

  it('wraps sender email in mailto link with span dir=ltr', () => {
    const result = buildGmailQuotedReplyWithHtml(
      'Reply',
      '<p>Original</p>',
      { name: 'John Doe', email: 'john@example.com' },
      1704067200
    );

    // Attribution must have mailto link for proper detection
    expect(result).toContain('href="mailto:john@example.com"');
    expect(result).toContain('<span dir="ltr">');
    expect(result).toContain('John Doe');
  });

  it('uses shorthand blockquote style values', () => {
    const result = buildGmailQuotedReplyWithHtml(
      'Reply',
      '<p>Original</p>',
      { email: 'test@example.com' },
      1704067200
    );

    // Style must use shorthand values (not 0px, not rgb())
    expect(result).toContain('margin:0 0 0 .8ex');
    expect(result).toContain('border-left:1px #ccc solid');
    expect(result).not.toContain('rgb(');
    expect(result).not.toContain('0px');
  });

  it('uses email as sender name when name is missing', () => {
    const result = buildGmailQuotedReplyWithHtml(
      'Reply',
      '<p>Original</p>',
      { email: 'test@example.com' },
      1704067200
    );

    // Email should appear both in attribution text and mailto link
    expect(result).toMatch(/test@example\.com.*href="mailto:test@example\.com"/);
  });

  it('preserves complex nested HTML structures unchanged', () => {
    const complexHtml = `<html><head></head><body>
      <div class="gmail_quote">
        <blockquote style="margin:0">
          <div style="color:red"><strong>Nested</strong> content</div>
        </blockquote>
      </div>
    </body></html>`;

    const result = buildGmailQuotedReplyWithHtml(
      'Reply',
      complexHtml,
      { email: 'test@example.com' },
      1704067200
    );

    // Original HTML must be preserved exactly - no escaping or modification
    expect(result).toContain(complexHtml);
  });
});

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

    // Mock original message API response (for quote HTML)
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          body: '<div>Original message HTML</div>',
          from: [{ name: 'Test Sender', email: 'sender@example.com' }],
          date: 1704067200, // Jan 1, 2024
        },
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
    // Index 2 because: 0=grant, 1=original message, 2=draft creation
    const draftCall = (fetch as any).mock.calls[2];
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

    // Mock original message API response (for quote HTML)
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          body: '<div>Original message HTML</div>',
          from: [{ name: 'Test Sender', email: 'sender@example.com' }],
          date: 1704067200, // Jan 1, 2024
        },
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

    // Verify draft creation was called with ALL CC recipients (no filtering)
    // Index 2 because: 0=grant, 1=original message, 2=draft creation
    const draftCall = (fetch as any).mock.calls[2];
    const draftBody = JSON.parse(draftCall[1].body);

    expect(draftBody.cc).toHaveLength(2);
    expect(draftBody.cc.find((r: any) => r.email === 'user@example.com')).toBeDefined();
    expect(draftBody.cc.find((r: any) => r.email === 'other@example.com')).toBeDefined();
  });
});
