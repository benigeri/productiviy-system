---
status: pending
priority: p0
issue_id: "010"
tags: [code-review, data-integrity, error-handling]
dependencies: []
created: 2026-01-10
---

# Fix Label Update Error Handling in Approve Flow

## Problem Statement

**Location**: `email-workflow/app/api/drafts/route.ts:136-148`

The PUT endpoint saves the draft to Gmail successfully but **silently ignores failures** when updating thread labels. This creates data inconsistency where:
- Draft exists in Gmail
- Thread still has "to-respond-paul" label (should be removed)
- Thread doesn't have "drafted" label (should be added)
- User thinks email is complete but it reappears in inbox

**Why it matters**:
- Causes duplicate work (user drafts same email twice)
- Breaks workflow automation
- Data integrity violation (Gmail state != workflow state)
- **User confusion and lost productivity**

## Findings

### From Data Integrity Guardian Agent:

**Current Code:**
```typescript
// Draft saved successfully
const draft = await draftRes.json();

// Label update - NO error handling
await fetch(
  `${request.headers.get('origin') || 'http://localhost:3000'}/api/threads`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId,
      addLabels: ['Label_215'], // drafted label
      removeLabels: ['Label_139'], // to-respond-paul label
    }),
  }
);

// Returns success regardless of label update result!
return NextResponse.json({
  success: true,
  draftId: draft.data.id,
});
```

**Data Corruption Scenario:**
1. User clicks "Approve & Send to Gmail"
2. Draft saved to Gmail ✓
3. Label API call fails (network timeout, rate limit, etc.) ✗
4. API returns `{ success: true }` anyway
5. User sees success message and moves to next thread
6. Email still shows in "to-respond-paul" inbox on next visit
7. User drafts it again → duplicate drafts in Gmail

### From Rails Reviewer Agent:
In Rails, this pattern would be wrapped in a transaction that rolls back on any failure. The current implementation has no rollback mechanism and no compensation logic.

## Proposed Solutions

### Option 1: Check Response and Return Warning (Recommended)
**Effort**: Small (1 hour)
**Risk**: Low

```typescript
const labelRes = await fetch(/*...*/);

if (!labelRes.ok) {
  const error = await labelRes.text();
  console.error('Label update failed but draft was created:', {
    draftId: draft.data.id,
    error,
  });

  // Return partial success
  return NextResponse.json(
    {
      success: true,
      draftId: draft.data.id,
      warning: 'Draft saved but labels not updated. Please manually archive.',
    },
    { status: 207 } // Multi-Status
  );
}

return NextResponse.json({
  success: true,
  draftId: draft.data.id,
});
```

**Pros:**
- Simple to implement
- User is informed of partial failure
- Draft is not lost
- Can retry label update manually

**Cons:**
- Leaves system in inconsistent state
- Requires user intervention
- UI must handle warning messages

### Option 2: Rollback Draft on Label Failure
**Effort**: Medium (3-4 hours)
**Risk**: Medium

```typescript
const draft = await draftRes.json();
const labelRes = await fetch(/*...*/);

if (!labelRes.ok) {
  // Rollback: delete the draft we just created
  await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/drafts/${draft.data.id}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
      },
    }
  );

  throw new Error('Failed to update labels. Draft not saved.');
}
```

**Pros:**
- Maintains consistency (all-or-nothing)
- No partial failures
- User can safely retry

**Cons:**
- More complex
- User loses draft if label update fails
- Additional API call to Nylas

### Option 3: Retry Label Update with Exponential Backoff
**Effort**: Medium (2-3 hours)
**Risk**: Low

```typescript
async function updateLabelsWithRetry(url: string, body: object, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) return { success: true };

    // Exponential backoff: wait 1s, 2s, 4s...
    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
  }

  return { success: false, error: 'Max retries exceeded' };
}

// Use it
const labelResult = await updateLabelsWithRetry(url, body);
if (!labelResult.success) {
  // Handle failure (Option 1 or 2)
}
```

**Pros:**
- Handles transient failures automatically
- Most robust solution
- No user intervention for temporary issues

**Cons:**
- Longer request time (retries add latency)
- More complex implementation
- Could still fail after all retries

## Recommended Action

**Combination: Option 3 (Retry) + Option 1 (Warning on Final Failure)**

**Rationale:**
- Retries handle 90% of transient failures automatically
- Warning informs user of persistent issues
- Draft is preserved (not rolled back)
- Best balance of robustness and user experience

## Technical Details

### Affected Files:
- `email-workflow/app/api/drafts/route.ts:136-148`
- `email-workflow/app/inbox/ThreadDetail.tsx:179-182` (handle warning in response)

### Implementation Steps:
1. Create `updateLabelsWithRetry` utility function
2. Replace direct fetch with retry function
3. Check result and return warning if all retries fail
4. Update client to display warning to user
5. Add logging for failed label updates

### Testing:
```bash
# Simulate label API failure
# Verify retries occur
# Verify warning is returned after max retries
# Verify draft is still saved
```

## Acceptance Criteria

- [ ] Label update has retry logic (3 attempts with exponential backoff)
- [ ] Failed label updates return 207 status with warning message
- [ ] Draft is saved even if labels fail to update
- [ ] User sees clear warning when labels fail
- [ ] Error is logged with draft ID and thread ID for debugging
- [ ] Success case still works (no warning when labels update successfully)
- [ ] Tests verify both success and failure scenarios

## Work Log

### 2026-01-10 - Issue Created
- Identified by Data Integrity Guardian agent as HIGH severity
- Classified as P0 - can cause data loss and duplicate work
- Must be fixed before merging PR #61

## Resources

- PR: https://github.com/benigeri/productiviy-system/pull/61
- HTTP 207 Multi-Status: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/207
- Exponential Backoff Pattern: https://cloud.google.com/iot/docs/how-tos/exponential-backoff
