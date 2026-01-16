---
status: pending
priority: p2
issue_id: "042"
tags: [code-review, testing, typescript]
---

# Add Missing Test Coverage for create-issue

## Problem Statement

The create-issue test file only covers validation and configuration errors. It's missing tests for the core functionality: successful issue creation with mocked dependencies.

**Why it matters:** Core happy path untested, bugs may go undetected.

## Findings

### From TypeScript Reviewer:

**Current tests in `create-issue/index.test.ts`:**
- CORS preflight handling
- Non-POST method rejection
- Missing text field rejection
- Empty text rejection
- Missing API keys handling

**Missing tests:**
- Successful issue creation (happy path)
- Braintrust API failure handling
- Linear API failure handling
- Feedback routing (isFeedback: true)
- Invalid JSON body parsing

## Proposed Solutions

### Option A: Add Comprehensive Tests (Recommended)

```typescript
Deno.test("handleCreateIssue - creates issue successfully", async () => {
  setTestEnv();
  try {
    const mockDeps: CreateIssueDeps = {
      processCapture: () => Promise.resolve({
        cleanedContent: "Test Issue Title",
        isFeedback: false,
      }),
      createIssue: (title) => Promise.resolve({
        id: "test-id",
        identifier: "BEN-1",
        url: "https://linear.app/test",
      }),
    };

    const request = new Request("http://localhost/create-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Test input" }),
    });

    const response = await handleCreateIssue(request, mockDeps);
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.ok, true);
    assertEquals(body.issue.identifier, "BEN-1");
  } finally {
    clearTestEnv();
  }
});

Deno.test("handleCreateIssue - handles Braintrust failure", async () => {
  // Test error propagation
});

Deno.test("handleCreateIssue - routes feedback correctly", async () => {
  // Test that isFeedback: true passes correct options
});
```

- **Pros:** Comprehensive coverage, catches regressions
- **Cons:** More test code
- **Effort:** Medium
- **Risk:** Low

## Technical Details

**Files to modify:**
- `supabase/functions/create-issue/index.test.ts`

**Test scenarios to add:**
1. Happy path - regular issue creation
2. Happy path - feedback routing
3. Braintrust API error
4. Linear API error
5. Invalid JSON body
6. Multiline text (title + description)

## Acceptance Criteria

- [ ] Happy path tests added with mocked deps
- [ ] Error scenarios tested
- [ ] Feedback routing tested
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by TypeScript Reviewer |

## Resources

- PR: feature/ps-34-braintrust-linear
