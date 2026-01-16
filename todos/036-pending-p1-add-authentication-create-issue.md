---
status: pending
priority: p1
issue_id: "036"
tags: [code-review, security, authentication]
---

# Add Authentication to create-issue Endpoint

## Problem Statement

The `create-issue` endpoint has no authentication. Anyone who knows the URL can create Linear issues, potentially flooding the issue tracker with spam.

**Why it matters:** Abuse potential, API quota exhaustion, spam issues.

## Findings

### From Security Sentinel:

**Location:** `create-issue/index.ts:44-133`

The `handleCreateIssue` function processes requests without any authentication check. Unlike Telegram (webhook secret) and Slack (signature verification), this endpoint is fully public.

**Contrast with other endpoints:**
- Telegram: `validateWebhookSecret()` checks `X-Telegram-Bot-Api-Secret-Token`
- Slack: HMAC signature verification with `SLACK_SIGNING_SECRET`
- create-issue: No authentication at all

## Proposed Solutions

### Option A: API Key Header (Recommended)
Add a simple API key check in headers.

```typescript
const apiKey = request.headers.get("X-API-Key");
const expectedKey = Deno.env.get("CREATE_ISSUE_API_KEY");

if (!expectedKey || apiKey !== expectedKey) {
  return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
}
```
- **Pros:** Simple, works with Raycast/API clients
- **Cons:** API key management
- **Effort:** Small
- **Risk:** Low

### Option B: Supabase Auth
Use Supabase's built-in JWT verification.
- **Pros:** Proper auth, user tracking
- **Cons:** Requires auth flow for API clients
- **Effort:** Medium
- **Risk:** Low

### Option C: Keep Public + Rate Limiting
Keep endpoint public but add aggressive rate limiting.
- **Pros:** No auth complexity
- **Cons:** Still abusable, just slower
- **Effort:** Medium
- **Risk:** Medium

## Technical Details

**Affected files:**
- `supabase/functions/create-issue/index.ts`

**Note:** JWT verification was disabled (`verify_jwt: false`) to allow Raycast calls. Need to implement app-level auth instead.

## Acceptance Criteria

- [ ] Endpoint rejects unauthenticated requests with 401
- [ ] Valid API key allows requests
- [ ] Raycast command updated with API key header
- [ ] Environment variable documented

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Security Sentinel |

## Resources

- PR: feature/ps-34-braintrust-linear
