---
status: pending
priority: p1
issue_id: "037"
tags: [code-review, security, authentication]
---

# Fix Fail-Open Authentication Bypass

## Problem Statement

Both Telegram and Slack webhook handlers have fail-open authentication. When secrets are not configured, validation is skipped entirely, allowing unauthenticated access.

**Why it matters:** Misconfiguration leads to security bypass, production exposure risk.

## Findings

### From Security Sentinel:

**1. Telegram Webhook** (`telegram.ts:94-104`):
```typescript
export function validateWebhookSecret(
  headers: Headers,
  expectedSecret: string | undefined
): boolean {
  if (expectedSecret === undefined) {
    return true;  // FAIL-OPEN: Skips validation entirely
  }
  // ...
}
```

**2. Slack Webhook** (`slack-webhook/index.ts:156-169`):
```typescript
if (deps.signingSecret) {  // Only verifies IF signingSecret is set
  // ... verification logic
}
```

**Risk:** If `TELEGRAM_WEBHOOK_SECRET` or `SLACK_SIGNING_SECRET` is accidentally unset or misconfigured in production, webhooks become publicly accessible.

## Proposed Solutions

### Option A: Fail-Closed (Recommended)
Change to reject requests when secret is not configured.

```typescript
// Telegram
if (expectedSecret === undefined) {
  console.error("TELEGRAM_WEBHOOK_SECRET not configured - rejecting request");
  return false;  // FAIL-CLOSED
}

// Slack
if (!deps.signingSecret) {
  return jsonResponse({ error: "Signing secret not configured" }, 500);
}
```
- **Pros:** Secure by default, clear error when misconfigured
- **Cons:** Breaks local development without secrets
- **Effort:** Small
- **Risk:** Low (but need to ensure secrets are set in all envs)

### Option B: Warn but Allow in Development
Allow bypass only when explicit development flag is set.

```typescript
if (expectedSecret === undefined) {
  if (Deno.env.get("ALLOW_UNAUTHENTICATED_WEBHOOKS") === "true") {
    console.warn("WARNING: Webhook secret not configured, allowing unauthenticated access");
    return true;
  }
  return false;
}
```
- **Pros:** Safe in production, convenient in development
- **Cons:** Another env var to manage
- **Effort:** Small
- **Risk:** Low

## Technical Details

**Affected files:**
- `supabase/functions/telegram-webhook/lib/telegram.ts`
- `supabase/functions/slack-webhook/index.ts`

## Acceptance Criteria

- [ ] Missing secrets cause request rejection (not bypass)
- [ ] Clear error logs when secrets are missing
- [ ] All environments have secrets configured
- [ ] Tests updated to reflect fail-closed behavior

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Security Sentinel |

## Resources

- PR: feature/ps-34-braintrust-linear
