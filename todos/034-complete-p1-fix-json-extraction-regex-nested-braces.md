---
status: complete
priority: p1
issue_id: "034"
tags: [code-review, braintrust, data-integrity, regex]
dependencies: []
---

# Fix JSON Extraction Regex for Nested Braces

## Problem Statement

The JSON extraction regex `/^\{[\s\S]*?\}(?=\s*($|[^,\]}]))/` in `braintrust.ts:145` uses a non-greedy match (`*?`) which stops at the FIRST closing brace that matches the lookahead. This causes data corruption when `cleaned_content` contains curly braces.

**Why it matters:** User input processed by the LLM often contains code snippets, template literals, or braces. The current regex will truncate these, causing JSON parse failures or worse - silent data corruption.

## Findings

**Identified by:** Security Sentinel, Performance Oracle, Architecture Strategist, Pattern Recognition Specialist, Code Simplicity Reviewer, Data Integrity Guardian (ALL 6 agents)

**Location:** `/Users/benigeri/Projects/worktrees/ps-48-braintrust-fix/supabase/functions/_shared/lib/braintrust.ts:145`

**Current Code:**
```typescript
const jsonMatch = jsonContent.match(/^\{[\s\S]*?\}(?=\s*($|[^,\]}]))/);
if (jsonMatch) {
  jsonContent = jsonMatch[0];
}
```

**Example Failure:**
```json
// LLM returns:
{"cleaned_content": "Fix bug in function() { return true; }", "is_feedback": false}

// Non-greedy regex extracts:
{"cleaned_content": "Fix bug in function() { return true; }
// ^ Stops at first } - INVALID JSON
```

**Evidence:** This would cause a 500 error for any user input containing `{}` characters, which is common for code-related feedback.

## Proposed Solutions

### Option A: Try-Parse-First Approach (Recommended)
```typescript
// Try parsing directly first - most LLM responses are clean JSON
let result: BraintrustResult;
try {
  result = JSON.parse(jsonContent);
} catch {
  // If parsing fails, try to extract JSON using indexOf/lastIndexOf
  const start = jsonContent.indexOf('{');
  const end = jsonContent.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      result = JSON.parse(jsonContent.slice(start, end + 1));
    } catch {
      throw new Error(`Invalid Braintrust response: could not parse JSON - ${content}`);
    }
  } else {
    throw new Error(`Invalid Braintrust response: could not parse JSON - ${content}`);
  }
}
```

**Pros:** Simple, handles all valid JSON, fast path for clean responses
**Cons:** Assumes JSON object spans first `{` to last `}` which may fail if commentary contains braces
**Effort:** Small
**Risk:** Low

### Option B: Brace-Counting Parser
```typescript
function extractFirstJsonObject(str: string): string | null {
  const start = str.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const char = str[i];

    if (escape) { escape = false; continue; }
    if (char === "\\") { escape = true; continue; }
    if (char === '"' && !escape) { inString = !inString; continue; }

    if (!inString) {
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) return str.slice(start, i + 1);
      }
    }
  }
  return null;
}
```

**Pros:** Handles ALL edge cases correctly, respects string boundaries
**Cons:** More code, slightly more complex
**Effort:** Medium
**Risk:** Very Low

### Option C: Just Remove Regex, Fail Gracefully
Remove the JSON extraction entirely. If the LLM returns commentary, let JSON.parse fail and throw.

**Pros:** Simplest solution, forces LLM to return clean JSON
**Cons:** May cause occasional failures if LLM adds commentary
**Effort:** Small (remove code)
**Risk:** Medium - depends on LLM behavior

## Recommended Action

<!-- Filled during triage -->
**Recommendation:** Option A (Try-Parse-First) - Simple, handles the common case well, and the edge case where commentary also contains braces is extremely rare.

## Technical Details

**Affected Files:**
- `supabase/functions/_shared/lib/braintrust.ts` (line 145)

**Components Impacted:**
- All functions that call `processCapture`: create-issue, telegram-webhook, slack-webhook

**Database/Migration Changes:** None

## Acceptance Criteria

- [ ] JSON extraction handles content with nested braces: `{"cleaned_content": "Fix {foo}", "is_feedback": false}`
- [ ] JSON extraction handles content with code: `{"cleaned_content": "function() { return x; }", "is_feedback": false}`
- [ ] Existing tests still pass
- [ ] New test case added for braces in content
- [ ] No regression in clean JSON parsing performance

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-17 | Identified by code review | All 6 review agents flagged this issue |

## Resources

- PR: feature/ps-48-braintrust-fix
- Current test: `braintrust.test.ts:281` (doesn't cover this case)
