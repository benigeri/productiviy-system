---
status: pending
priority: p2
issue_id: "041"
tags: [code-review, agent-native, api]
---

# Add Machine-Readable Error Codes

## Problem Statement

Error responses use human-readable strings only. Agents must parse strings to determine error type, which is fragile and error-prone.

**Why it matters:** Poor agent experience, fragile error handling.

## Findings

### From Agent-Native Reviewer:

**Current error responses:**
```json
{ "ok": false, "error": "Method not allowed" }
{ "ok": false, "error": "Missing or invalid 'text' field" }
{ "ok": false, "error": "Cleanup resulted in empty content" }
```

**Problem:** Agents must string-match to handle errors:
```typescript
if (response.error.includes("empty content")) {
  // Handle empty content
}
```

## Proposed Solutions

### Option A: Add Error Codes (Recommended)

**Enhanced response:**
```json
{
  "ok": false,
  "error": "Missing or invalid 'text' field",
  "code": "INVALID_INPUT"
}
```

**Proposed error codes:**
- `INVALID_METHOD` (405)
- `MISSING_TEXT` (400)
- `EMPTY_TEXT` (400)
- `EMPTY_AFTER_CLEANUP` (400)
- `CONFIG_ERROR` (500)
- `BRAINTRUST_ERROR` (500)
- `LINEAR_ERROR` (500)

- **Pros:** Machine-parseable, stable interface
- **Cons:** Need to maintain code list
- **Effort:** Small
- **Risk:** Low

## Technical Details

**Files to modify:**
- `supabase/functions/create-issue/index.ts`
- `supabase/functions/telegram-webhook/index.ts`
- `supabase/functions/slack-webhook/index.ts`

**Types to add:**
```typescript
type ErrorCode =
  | "INVALID_METHOD"
  | "MISSING_TEXT"
  | "EMPTY_TEXT"
  | "EMPTY_AFTER_CLEANUP"
  | "CONFIG_ERROR"
  | "BRAINTRUST_ERROR"
  | "LINEAR_ERROR";

interface ErrorResponse {
  ok: false;
  error: string;
  code: ErrorCode;
}
```

## Acceptance Criteria

- [ ] All error responses include `code` field
- [ ] Error codes are documented
- [ ] Error codes are stable (won't change)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Agent-Native Reviewer |

## Resources

- PR: feature/ps-34-braintrust-linear
