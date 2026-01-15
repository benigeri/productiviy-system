---
status: complete
priority: p2
issue_id: "031"
tags: [code-review, performance, api, pr-92]
dependencies: []
created: 2026-01-14
---

# Parallelize Message Updates for Performance

## Problem Statement

**Location**: `email-workflow/app/api/threads/route.ts:35-78`

The route processes messages sequentially in a for loop, making 2N API calls for N messages. This creates latency that scales linearly with thread size.

**Why it matters**:
- A 50-message thread takes ~15 seconds (at 150ms/call)
- Poor UX for long email threads
- Inefficient use of async/await

## Findings

### From Performance Oracle Agent:

**Current Pattern (Sequential):**
```typescript
for (const msgId of messageIds) {
  const msgRes = await fetch(...);  // Wait
  const updateRes = await fetch(...);  // Wait again
}
```

**Performance Impact:**
| Messages | API Calls | Estimated Latency |
|----------|-----------|-------------------|
| 5        | 11        | 1.65s             |
| 10       | 21        | 3.15s             |
| 25       | 51        | 7.65s             |
| 50       | 101       | 15.15s            |

### From Codebase Pattern:
`drafts/save/route.ts:190-246` uses `Promise.allSettled` for parallel operations.

## Proposed Solutions

### Option 1: Promise.allSettled with Batching (Recommended)
**Effort**: Medium (1-2 hours)
**Risk**: Low

```typescript
const BATCH_SIZE = 5;  // Avoid rate limits

// Batch fetch all messages
const messageResults = await batchedParallel(
  messageIds,
  async (msgId) => {
    const res = await fetch(`...messages/${msgId}?select=folders`, ...);
    if (!res.ok) return null;
    const msg = await res.json();
    return { msgId, folders: msg.data.folders || [] };
  },
  BATCH_SIZE
);

// Calculate updates
const updates = messageResults
  .filter(r => r.status === 'fulfilled' && r.value)
  .map(r => ({ msgId: r.value.msgId, newFolders: calculateFolders(...) }));

// Batch update all messages
await batchedParallel(
  updates,
  async ({ msgId, newFolders }) => fetch(..., { method: 'PUT', ... }),
  BATCH_SIZE
);
```

**Pros:**
- 5-10x faster for large threads
- Still respects rate limits with batching
- Graceful degradation on partial failures

**Cons:**
- More complex code
- Need to add batching utility

### Option 2: Simple Promise.all
**Effort**: Small (30 min)
**Risk**: Medium (rate limiting)

```typescript
await Promise.all(messageIds.map(async (msgId) => {
  // fetch and update
}));
```

**Pros:**
- Simpler code
- Maximum parallelism

**Cons:**
- May hit Nylas rate limits for large threads

## Recommended Action

Option 1 with batching - provides performance gains while protecting against rate limits.

## Technical Details

### Affected Files:
- `email-workflow/app/api/threads/route.ts:35-78`

### Helper Function Needed:
```typescript
async function batchedParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number
): Promise<PromiseSettledResult<R>[]>
```

## Acceptance Criteria

- [ ] Messages fetched in parallel batches
- [ ] Messages updated in parallel batches
- [ ] Batch size limits prevent rate limiting
- [ ] Partial failures handled gracefully
- [ ] Response time < 3s for 50-message thread

## Work Log

### 2026-01-14 - Created from PR #92 Review
- Identified by Performance Oracle agent
- Classified as P2 - performance improvement

## Resources

- PR: https://github.com/benigeri/productiviy-system/pull/92
- Pattern: `drafts/save/route.ts:190-246`
