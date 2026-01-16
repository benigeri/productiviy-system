---
status: pending
priority: p1
issue_id: "034"
tags: [code-review, performance, reliability, braintrust]
---

# Add API Timeouts to External Calls

## Problem Statement

All external API calls (Braintrust, Linear) lack timeout configuration. If these APIs are slow or unresponsive, requests hang indefinitely until Supabase's 2-minute function timeout kills them.

**Why it matters:** Resource exhaustion, poor user experience, cascading failures when one API is slow.

## Findings

### From Performance Oracle & Data Integrity Guardian:

1. **braintrust.ts:82-96** - No timeout on LLM API call
   ```typescript
   const response = await fetchFn("https://braintrustproxy.com/v1/chat/completions", {
     method: "POST",
     // No signal/timeout
   });
   ```

2. **linear.ts:43-61** - No timeout on GraphQL mutation
   ```typescript
   const response = await fetchFn("https://api.linear.app/graphql", {
     method: "POST",
     // No signal/timeout
   });
   ```

**Impact at scale:** At 100x load with 5% API slowdowns, 5% of requests block resources indefinitely.

## Proposed Solutions

### Option A: AbortController with Timeout (Recommended)
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
  const response = await fetchFn(url, {
    ...options,
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeoutId);
}
```
- **Pros:** Standard pattern, no dependencies
- **Cons:** Boilerplate per call
- **Effort:** Small
- **Risk:** Low

### Option B: Wrapper Function
Create `fetchWithTimeout(url, options, timeoutMs)` utility.
- **Pros:** DRY, consistent timeouts
- **Cons:** Another abstraction layer
- **Effort:** Small
- **Risk:** Low

## Technical Details

**Affected files:**
- `supabase/functions/_shared/lib/braintrust.ts`
- `supabase/functions/_shared/lib/linear.ts`

**Recommended timeouts:**
- Braintrust LLM: 30 seconds (LLM calls can be slow)
- Linear API: 10 seconds (should be fast)

## Acceptance Criteria

- [ ] All fetch calls have timeout configured
- [ ] Timeout errors are caught and return user-friendly messages
- [ ] Tests cover timeout scenarios

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Performance Oracle and Data Integrity Guardian |

## Resources

- PR: feature/ps-34-braintrust-linear
- [AbortController MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
