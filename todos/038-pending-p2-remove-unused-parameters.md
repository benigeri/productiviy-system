---
status: pending
priority: p2
issue_id: "038"
tags: [code-review, simplicity, architecture]
---

# Remove Unused Parameters from processCapture

## Problem Statement

The `processCapture` function has two unused parameters (`_projectName`, `_slug`) that are passed through the entire call chain but never used. This creates API confusion and maintenance burden.

**Why it matters:** Misleading API, unnecessary env vars, cognitive load.

## Findings

### From Architecture Strategist, TypeScript Reviewer, and Code Simplicity Reviewer:

**Location:** `braintrust.ts:71-72`

```typescript
export async function processCapture(
  rawText: string,
  apiKey: string,
  _projectName: string,     // UNUSED
  _slug = "capture-cleanup", // UNUSED
  fetchFn: typeof fetch = fetch,
): Promise<CaptureResult>
```

The comment says "kept for API compatibility" but there's no external API - this is internal code.

**Ripple effect - env vars read but discarded:**
- `telegram-webhook/index.ts:112-113`
- `slack-webhook/index.ts:311-312`
- `create-issue/index.ts:62-63`

```typescript
const braintrustProject = Deno.env.get("BRAINTRUST_PROJECT_NAME") ?? "...";
const braintrustSlug = Deno.env.get("BRAINTRUST_CAPTURE_SLUG") ?? "...";
// These values are passed to processCapture but never used
```

## Proposed Solutions

### Option A: Remove Parameters Entirely (Recommended)

**Before:**
```typescript
export async function processCapture(
  rawText: string,
  apiKey: string,
  _projectName: string,
  _slug = "capture-cleanup",
  fetchFn: typeof fetch = fetch,
): Promise<CaptureResult>
```

**After:**
```typescript
export async function processCapture(
  rawText: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<CaptureResult>
```

- **Pros:** Clean API, removes confusion, reduces LOC by ~13
- **Cons:** Breaking change (but internal only)
- **Effort:** Small
- **Risk:** Low

## Technical Details

**Files to modify:**
- `supabase/functions/_shared/lib/braintrust.ts` - Remove params
- `supabase/functions/telegram-webhook/index.ts` - Remove env var reads + call site updates
- `supabase/functions/slack-webhook/index.ts` - Same
- `supabase/functions/create-issue/index.ts` - Same

**Env vars to remove from Supabase secrets:**
- `BRAINTRUST_PROJECT_NAME`
- `BRAINTRUST_CAPTURE_SLUG`

## Acceptance Criteria

- [ ] `processCapture` has only 3 parameters (rawText, apiKey, fetchFn)
- [ ] All call sites updated
- [ ] Unused env vars removed from code
- [ ] Tests updated
- [ ] ~13 LOC removed

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Architecture, TypeScript, and Simplicity reviewers |

## Resources

- PR: feature/ps-34-braintrust-linear
