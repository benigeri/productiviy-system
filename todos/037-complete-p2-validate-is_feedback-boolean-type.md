---
status: complete
priority: p2
issue_id: "037"
tags: [code-review, data-integrity, validation, type-safety]
dependencies: []
---

# Add Type Validation for is_feedback Field

## Problem Statement

The code validates that `cleaned_content` is a string but does not validate that `is_feedback` is a boolean when present. An LLM could return `"is_feedback": "yes"` or `"is_feedback": 1`, which would be coerced to truthy values incorrectly.

**Why it matters:** Incorrect feedback detection could route regular issues to the Feedback project or vice versa, causing workflow disruption.

## Findings

**Identified by:** Data Integrity Guardian

**Location:** `supabase/functions/_shared/lib/braintrust.ts:160-166`

**Current Code:**
```typescript
// Validate response structure
if (typeof result.cleaned_content !== "string") {
  throw new Error("Invalid Braintrust response: missing cleaned_content");
}

return {
  cleanedContent: result.cleaned_content,
  isFeedback: result.is_feedback ?? false,  // No type check!
};
```

**Example Failure:**
```json
{"cleaned_content": "Test", "is_feedback": "false"}
// String "false" is truthy
// isFeedback would be "false" (string) which is truthy
// Item incorrectly routed to Feedback project
```

## Proposed Solutions

### Option A: Add Explicit Boolean Check (Recommended)
```typescript
// Validate response structure
if (typeof result.cleaned_content !== "string") {
  throw new Error("Invalid Braintrust response: missing cleaned_content");
}

// Validate is_feedback is boolean if present
if (result.is_feedback !== undefined && typeof result.is_feedback !== "boolean") {
  throw new Error("Invalid Braintrust response: is_feedback must be a boolean");
}

return {
  cleanedContent: result.cleaned_content,
  isFeedback: result.is_feedback ?? false,
};
```

**Pros:** Catches type errors early, clear error message
**Cons:** Slightly more strict, could fail on edge cases
**Effort:** Small
**Risk:** Very Low

### Option B: Coerce to Boolean Safely
```typescript
isFeedback: result.is_feedback === true,  // Only true if strictly boolean true
```

**Pros:** Handles any value safely
**Cons:** Silently ignores malformed data
**Effort:** Small
**Risk:** Low

## Recommended Action

<!-- Filled during triage -->
**Recommendation:** Option A - Explicit validation with clear error.

## Technical Details

**Affected Files:**
- `supabase/functions/_shared/lib/braintrust.ts` (line 160-166)

**Components Impacted:**
- Feedback routing logic in `capture.ts`

## Acceptance Criteria

- [ ] `is_feedback` validated as boolean if present
- [ ] String values like `"true"` or `"false"` throw error
- [ ] Numeric values like `1` or `0` throw error
- [ ] Missing `is_feedback` still defaults to `false`
- [ ] Test added for type validation

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-17 | Identified by code review | Data integrity review found type safety gap |

## Resources

- PR: feature/ps-48-braintrust-fix
