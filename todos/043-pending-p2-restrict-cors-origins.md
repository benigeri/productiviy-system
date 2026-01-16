---
status: pending
priority: p2
issue_id: "043"
tags: [code-review, security, cors]
---

# Restrict CORS Origins

## Problem Statement

The create-issue endpoint allows requests from any origin (`Access-Control-Allow-Origin: "*"`). This makes the endpoint accessible from any malicious website that can trick a user's browser into sending requests.

**Why it matters:** Cross-site request abuse potential, combined with no auth = spam risk.

## Findings

### From Security Sentinel:

**Location:** `create-issue/index.ts:35-36`

```typescript
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",  // Too permissive
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
```

**Risk:** Any website can send requests to this endpoint from a user's browser.

## Proposed Solutions

### Option A: Restrict to Known Origins (Recommended)

```typescript
const ALLOWED_ORIGINS = [
  "https://raycast.com",
  "chrome-extension://...",  // If using browser extension
];

function corsHeaders(requestOrigin: string | null): HeadersInit {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin || "")
    ? requestOrigin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
```

- **Pros:** Restricts access to known clients
- **Cons:** Need to maintain allowed list
- **Effort:** Small
- **Risk:** Low

### Option B: Remove CORS (Server-to-Server Only)
If the endpoint is only called from server-side clients (not browsers), CORS can be removed entirely.
- **Pros:** Simplest, most secure
- **Cons:** Breaks browser-based clients
- **Effort:** Small
- **Risk:** Medium (may break Raycast)

### Option C: Keep Permissive CORS + Require Auth
Keep `*` but require authentication (see todo 036).
- **Pros:** Works with any client
- **Cons:** Still allows CSRF probing
- **Effort:** Small (if auth already added)
- **Risk:** Low

## Technical Details

**Files to modify:**
- `supabase/functions/create-issue/index.ts`

**Note:** Raycast extensions run in a privileged context and may not need browser CORS. Test to confirm.

## Acceptance Criteria

- [ ] CORS restricted to known origins OR
- [ ] CORS removed if not needed for any client OR
- [ ] Authentication added as mitigation

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Security Sentinel |

## Resources

- PR: feature/ps-34-braintrust-linear
- [CORS MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
