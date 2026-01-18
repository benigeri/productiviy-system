---
status: complete
priority: p2
issue_id: "029"
tags: [code-review, typescript, api, pr-92]
dependencies: []
created: 2026-01-14
---

# Use safeParse for Request Validation

## Problem Statement

**Location**: `email-workflow/app/api/threads/route.ts:12-14`

The route uses Zod's `.parse()` which throws on validation failure. This causes validation errors to return HTTP 500 instead of 400, inconsistent with other routes in the codebase.

**Why it matters**:
- Clients cannot distinguish between bad requests and server errors
- Inconsistent with established codebase pattern
- Makes debugging harder for API consumers

## Findings

### From Architecture Strategist Agent:

**Current Code:**
```typescript
const body = await request.json();
const { threadId, addLabels, removeLabels } =
  UpdateLabelsSchema.parse(body);
```

**Codebase Pattern (from compose/route.ts, drafts/route.ts):**
```typescript
const result = UpdateLabelsSchema.safeParse(body);
if (!result.success) {
  return NextResponse.json(
    { error: 'Invalid request', details: result.error.issues },
    { status: 400 }
  );
}
const { threadId, addLabels, removeLabels } = result.data;
```

### From Pattern Recognition Agent:
Every other API route uses `safeParse`:
- `compose/route.ts:106`
- `compose/save/route.ts:44`
- `drafts/route.ts:136`
- `drafts/save/route.ts:101`

## Proposed Solutions

### Option 1: Use safeParse Pattern (Recommended)
**Effort**: Small (15 min)
**Risk**: Low

```typescript
const body = await request.json();
const result = UpdateLabelsSchema.safeParse(body);
if (!result.success) {
  return NextResponse.json(
    { error: 'Invalid request', details: result.error.issues },
    { status: 400 }
  );
}
const { threadId, addLabels, removeLabels } = result.data;
```

**Pros:**
- Matches codebase pattern
- Returns proper 400 status code
- Includes validation details in response

**Cons:**
- Slightly more verbose

## Recommended Action

Option 1 - straightforward fix to match codebase conventions.

## Technical Details

### Affected Files:
- `email-workflow/app/api/threads/route.ts:12-14`
- `email-workflow/app/api/threads/route.test.ts:281-290` (update test expectation to 400)

## Acceptance Criteria

- [ ] Route uses `safeParse` instead of `parse`
- [ ] Validation errors return 400 with details
- [ ] Test updated to expect 400 status code
- [ ] All tests pass

## Work Log

### 2026-01-14 - Created from PR #92 Review
- Identified by Architecture Strategist and Pattern Recognition agents
- Classified as P2 - consistency issue

## Resources

- PR: https://github.com/benigeri/productiviy-system/pull/92
