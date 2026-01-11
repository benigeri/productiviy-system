---
status: pending
priority: p0
issue_id: "008"
tags: [code-review, architecture, api-design]
dependencies: []
created: 2026-01-10
---

# Fix HTTP Method Semantics: PUT Should Be POST

## Problem Statement

**Location**: `email-workflow/app/api/drafts/route.ts:93-168`

The PUT endpoint at `/api/drafts` is semantically incorrect. It creates a **new** Gmail draft each time it's called, which violates REST conventions where PUT should be idempotent (safe to call multiple times with the same result).

**Why it matters**:
- Calling PUT multiple times creates duplicate drafts in Gmail
- Violates HTTP standards and will confuse future maintainers
- Makes the API unpredictable and error-prone

## Findings

### From Architecture Review Agent:
The PUT endpoint performs **non-idempotent operations**:
1. Creates a new draft in Gmail (via Nylas POST to `/drafts`)
2. Updates thread labels
3. Each call creates a brand new resource

**Correct HTTP semantics:**
- **POST** = Create new resource (non-idempotent)
- **PUT** = Update existing resource (idempotent)
- **PATCH** = Partial update

### From Rails Reviewer Agent:
This pattern would never pass Rails code review. Rails conventions are strict about REST semantics, and this violates the principle that PUT requests should be idempotent.

## Proposed Solutions

### Option 1: Rename to POST with Different Path (Recommended)
**Effort**: Small (1 hour)
**Risk**: Low

```typescript
// Separate endpoints for clarity
POST /api/drafts/generate  // Generate draft content (existing POST logic)
POST /api/drafts/save      // Save draft to Gmail (current PUT logic)
```

**Pros:**
- Clear separation of concerns
- Follows REST conventions
- No breaking changes needed

**Cons:**
- Requires updating client-side fetch calls
- Two routes instead of one

### Option 2: Resource-Oriented Design
**Effort**: Medium (3-4 hours)
**Risk**: Medium

```typescript
POST /api/drafts              // Create draft object, return {id, body}
POST /api/drafts/:id/send     // Send specific draft to Gmail
```

**Pros:**
- True RESTful design
- Draft exists as first-class resource
- Can support "save without sending" later

**Cons:**
- Requires state management for draft IDs
- More complex implementation
- Client needs to track draft IDs

### Option 3: Combined Endpoint with Action Parameter
**Effort**: Small (30 min)
**Risk**: Low

```typescript
POST /api/drafts?action=save  // Save to Gmail
POST /api/drafts?action=generate  // Generate only
```

**Pros:**
- Single endpoint
- Easy to implement
- Backward compatible

**Cons:**
- Less RESTful
- Action parameters are RPC-style

## Recommended Action

**Option 1** - Separate POST endpoints (`/api/drafts/generate` and `/api/drafts/save`)

**Rationale:**
- Clearest separation of concerns
- Minimal refactoring needed
- Follows REST conventions
- Easy to understand and maintain

## Technical Details

### Affected Files:
- `email-workflow/app/api/drafts/route.ts` (rename PUT to POST)
- `email-workflow/app/inbox/ThreadDetail.tsx:166-178` (update fetch URL)

### Breaking Changes:
- Client must update from `method: 'PUT'` to `method: 'POST'`
- API route file structure changes

### Migration Path:
1. Create new route at `/api/drafts/save/route.ts`
2. Move PUT logic to POST in new file
3. Update client to use new endpoint
4. Delete old PUT handler
5. Update API documentation

## Acceptance Criteria

- [ ] PUT endpoint removed from `/api/drafts/route.ts`
- [ ] New POST endpoint at `/api/drafts/save/route.ts` handles Gmail save
- [ ] Client updated to call correct endpoint
- [ ] All existing functionality works (draft save, label update, navigation)
- [ ] API follows REST conventions (POST for creation, PUT for updates)
- [ ] No duplicate drafts created when called multiple times

## Work Log

### 2026-01-10 - Issue Created
- Identified by Architecture Review and Rails Reviewer agents
- Classified as P0 blocking issue
- PR #61 should not merge until fixed

## Resources

- PR: https://github.com/benigeri/productiviy-system/pull/61
- REST API Design Best Practices: https://restfulapi.net/http-methods/
- HTTP Method Idempotency: https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
