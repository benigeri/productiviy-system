import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock Braintrust
vi.mock('braintrust', () => ({
  invoke: vi.fn(),
  wrapTraced: (fn: any) => fn,
  initLogger: vi.fn(() => ({})),
}));

import { invoke } from 'braintrust';

describe('POST /api/compose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BRAINTRUST_PROJECT_NAME = 'test-project';
    process.env.BRAINTRUST_API_KEY = 'test-api-key';
    process.env.BRAINTRUST_COMPOSE_SLUG = 'email-compose-v1';
  });

  it('generates compose email from instructions', async () => {
    // Mock Braintrust response with valid structure
    (invoke as any).mockResolvedValue({
      subject: 'Q1 Financial Results',
      body: 'Hi John,\n\nHere are the Q1 results...\n\nBest,\nPaul',
      to: ['john@example.com'],
      cc: ['jane@example.com'],
    });

    const request = new Request('http://localhost:3000/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions:
          'Email john@example.com and cc jane@example.com about Q1 financial results',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.subject).toBe('Q1 Financial Results');
    expect(data.to).toEqual(['john@example.com']);
    expect(data.cc).toEqual(['jane@example.com']);
    expect(data.body).toContain('Q1 results');
  });

  it('handles conversation history for regeneration', async () => {
    (invoke as any).mockResolvedValue({
      subject: 'Q1 Results (Revised)',
      body: 'Brief Q1 update...',
      to: ['john@example.com'],
      cc: [],
    });

    const request = new Request('http://localhost:3000/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: 'Make it shorter',
        conversationHistory: [
          { role: 'user', content: 'Email john@example.com about Q1' },
          { role: 'assistant', content: 'Long email body...' },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'test-project',
        slug: 'email-compose-v1',
        input: expect.objectContaining({
          user_input: expect.stringContaining('Make it shorter'),
        }),
      })
    );
  });

  it('validates AI response structure with Zod', async () => {
    // Mock invalid AI response (missing required fields)
    (invoke as any).mockResolvedValue({
      subject: 'Valid Subject',
      // Missing body, to, cc
    });

    const request = new Request('http://localhost:3000/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: 'Email john@example.com',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('invalid response');
  });

  it('returns 400 for invalid request', async () => {
    const request = new Request('http://localhost:3000/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Missing instructions field
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request');
  });

  it('handles empty recipient arrays', async () => {
    // AI returns no recipients (valid but unusual)
    (invoke as any).mockResolvedValue({
      subject: 'No Recipients',
      body: 'Please specify recipients in your instruction.',
      to: [],
      cc: [],
    });

    const request = new Request('http://localhost:3000/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: 'Write an email about Q1',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.to).toEqual([]);
    expect(data.cc).toEqual([]);
  });
});
