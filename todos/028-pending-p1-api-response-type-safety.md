---
status: pending
priority: p1
issue_id: "028"
tags: [code-review, typescript, type-safety]
dependencies: []
---

# Missing Type Safety on API Responses

## Problem Statement

API responses from `/api/drafts` are not validated at runtime, using `any` types from `.json()` calls. This creates production risk where malformed API responses can cause runtime errors or silent data corruption.

**Why this matters:**
- Runtime errors from unexpected API response shapes
- No type guarantees at the boundary between client and server
- Difficult to debug issues caused by API changes
- Silent failures when API returns wrong structure

## Findings

**From TypeScript Review (Kieran):**

### Issue: Untyped API Response Handling

**Location:** `ThreadDetail.tsx` lines 91-97, 153-159

```typescript
const data = await res.json();  // ❌ Type: any
if (!res.ok) {
  throw new Error(data.error || 'Failed to generate draft');
}

const { to = [], cc = [], body } = data;  // ❌ No validation
```

**Problems:**
1. `data` is `any` type - no compile-time safety
2. No runtime validation of response structure
3. If API returns `to: string` instead of `to: string[]`, rendering fails
4. If API adds new required field, no error until runtime

**Attack Scenario:**
If Braintrust API is compromised or misconfigured:
```json
{
  "to": "malicious@example.com",  // ❌ Should be array
  "cc": null,                      // ❌ Should be array
  "body": "<script>alert('xss')</script>"
}
```

Code assumes `to` is array, calls `.map()` → **runtime crash**

## Proposed Solutions

### Option 1: Zod Schema Validation (Recommended)

**Pros:**
- Runtime type validation
- TypeScript type inference from schema
- Clear error messages
- Industry standard

**Cons:**
- Adds dependency (~12KB gzipped)
- Requires schema maintenance

**Effort:** Low (1 hour)
**Risk:** Low

**Implementation:**

```typescript
import { z } from 'zod';

// Define schema
const DraftResponseSchema = z.object({
  to: z.array(z.string().email()).default([]),
  cc: z.array(z.string().email()).default([]),
  body: z.string().min(1),
  error: z.string().optional(),
});

type DraftResponse = z.infer<typeof DraftResponseSchema>;

// Use in generateDraft
async function generateDraft() {
  setLoading(true);
  setError('');

  try {
    const res = await fetch('/api/drafts', { /* ... */ });
    const rawData = await res.json();

    if (!res.ok) {
      throw new Error(rawData.error || 'Failed to generate draft');
    }

    // ✅ Validate and parse response
    const data = DraftResponseSchema.parse(rawData);

    // data is now type DraftResponse (inferred from schema)
    const { to, cc, body } = data;

    addMessage('assistant', body);
    updateDraft(body);
    setDraft(body);
    setDraftTo(to);
    setDraftCc(cc);
    setInstructions('');
  } catch (error) {
    if (error instanceof z.ZodError) {
      setError('Invalid response from server: ' + error.message);
      console.error('API validation error:', error.errors);
    } else {
      setError(error instanceof Error ? error.message : 'Failed');
    }
  } finally {
    setLoading(false);
  }
}
```

### Option 2: TypeScript Type Assertions + Manual Validation

**Pros:**
- No dependencies
- Full control over validation logic

**Cons:**
- More boilerplate code
- Easy to forget validation checks
- No type inference

**Effort:** Medium (2 hours)
**Risk:** Medium (manual validation is error-prone)

**Implementation:**

```typescript
interface DraftResponse {
  to: string[];
  cc: string[];
  body: string;
  error?: string;
}

function validateDraftResponse(data: any): DraftResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response structure');
  }

  if (!Array.isArray(data.to)) {
    throw new Error('Response missing "to" array');
  }

  if (!Array.isArray(data.cc)) {
    throw new Error('Response missing "cc" array');
  }

  if (typeof data.body !== 'string' || data.body.length === 0) {
    throw new Error('Response missing "body" string');
  }

  return data as DraftResponse;
}

// Use in generateDraft
const rawData = await res.json();
const data = validateDraftResponse(rawData);  // ✅ Validated
```

### Option 3: Server-Side Validation Only

**Pros:**
- Single source of truth (server validates)
- Client trusts server response

**Cons:**
- No protection if server validation is bypassed
- Still need type assertions on client

**Effort:** Low (30 min)
**Risk:** High (relies on server correctness)

**Implementation:**

Add Zod validation to `/api/drafts/route.ts`:
```typescript
// Already exists in route.ts but client doesn't validate
const validatedResponse = DraftResponseSchema.parse(braintrustResult);
return NextResponse.json(validatedResponse);
```

Then client uses type assertion:
```typescript
const data = await res.json() as DraftResponse;
```

**Problem:** If API route is buggy or Braintrust returns unexpected data, client assumes it's correct.

## Recommended Action

**Implement Option 1: Zod Schema Validation**

Reasons:
1. Zod is already a dependency (used in API routes)
2. Runtime validation prevents crashes from malformed responses
3. TypeScript inference provides compile-time safety
4. Clear error messages help debugging

**Implementation plan:**
1. Define `DraftResponseSchema` in shared types file (30 min)
2. Update `generateDraft` to use schema (15 min)
3. Update `regenerateDraft` to use schema (15 min)
4. Add tests for invalid API responses (30 min)

## Technical Details

**Affected Files:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ThreadDetail.tsx`
  - Lines 91-97: Add validation to generateDraft
  - Lines 153-159: Add validation to regenerateDraft

**Shared Types File (create):**
```typescript
// email-workflow/lib/types/draft.ts
import { z } from 'zod';

export const DraftResponseSchema = z.object({
  to: z.array(z.string().email()).default([]),
  cc: z.array(z.string().email()).default([]),
  body: z.string().min(1),
  error: z.string().optional(),
});

export type DraftResponse = z.infer<typeof DraftResponseSchema>;
```

**Error Handling:**
```typescript
catch (error) {
  if (error instanceof z.ZodError) {
    // Validation error - API returned wrong structure
    setError('Invalid response from server');
    console.error('API validation failed:', error.errors);
  } else if (error instanceof Error) {
    // Network error or API error
    setError(error.message);
  } else {
    setError('Failed to generate draft');
  }
}
```

## Acceptance Criteria

- [ ] `DraftResponseSchema` defined with Zod
- [ ] `generateDraft` validates API response before using
- [ ] `regenerateDraft` validates API response before using
- [ ] TypeScript infers correct type from schema
- [ ] Invalid API response shows user-friendly error
- [ ] Console logs detailed validation errors for debugging
- [ ] Tests verify invalid responses are caught
- [ ] No `any` types in API response handling code

## Work Log

### 2026-01-11
- **Issue Created:** TypeScript review identified unsafe API response handling
- **Severity:** P1 (BLOCKS MERGE) - Can cause runtime crashes
- **Current Risk:** Any API change can break client silently
- **Next Step:** Add Zod schema validation to ThreadDetail.tsx

## Resources

- [PR #78 - Draft Metadata Display](https://github.com/benigeri/productiviy-system/pull/78)
- [Zod Documentation](https://zod.dev/)
- [TypeScript Type Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Email Workflow API Route](file:///Users/benigeri/Projects/productiviy-system/email-workflow/app/api/drafts/route.ts)
