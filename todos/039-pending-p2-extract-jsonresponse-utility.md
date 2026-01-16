---
status: pending
priority: p2
issue_id: "039"
tags: [code-review, patterns, dry]
---

# Extract jsonResponse to Shared Utility

## Problem Statement

The `jsonResponse` helper function is duplicated identically in 4 files. This violates DRY and makes updates error-prone.

**Why it matters:** Maintenance burden, inconsistency risk, code bloat.

## Findings

### From Pattern Recognition Specialist:

**Identical implementation in 4 files:**
- `telegram-webhook/index.ts:40-45`
- `slack-webhook/index.ts:81-86`
- `create-issue/index.ts:26-31`
- `nylas-webhook/index.ts:36-41`

```typescript
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

## Proposed Solutions

### Option A: Extract to Shared Utility (Recommended)

Create `supabase/functions/_shared/lib/http.ts`:

```typescript
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonResponseWithCors(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}
```

- **Pros:** DRY, single source of truth, can add CORS variant
- **Cons:** One more import
- **Effort:** Small
- **Risk:** Low

## Technical Details

**Files to modify:**
- Create: `supabase/functions/_shared/lib/http.ts`
- Update: All 4 webhook files to import from shared

## Acceptance Criteria

- [ ] Shared `http.ts` utility created
- [ ] All webhook files import from shared
- [ ] Local `jsonResponse` functions removed
- [ ] Tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Pattern Recognition Specialist |

## Resources

- PR: feature/ps-34-braintrust-linear
