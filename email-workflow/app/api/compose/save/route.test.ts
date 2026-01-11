import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock fetch globally
global.fetch = vi.fn();

describe('POST /api/compose/save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NYLAS_API_KEY = 'test-key';
    process.env.NYLAS_GRANT_ID = 'test-grant-id';
  });

  it('saves compose draft to Gmail without reply_to_message_id', async () => {
    const userEmail = 'paul@example.com';

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

    const request = new Request('http://localhost:3000/api/compose/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Q1 Financial Results',
        draftBody: 'Hi John,\n\nHere are the results...\n\nBest,\nPaul',
        to: ['john@example.com'],
        cc: ['jane@example.com'],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.draftId).toBe('draft-123');

    // Verify draft creation call
    const draftCall = (fetch as any).mock.calls[1];
    const draftBody = JSON.parse(draftCall[1].body);

    expect(draftBody.subject).toBe('Q1 Financial Results'); // NOT "Re: ..."
    expect(draftBody.reply_to_message_id).toBeUndefined(); // NO reply_to_message_id
    expect(draftBody.thread_id).toBeUndefined(); // NO thread_id
    expect(draftBody.to).toEqual([{ email: 'john@example.com' }]);
  });

  it('filters current user from CC recipients', async () => {
    const userEmail = 'paul@example.com';

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

    const request = new Request('http://localhost:3000/api/compose/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test Subject',
        draftBody: 'Test body',
        to: ['john@example.com'],
        cc: ['paul@example.com', 'jane@example.com'], // User in CC
      }),
    });

    await POST(request);

    // Verify draft creation was called with filtered CC (user removed)
    const draftCall = (fetch as any).mock.calls[1];
    const draftBody = JSON.parse(draftCall[1].body);

    expect(draftBody.cc).toHaveLength(1);
    expect(draftBody.cc[0].email).toBe('jane@example.com');
    expect(
      draftBody.cc.find((r: any) => r.email === 'paul@example.com')
    ).toBeUndefined();
  });

  it('converts plain text to HTML with paragraphs', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { email: 'paul@example.com' } }),
    });

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: 'draft-123' } }),
    });

    const request = new Request('http://localhost:3000/api/compose/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test',
        draftBody: 'Line 1\n\nLine 2\n\nLine 3',
        to: ['john@example.com'],
        cc: [],
      }),
    });

    await POST(request);

    const draftCall = (fetch as any).mock.calls[1];
    const draftBody = JSON.parse(draftCall[1].body);

    expect(draftBody.body).toBe('<p>Line 1</p><p>Line 2</p><p>Line 3</p>');
  });

  it('validates recipient email format', async () => {
    const request = new Request('http://localhost:3000/api/compose/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test',
        draftBody: 'Test body',
        to: ['invalid-email'], // Invalid email format
        cc: [],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request');
  });

  it('requires at least one To recipient', async () => {
    const request = new Request('http://localhost:3000/api/compose/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test',
        draftBody: 'Test body',
        to: [], // Empty To array
        cc: ['jane@example.com'],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request');
  });

  it('handles Nylas draft creation failure', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { email: 'paul@example.com' } }),
    });

    // Mock Nylas draft failure
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      text: async () => 'Nylas API error',
    });

    const request = new Request('http://localhost:3000/api/compose/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test',
        draftBody: 'Test body',
        to: ['john@example.com'],
        cc: [],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to save draft');
  });
});
