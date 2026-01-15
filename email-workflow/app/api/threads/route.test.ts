import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: [messageId],
          folders: ['INBOX', 'Label_139', 'Label_215'],
        },
      }),
    });

    // Mock message fetch - returns folders as string[]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'Label_139'],
        },
      }),
    });

    // Mock message update
    mockFetch.mockResolvedValueOnce({
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

    // Verify message fetch used ?select=folders
    const msgFetchCall = mockFetch.mock.calls[1];
    expect(msgFetchCall[0]).toContain('?select=folders');

    // Verify message update sent correct body with 'folders' key
    const updateCall = mockFetch.mock.calls[2];
    const updateBody = JSON.parse(updateCall[1].body);

    expect(updateBody).toHaveProperty('folders');
    expect(updateBody.folders).toContain('Label_215');
    expect(updateBody.folders).not.toContain('Label_139');
    expect(updateBody.folders).toContain('INBOX');
  });

  it('handles folders as string[] format from Nylas API', async () => {
    const threadId = 'thread-123';
    const messageId = 'msg-456';

    // Mock thread fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: [messageId],
        },
      }),
    });

    // Mock message fetch - folders is string[] in Nylas API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'SENT', 'Label_139'],
        },
      }),
    });

    // Mock message update
    mockFetch.mockResolvedValueOnce({
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
    const updateCall = mockFetch.mock.calls[2];
    const updateBody = JSON.parse(updateCall[1].body);

    // Should have removed Label_139 and added Label_215
    expect(updateBody.folders).toEqual(
      expect.arrayContaining(['INBOX', 'SENT', 'Label_215'])
    );
    expect(updateBody.folders).not.toContain('Label_139');
  });

  it('updates multiple messages in a thread independently', async () => {
    // Real-world scenario:
    // - Thread has Label_139 (applied to first message only)
    // - Latest message doesn't have Label_139
    // - We need to remove Label_139 from the thread

    const threadId = 'thread-123';
    const msg1 = 'msg-first'; // Has Label_139
    const msg2 = 'msg-latest'; // Does NOT have Label_139

    // Mock thread fetch - thread shows all labels
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: [msg1, msg2],
          folders: ['INBOX', 'Label_139', 'SENT'],
        },
      }),
    });

    // Mock first message fetch - HAS Label_139
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'Label_139'],
        },
      }),
    });

    // Mock second message fetch - does NOT have Label_139
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'SENT'],
        },
      }),
    });

    // Mock first message update
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    // Mock second message update
    mockFetch.mockResolvedValueOnce({
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

    // With batched parallel, fetches happen first, then updates
    // Calls: [thread fetch, msg1 fetch, msg2 fetch, msg1 update, msg2 update]
    expect(mockFetch.mock.calls.length).toBe(5);

    // Verify updates happened
    const update1 = mockFetch.mock.calls[3];
    const update1Body = JSON.parse(update1[1].body);
    expect(update1Body.folders).not.toContain('Label_139');
    expect(update1Body.folders).toContain('Label_215');

    const update2 = mockFetch.mock.calls[4];
    const update2Body = JSON.parse(update2[1].body);
    expect(update2Body.folders).toContain('Label_215');
  });

  it('returns error when thread fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({
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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: ['msg-1', 'msg-2'],
        },
      }),
    });

    // Mock first message fetch - FAILS
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => 'Message not found',
    });

    // Mock second message fetch - succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'Label_139'],
        },
      }),
    });

    // Mock second message update
    mockFetch.mockResolvedValueOnce({
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

    // Verify: thread fetch + 2 message fetches + 1 update = 4 calls
    expect(mockFetch.mock.calls.length).toBe(4);
  });

  it('returns 400 for invalid request body', async () => {
    const request = createRequest({
      // Missing required fields
      threadId: 'thread-123',
      // addLabels and removeLabels missing
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid request');
    expect(json.details).toBeDefined();
  });

  it('returns 500 when environment variables are missing', async () => {
    // Remove env vars
    delete process.env.NYLAS_API_KEY;
    delete process.env.NYLAS_GRANT_ID;

    const request = createRequest({
      threadId: 'thread-123',
      addLabels: ['Label_215'],
      removeLabels: ['Label_139'],
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Service configuration error');
  });

  it('skips update when folders have not changed', async () => {
    const threadId = 'thread-123';
    const messageId = 'msg-456';

    // Mock thread fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: threadId,
          message_ids: [messageId],
        },
      }),
    });

    // Mock message fetch - already has Label_215, doesn't have Label_139
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          folders: ['INBOX', 'Label_215'], // Already in desired state
        },
      }),
    });

    const request = createRequest({
      threadId,
      addLabels: ['Label_215'],
      removeLabels: ['Label_139'],
    });

    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);

    // Should only have 2 calls: thread fetch + message fetch, NO update
    expect(mockFetch.mock.calls.length).toBe(2);
  });
});
