---
status: pending
priority: p2
issue_id: code-review-plan-2026-01-11
tags: [architecture, code-review, refactoring, api-client]
dependencies: []
created: 2026-01-11
---

# Extract Nylas API Client Abstraction Layer

## Problem Statement

**What's broken:** Direct `fetch()` calls to Nylas API scattered across route handlers. No centralized error handling, retries, or testability.

**Why it matters:** Changes to Nylas API require updates in multiple files. Hard to mock for testing. No retry logic when API fails. Error handling duplicated.

**Current State:** Plan adds more Nylas API calls without addressing the underlying tight coupling.

**Evidence:** Architecture Strategist identified this as a key weakness causing maintainability issues.

## Findings

**From Architecture Review:**

```
Current State (Repeated Pattern):
// app/api/drafts/save/route.ts lines 68-84
const draftRes = await fetch(
  `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/drafts`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subject, body, to, cc }),
  }
);

Problems:
- URL construction duplicated
- Headers repeated
- No error handling
- No retry logic
- Hard to test (requires mocking fetch)
- Env vars accessed directly
```

**Impact:**
- Maintainability: Changes require updates in 3+ files
- Testability: Must mock fetch in every test
- Reliability: No retries on transient failures

## Proposed Solutions

### Solution 1: Dedicated NylasClient Class (Recommended)

**Approach:**
1. Create `/lib/clients/nylas-client.ts`
2. Encapsulate all API operations
3. Add retry logic with exponential backoff
4. Centralize error handling
5. Type-safe methods for each endpoint

**Pros:**
- Single source of truth for API calls
- Easy to mock (inject interface)
- Retry logic in one place
- Better error messages

**Cons:**
- Requires refactoring existing code
- More files to maintain

**Effort:** 4-6 hours
**Risk:** LOW - standard pattern

**Implementation:**
```typescript
// lib/clients/nylas-client.ts
export class NylasClient {
  constructor(
    private apiKey: string,
    private grantId: string,
    private baseUrl = 'https://api.us.nylas.com/v3'
  ) {}

  async createDraft(draft: {
    subject: string;
    body: string;
    to: EmailRecipient[];
    cc?: EmailRecipient[];
    reply_to_message_id?: string;
  }): Promise<NylasDraft> {
    return this.request<NylasDraft>('POST', `/grants/${this.grantId}/drafts`, draft);
  }

  async getMessages(messageIds: string[]): Promise<NylasMessage[]> {
    // Batch into chunks of 20 (Nylas limit)
    const chunks = chunk(messageIds, 20);
    const results = await Promise.all(
      chunks.map(ids => this.request<NylasMessage[]>('PUT', `/grants/${this.grantId}/messages/clean`, {
        message_id: ids,
        ignore_images: true,
      }))
    );
    return results.flat();
  }

  async updateMessageLabels(messageId: string, addLabels: string[], removeLabels: string[]): Promise<void> {
    await this.request('PUT', `/grants/${this.grantId}/messages/${messageId}`, {
      label_ids: addLabels,
      // Nylas API format for removing labels
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 3
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new NylasAPIError(
            `Nylas API error: ${response.status}`,
            response.status,
            errorText
          );
        }

        return await response.json();
      } catch (error) {
        const isRetryable = error instanceof NylasAPIError && error.statusCode >= 500;

        if (!isRetryable || attempt === retries) {
          throw error;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new Error('Max retries exceeded');
  }
}

export class NylasAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public rawError: string
  ) {
    super(message);
    this.name = 'NylasAPIError';
  }
}
```

**Usage in routes:**
```typescript
// app/api/drafts/save/route.ts
import { NylasClient } from '@/lib/clients/nylas-client';

export async function POST(request: Request) {
  const body = await request.json();

  const nylas = new NylasClient(
    process.env.NYLAS_API_KEY!,
    process.env.NYLAS_GRANT_ID!
  );

  // Clean, typed API
  const draft = await nylas.createDraft({
    subject: `Re: ${body.subject}`,
    body: body.draftBody,
    to: body.to,
    cc: body.cc,
    reply_to_message_id: body.latestMessageId,
  });

  return NextResponse.json({ success: true, draftId: draft.id });
}
```

**Testing:**
```typescript
// Mock the client for tests
class MockNylasClient implements NylasClient {
  async createDraft(draft: any) {
    return { id: 'draft-123', ...draft };
  }
  // ... other mocked methods
}

// Test without real API calls
describe('POST /api/drafts/save', () => {
  it('creates draft successfully', async () => {
    const mockClient = new MockNylasClient();
    // Inject mock client...
  });
});
```

### Solution 2: Reuse Existing Nylas Client

**Approach:**
1. Check `/supabase/functions/_shared/lib/nylas.ts` (mentioned in plan)
2. If suitable, import and use in email-workflow app
3. Extend if needed for new operations

**Pros:**
- No duplication
- Already tested
- Consistent API across projects

**Cons:**
- May not have all needed methods
- Coupling between supabase functions and Next.js app
- May have different architecture needs

**Effort:** 2-3 hours (investigation + adaptation)
**Risk:** MEDIUM - depends on existing client quality

**Investigation needed:**
```bash
# Check what exists
cat /Users/benigeri/Projects/productiviy-system/supabase/functions/_shared/lib/nylas.ts

# Questions:
# - Does it have createDraft method?
# - Does it have message fetching?
# - Does it handle retries?
# - Is it compatible with Next.js (uses Deno runtime)?
```

### Solution 3: Simple Wrapper Function (Quick Fix)

**Approach:**
1. Create utility function for common Nylas calls
2. Not a full client, just reduces duplication
3. Extract headers/auth into helper

**Pros:**
- Fast to implement (1 hour)
- Minimal refactoring needed
- Better than current scattered calls

**Cons:**
- Not as testable as full client
- Less type safety
- Still manual retry logic needed

**Effort:** 1-2 hours
**Risk:** LOW - incremental improvement

**Implementation:**
```typescript
// lib/utils/nylas-api.ts
async function nylasRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `https://api.us.nylas.com/v3${path}`,
    {
      ...options,
      headers: {
        'Authorization': `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Nylas API error: ${response.status}`);
  }

  return response.json();
}

// Usage
const draft = await nylasRequest('/grants/${grantId}/drafts', {
  method: 'POST',
  body: JSON.stringify({ subject, body, to, cc }),
});
```

## Recommended Action

**Primary:** Solution 1 (Dedicated Client Class)
- Most maintainable long-term
- Best for testing
- Proper error handling
- Type-safe API

**Alternative:** Solution 2 (Reuse Existing) IF existing client is high quality

**Timeline:**
- Day 1: Implement NylasClient class (4 hours)
- Day 2: Refactor existing routes to use client (2 hours)
- Day 3: Add unit tests for client (2 hours)

## Technical Details

**Affected Files:**
- `/email-workflow/lib/clients/nylas-client.ts` (new)
- `/email-workflow/app/api/drafts/route.ts` (use client)
- `/email-workflow/app/api/drafts/save/route.ts` (use client)
- `/email-workflow/app/api/threads/route.ts` (use client)
- `/email-workflow/app/inbox/page.tsx` (use client for fetching)

**Dependencies:** None (uses native fetch)

**Retry Configuration:**
```typescript
export const NYLAS_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};
```

## Acceptance Criteria

- [ ] All Nylas API calls go through client
- [ ] No direct fetch() calls to api.nylas.com in routes
- [ ] Retry logic handles transient failures
- [ ] Error messages include Nylas status codes
- [ ] Client is fully type-safe (TypeScript)
- [ ] Unit tests cover createDraft, getMessages, updateLabels
- [ ] Mock client works in tests (no real API calls)
- [ ] Performance unchanged or improved

## Work Log

### 2026-01-11 - Initial Finding
**Action:** Architecture review identified tight coupling to Nylas API
**Status:** Documented as P2 (important but not blocking)
**Next:** Decide between Solution 1 (new client) vs Solution 2 (reuse existing)

## Resources

- **Related PRs/Issues:** N/A
- **Documentation:**
  - Existing client: `/supabase/functions/_shared/lib/nylas.ts`
  - [Nylas API v3 Docs](https://developer.nylas.com/docs/v3/)
- **Similar Patterns:** Conversation storage (`lib/conversation.ts`) uses encapsulation well
- **Architecture Review:** Architecture Strategist agent report
