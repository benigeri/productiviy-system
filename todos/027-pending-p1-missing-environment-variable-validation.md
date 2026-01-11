---
status: pending
priority: p1
issue_id: "027"
tags: [code-review, data-integrity, critical, configuration]
dependencies: []
---

# Missing Environment Variable Validation

## Problem Statement

**CRITICAL DATA INTEGRITY ISSUE**: Application crashes in production if `NYLAS_API_KEY`, `NYLAS_GRANT_ID`, or `BRAINTRUST_*` env vars are undefined. When this happens, user's drafted email is lost with no recovery mechanism.

## Findings

### From Data Integrity Guardian Agent:

**Evidence from `/email-workflow/app/api/compose/save/route.ts`:**
```typescript
// Line 42 - No null check before string interpolation
`https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}`

// Line 45 - No null check before Bearer token
Authorization: `Bearer ${process.env.NYLAS_API_KEY}`
```

**Evidence from `/email-workflow/app/api/compose/route.ts`:**
```typescript
// Line 8 - Non-null assertion without graceful error
projectName: process.env.BRAINTRUST_PROJECT_NAME!, // Crashes if undefined
```

**Data Corruption Scenario:**
1. Deploy to production with missing env vars
2. User composes email and clicks "Approve"
3. API call fails with "undefined" in URL or auth header
4. User's drafted email is lost (no retry mechanism)
5. No error message indicates missing configuration

## Proposed Solutions

### Solution 1: Validate at Request Start (Recommended)
**Pros:**
- Fails fast with clear error message
- User-friendly error response
- Easy to debug

**Cons:**
- Slight overhead on every request
- Need to validate in each route

**Effort**: Low (1 hour)
**Risk**: Very Low - defensive programming

**Implementation:**
```typescript
export async function POST(request: Request) {
  // Validate environment at request start
  const nylasApiKey = process.env.NYLAS_API_KEY;
  const nylasGrantId = process.env.NYLAS_GRANT_ID;

  if (!nylasApiKey || !nylasGrantId) {
    console.error('Missing required Nylas environment variables', {
      hasApiKey: !!nylasApiKey,
      hasGrantId: !!nylasGrantId,
    });
    return NextResponse.json(
      { error: 'Service configuration error. Please contact support.' },
      { status: 500 }
    );
  }

  // ... rest of implementation using validated vars
}
```

### Solution 2: Validate at Module Load
**Pros:**
- Validates once at startup
- Zero runtime overhead
- Application won't start with bad config

**Cons:**
- Harder to test
- Less flexible for dynamic config

**Effort**: Low (30 minutes)
**Risk**: Low - early failure detection

**Implementation:**
```typescript
// At top of file, before any handlers
const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_GRANT_ID = process.env.NYLAS_GRANT_ID;

if (!NYLAS_API_KEY) {
  throw new Error('NYLAS_API_KEY environment variable is required');
}
if (!NYLAS_GRANT_ID) {
  throw new Error('NYLAS_GRANT_ID environment variable is required');
}

export async function POST(request: Request) {
  // Use validated constants
  await fetch(`https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}`, {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}` }
  });
}
```

### Solution 3: Zod Environment Schema
**Pros:**
- Type-safe environment variables
- Comprehensive validation
- Self-documenting config

**Cons:**
- Adds Zod dependency for env vars
- More boilerplate

**Effort**: Medium (2 hours)
**Risk**: Low - robust solution

**Implementation:**
```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NYLAS_API_KEY: z.string().min(1),
  NYLAS_GRANT_ID: z.string().uuid(),
  BRAINTRUST_PROJECT_NAME: z.string().min(1),
  BRAINTRUST_API_KEY: z.string().min(1),
  BRAINTRUST_COMPOSE_SLUG: z.string().min(1),
});

export const env = envSchema.parse(process.env);

// In route handlers, use `env.NYLAS_API_KEY` instead of `process.env.NYLAS_API_KEY`
```

## Recommended Action

**Use Solution 1** (Validate at request start) for immediate fix, then migrate to **Solution 3** (Zod schema) for long-term maintainability.

Short-term (this PR):
1. Add validation checks in both compose routes
2. Return helpful error messages

Long-term (future PR):
1. Create centralized env validation with Zod
2. Use throughout application

## Technical Details

**Affected Files:**
- `/email-workflow/app/api/compose/route.ts` (Lines 8, 42-46)
- `/email-workflow/app/api/compose/save/route.ts` (Lines 42, 45, 87, 91)

**Environment Variables:**
- `NYLAS_API_KEY` - Nylas API authentication
- `NYLAS_GRANT_ID` - Gmail account identifier
- `BRAINTRUST_PROJECT_NAME` - Braintrust project name
- `BRAINTRUST_API_KEY` - Braintrust authentication
- `BRAINTRUST_COMPOSE_SLUG` - Prompt slug for email composition

## Acceptance Criteria

- [ ] All required env vars validated before use
- [ ] Clear error messages for missing configuration
- [ ] No crashes if env vars are undefined
- [ ] Error logged with context (which var is missing)
- [ ] User sees helpful error (not "undefined")
- [ ] Tests added for missing env var scenarios

## Work Log

**2026-01-11**: Issue identified during code review by data-integrity-guardian agent

## Resources

- **PR**: #79 - feat: Add AI-powered compose email feature
- **Review Agent**: data-integrity-guardian
- **Severity**: CRITICAL - Causes crashes in production
- **Related Pattern**: Also check `/api/drafts/*` routes for same issue
