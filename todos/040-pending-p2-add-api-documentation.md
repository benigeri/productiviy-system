---
status: pending
priority: p2
issue_id: "040"
tags: [code-review, agent-native, documentation]
---

# Add API Documentation for create-issue Endpoint

## Problem Statement

The create-issue endpoint has no documentation. Agents and developers cannot discover how to call the API, what fields are required, or what responses to expect.

**Why it matters:** Poor developer experience, agents cannot self-discover capabilities.

## Findings

### From Agent-Native Reviewer:

**Missing documentation for:**
- Endpoint URL and method
- Request schema (`{ text: string }`)
- Response schema (`{ ok: boolean, issue?: {...}, error?: string }`)
- Feedback routing behavior (`// fb -` prefix)
- Authentication requirements

**Impact:** Agents must read source code to understand the API.

## Proposed Solutions

### Option A: README Documentation (Recommended)

Create `docs/api/create-issue.md`:

```markdown
# Create Issue API

Creates a Linear issue from text input.

## Endpoint

`POST /functions/v1/create-issue`

## Request

```json
{
  "text": "string (required) - The issue text to process"
}
```

## Response (Success)

```json
{
  "ok": true,
  "issue": {
    "id": "uuid",
    "identifier": "BEN-123",
    "url": "https://linear.app/..."
  }
}
```

## Feedback Routing

Text starting with `fb -` or `// fb -` is detected as feedback and routed to the Feedback project.

Examples:
- `fb - John - Great product!` → Feedback project
- `Fix the login bug` → Triage (default)
```

- **Pros:** Easy to maintain, version controlled
- **Cons:** Not machine-discoverable
- **Effort:** Small
- **Risk:** Low

### Option B: OpenAPI Specification
Create formal OpenAPI spec for the endpoint.
- **Pros:** Machine-readable, generates client code
- **Cons:** More maintenance overhead
- **Effort:** Medium
- **Risk:** Low

## Technical Details

**Files to create:**
- `docs/api/create-issue.md`

## Acceptance Criteria

- [ ] API documentation exists
- [ ] Request/response schemas documented
- [ ] Feedback routing behavior explained
- [ ] Authentication requirements noted

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-16 | Created from code review | Found by Agent-Native Reviewer |

## Resources

- PR: feature/ps-34-braintrust-linear
