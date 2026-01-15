---
status: complete
priority: p3
issue_id: "033"
tags: [code-review, security, next.js, pr-92]
dependencies: []
created: 2026-01-14
---

# Add server-only Directive to Route

## Problem Statement

**Location**: `email-workflow/app/api/threads/route.ts:1`

The route is missing the `'server-only'` import that other routes use. This import prevents accidental client-side bundling of server code.

**Why it matters**:
- Could expose server-side logic patterns
- Consistency with codebase conventions
- Next.js best practice for API routes

## Findings

### From Architecture Strategist Agent:

**Current Code:**
```typescript
import { NextResponse } from 'next/server';
```

**Codebase Pattern:**
```typescript
// compose/route.ts, drafts/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
```

## Proposed Solutions

### Option 1: Add Import (Recommended)
**Effort**: Trivial (2 min)
**Risk**: None

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
```

## Recommended Action

Option 1 - one line change for consistency.

## Technical Details

### Affected Files:
- `email-workflow/app/api/threads/route.ts:1`

## Acceptance Criteria

- [ ] `import 'server-only'` added at line 1
- [ ] Route still works correctly
- [ ] Build succeeds

## Work Log

### 2026-01-14 - Created from PR #92 Review
- Identified by Architecture Strategist agent
- Classified as P3 - consistency

## Resources

- PR: https://github.com/benigeri/productiviy-system/pull/92
