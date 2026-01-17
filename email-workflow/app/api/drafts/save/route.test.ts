import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextResponse } from 'next/server';

// Mock fetch globally
global.fetch = vi.fn();

describe('POST /api/drafts/save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NYLAS_API_KEY = 'test-key';
    process.env.NYLAS_GRANT_ID = 'test-grant-id';
    // Gmail label env vars (required by gmail-labels module)
    process.env.GMAIL_LABEL_DRAFTED = 'Label_215';
    process.env.GMAIL_LABEL_TO_RESPOND_PAUL = 'Label_139';
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
