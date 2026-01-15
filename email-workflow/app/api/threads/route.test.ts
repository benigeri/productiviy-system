import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock fetch globally
global.fetch = vi.fn();

describe('POST /api/threads - Label Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NYLAS_API_KEY = 'test-key';
    process.env.NYLAS_GRANT_ID = 'test-grant-id';
  });

  const createRequest = (body: object) =>
    new Request('http://localhost:3000/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('removes labels from thread by updating messages with correct folders', async () => {
    const threadId = 'thread-123';
    const messageId = 'msg-456';

    // Mock thread fetch - returns message_ids
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: [messageId],
          folders: ['INBOX', 'Label_139', 'Label_215'],
        },
      }),
    });

    // Mock message fetch - BUG: code uses ?select=labels which returns {}
    // This should use ?select=folders and return string[] not {id}[]
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'Label_139'],
        },
      }),
    });

    // Mock message update
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const request = createRequest({
      threadId,
      addLabels: ['Label_215'],
      removeLabels: ['Label_139'],
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);

    // Verify message fetch used ?select=folders (not ?select=labels)
    const msgFetchCall = (fetch as any).mock.calls[1];
    expect(msgFetchCall[0]).toContain('?select=folders');

    // Verify message update sent correct body with 'folders' key (not 'labels')
    const updateCall = (fetch as any).mock.calls[2];
    const updateBody = JSON.parse(updateCall[1].body);

    expect(updateBody).toHaveProperty('folders');
    expect(updateBody.folders).toContain('Label_215');
    expect(updateBody.folders).not.toContain('Label_139');
    expect(updateBody.folders).toContain('INBOX');
  });

  it('handles folders as string[] not {id: string}[]', async () => {
    const threadId = 'thread-123';
    const messageId = 'msg-456';

    // Mock thread fetch
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: [messageId],
        },
      }),
    });

    // Mock message fetch - folders is string[] in Nylas API
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          // BUG: Code expects labels: {id: string}[] but API returns folders: string[]
          folders: ['INBOX', 'SENT', 'Label_139'],
        },
      }),
    });

    // Mock message update
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const request = createRequest({
      threadId,
      addLabels: ['Label_215'],
      removeLabels: ['Label_139'],
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);

    // Verify update was called with correct folders
    const updateCall = (fetch as any).mock.calls[2];
    const updateBody = JSON.parse(updateCall[1].body);

    // Should have removed Label_139 and added Label_215
    expect(updateBody.folders).toEqual(
      expect.arrayContaining(['INBOX', 'SENT', 'Label_215'])
    );
    expect(updateBody.folders).not.toContain('Label_139');
  });

  it('uses thread folders when message has fewer folders', async () => {
    // This is the real-world scenario:
    // - Thread has Label_139 (applied to first message only)
    // - Latest message doesn't have Label_139
    // - We need to remove Label_139 from the thread

    const threadId = 'thread-123';
    const msg1 = 'msg-first'; // Has Label_139
    const msg2 = 'msg-latest'; // Does NOT have Label_139

    // Mock thread fetch - thread shows all labels
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: [msg1, msg2],
          folders: ['INBOX', 'Label_139', 'SENT'], // Thread-level folders
        },
      }),
    });

    // Mock first message fetch - HAS Label_139
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'Label_139'],
        },
      }),
    });

    // Mock first message update
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    // Mock second message fetch - does NOT have Label_139
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'SENT'], // No Label_139!
        },
      }),
    });

    // Mock second message update
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const request = createRequest({
      threadId,
      addLabels: ['Label_215'],
      removeLabels: ['Label_139'],
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);

    // Verify first message had Label_139 removed
    const update1 = (fetch as any).mock.calls[2];
    const update1Body = JSON.parse(update1[1].body);
    expect(update1Body.folders).not.toContain('Label_139');
    expect(update1Body.folders).toContain('Label_215');

    // Verify second message got Label_215 added (even though it didn't have Label_139)
    const update2 = (fetch as any).mock.calls[4];
    const update2Body = JSON.parse(update2[1].body);
    expect(update2Body.folders).toContain('Label_215');
  });

  it('returns error when thread fetch fails', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      text: async () => 'Thread not found',
    });

    const request = createRequest({
      threadId: 'bad-thread',
      addLabels: ['Label_215'],
      removeLabels: ['Label_139'],
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Failed to update labels');
  });

  it('continues updating other messages when one message fetch fails', async () => {
    const threadId = 'thread-123';

    // Mock thread fetch with 2 messages
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: ['msg-1', 'msg-2'],
        },
      }),
    });

    // Mock first message fetch - FAILS
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      text: async () => 'Message not found',
    });

    // Mock second message fetch - succeeds
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'Label_139'],
        },
      }),
    });

    // Mock second message update
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const request = createRequest({
      threadId,
      addLabels: ['Label_215'],
      removeLabels: ['Label_139'],
    });

    const response = await POST(request);
    const json = await response.json();

    // Should still succeed overall
    expect(json.success).toBe(true);

    // Verify second message was still updated
    expect((fetch as any).mock.calls.length).toBe(4);
  });

  it('validates request body schema', async () => {
    const request = createRequest({
      // Missing required fields
      threadId: 'thread-123',
      // addLabels and removeLabels missing
    });

    const response = await POST(request);
    expect(response.status).toBe(500); // Zod throws
  });
});
