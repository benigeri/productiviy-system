---
status: pending
priority: p1
issue_id: "035"
tags: [code-review, data-integrity, slack, reliability]
---

# Fix Fire-and-Forget Pattern Data Loss

## Problem Statement

The Slack message shortcut handler uses a fire-and-forget pattern that returns 200 OK immediately, then processes in the background. If processing fails, the user believes their action succeeded, but the Linear issue is never created.

**Why it matters:** Silent data loss, poor user trust, no way to recover or retry.

## Findings

### From Data Integrity Guardian & TypeScript Reviewer:

**Location:** `slack-webhook/index.ts:248-295`

```typescript
const processShortcut = async () => {
  try {
    // ... processing logic ...
    console.log("Shortcut processed successfully");
  } catch (error) {
    console.error("Shortcut processing error:", error);  // Only logged!
  }
};

// Fire and forget - don't await
processShortcut();

// Return immediately to satisfy Slack's 3-second requirement
return new Response("", { status: 200 });
```

**Data Loss Scenario:**
1. User right-clicks Slack message, selects "Send to Linear"
2. Slack receives 200 OK, shows success to user
3. Background `processShortcut()` fails (timeout, rate limit, etc.)
4. User never knows the issue was not created

## Proposed Solutions

### Option A: Use Slack's response_url (Recommended)
Send a follow-up message to the user on failure using Slack's `response_url`.

```typescript
catch (error) {
  console.error("Shortcut processing error:", error);
  // Notify user of failure
  await fetch(payload.response_url, {
    method: "POST",
    body: JSON.stringify({
      text: "Failed to create Linear issue. Please try again.",
      response_type: "ephemeral"
    })
  });
}
```
- **Pros:** User gets feedback, no infrastructure changes
- **Cons:** Still no retry, notification may also fail
- **Effort:** Small
- **Risk:** Low

### Option B: Implement Retry Queue
Store failed operations in Supabase database for retry.
- **Pros:** Guaranteed delivery, audit trail
- **Cons:** More infrastructure, complexity
- **Effort:** Medium
- **Risk:** Medium

### Option C: Synchronous Processing
Remove fire-and-forget, process synchronously with fast timeout.
- **Pros:** No silent failures
- **Cons:** May exceed Slack's 3-second limit
- **Effort:** Small
- **Risk:** High (could break Slack integration)

## Technical Details

**Affected files:**
- `supabase/functions/slack-webhook/index.ts`

**Slack constraint:** Slack requires response within 3 seconds for interactive components.

## Acceptance Criteria

- [ ] Users receive feedback when shortcut processing fails
- [ ] Failed operations are logged with full context
- [ ] Consider implementing retry mechanism

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Data Integrity Guardian and TypeScript Reviewer |

## Resources

- PR: feature/ps-34-braintrust-linear
- [Slack response_url docs](https://api.slack.com/interactivity/handling#responses)
