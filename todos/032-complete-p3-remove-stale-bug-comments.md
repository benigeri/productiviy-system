---
status: complete
priority: p3
issue_id: "032"
tags: [code-review, cleanup, pr-92]
dependencies: []
created: 2026-01-14
---

# Remove Stale "BUG" Comments from Tests

## Problem Statement

**Location**: `email-workflow/app/api/threads/route.test.ts:37-38, 99`

The test file contains comments describing a bug that has now been fixed. These comments are misleading and confusing.

**Why it matters**:
- Comments describe OLD bug, not current behavior
- Confuses future developers
- Looks like the code is still broken

## Findings

### From Simplicity Reviewer Agent:

**Stale Comments:**
```typescript
// Line 37-38:
// Mock message fetch - BUG: code uses ?select=labels which returns {}
// This should use ?select=folders and return string[] not {id}[]

// Line 99:
// BUG: Code expects labels: {id: string}[] but API returns folders: string[]
```

**Reality:** The bug is now fixed. The code correctly uses `?select=folders` and `string[]`.

## Proposed Solutions

### Option 1: Remove Comments (Recommended)
**Effort**: Trivial (5 min)
**Risk**: None

Simply delete lines 37-38 and 99.

### Option 2: Update Comments
**Effort**: Trivial (5 min)
**Risk**: None

```typescript
// Mock message fetch - returns folders as string[] (Nylas API format)
```

## Recommended Action

Option 1 - the tests are self-documenting. Extra comments about the bug fix add noise.

## Technical Details

### Affected Files:
- `email-workflow/app/api/threads/route.test.ts:37-38, 99`

## Acceptance Criteria

- [ ] Stale "BUG" comments removed
- [ ] Tests still pass
- [ ] No misleading documentation

## Work Log

### 2026-01-14 - Created from PR #92 Review
- Identified by Simplicity Reviewer agent
- Classified as P3 - cleanup

## Resources

- PR: https://github.com/benigeri/productiviy-system/pull/92
