# Plan: Fix Braintrust Integration - ps-48

## Summary

Fix two issues with Braintrust integration in Supabase edge functions:
1. **Missing traces** - LLM calls don't appear in Braintrust dashboard
2. **Feedback parsing** - Ensure `// fb -` prefix handling works correctly

## Root Cause Analysis

### Issue 1: Missing Braintrust Traces

**Cause:** The edge functions call `https://braintrustproxy.com/v1/chat/completions` directly without the `x-bt-parent` header, so Braintrust doesn't know which project to log to.

**Current code** (`braintrust.ts:83-97`):
```typescript
const requestOptions: RequestInit = {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  // Missing: x-bt-parent header for logging
  body: JSON.stringify({ ... }),
};
```

**Solution:** Add `x-bt-parent` header with project ID to enable logging.

### Issue 2: Feedback Parsing

**Status:** Code appears correct. The LLM-based feedback detection and routing to `FEEDBACK_PROJECT_ID` + `BACKLOG_STATE_ID` is properly implemented.

**Potential issues:**
1. Non-deterministic LLM detection (Claude Haiku may not always detect feedback correctly)
2. Without traces, we can't see what the LLM is returning

**Solution:** First fix tracing so we can observe the LLM responses, then add more robust fallback detection if needed.

---

## Implementation Steps

### Step 1: Add Tracing Headers to Braintrust Proxy Calls

**File:** `supabase/functions/_shared/lib/braintrust.ts`

**Changes:**
1. Add `x-bt-parent` header with project ID to enable logging
2. Pass project name as parameter (already exists but unused)
3. Update proxy URL to `https://api.braintrust.dev/v1/proxy` (official endpoint)

**Code changes:**
```typescript
// Line 83-97: Update request headers
const requestOptions: RequestInit = {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "x-bt-parent": `project_name:${projectName}`,  // NEW: Enable logging
  },
  body: JSON.stringify({
    model: "claude-3-5-haiku-20241022",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Process this text and return the JSON result:\n\n${trimmed}` },
    ],
    max_tokens: 1024,
  }),
};

// Line 100-102: Update proxy URL
const response = fetchFn === fetch
  ? await fetchWithTimeout("https://api.braintrust.dev/v1/proxy", requestOptions, DEFAULT_API_TIMEOUT)
  : await fetchFn("https://api.braintrust.dev/v1/proxy", requestOptions);
```

### Step 2: Verify Environment Variables

**File:** `supabase/functions/create-issue/index.ts`

Confirm `BRAINTRUST_PROJECT_NAME` is being passed correctly. Check the Supabase secrets include:
- `BRAINTRUST_API_KEY`
- `BRAINTRUST_PROJECT_NAME`

### Step 3: Update Tests

**File:** `supabase/functions/_shared/lib/braintrust.test.ts`

Update mock responses to verify `x-bt-parent` header is included in requests.

### Step 4: Deploy and Verify

1. Deploy the updated edge function
2. Test with a regular capture: `"Test issue from Raycast"`
3. Test with feedback: `"// fb - John Doe - Great product!"`
4. Check Braintrust dashboard for traces
5. Verify Linear issues are created in correct projects

---

## Testing Plan

### Test 1: Regular Issue (via Raycast)
- Input: `"Add dark mode to the app"`
- Expected:
  - Trace appears in Braintrust dashboard
  - Issue created in default Triage project
  - `is_feedback: false` in LLM response

### Test 2: Feedback Issue (via Raycast)
- Input: `"// fb - John Doe - This feature is amazing!"`
- Expected:
  - Trace appears in Braintrust dashboard
  - Issue created in Feedback project (4884f918-c57e-480e-8413-51bff5f933f8)
  - Issue state is Backlog (e02b40e5-d86b-4c35-a81d-74cd3ad0a150)
  - `is_feedback: true` in LLM response

### Test 3: Edge Cases
- `"fb - No slashes test"` - Should detect as feedback
- `"FB- Sarah loves it"` - Should detect as feedback (case insensitive)
- `"// fb"` - Should detect as feedback (minimal)

---

## Rollback Plan

If issues occur after deployment:
1. Revert the `x-bt-parent` header addition
2. Revert proxy URL change
3. Redeploy previous version

The changes are additive and don't affect core functionality, so rollback risk is low.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/_shared/lib/braintrust.ts` | Add `x-bt-parent` header, update proxy URL |
| `supabase/functions/_shared/lib/braintrust.test.ts` | Update tests to verify header |

## Dependencies

- Supabase secrets must include `BRAINTRUST_PROJECT_NAME`
- Braintrust API key must have logging permissions
