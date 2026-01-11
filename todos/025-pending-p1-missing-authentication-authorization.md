---
status: pending
priority: p1
issue_id: "025"
tags: [code-review, security, critical, authentication]
dependencies: []
---

# Missing Authentication/Authorization on Compose Endpoints

## Problem Statement

**CRITICAL SECURITY ISSUE**: Both `/api/compose` and `/api/compose/save` endpoints have NO authentication checks. Any user who discovers these endpoints can:
- Generate unlimited AI emails using your Braintrust API key
- Send drafts to Gmail on behalf of the authenticated user
- Exhaust API quotas and incur significant costs

This is a **blocking issue** that must be fixed before merge.

## Findings

### From Security Sentinel Agent:

**Evidence from `/email-workflow/app/api/compose/route.ts`:**
```typescript
// NO auth check
export async function POST(request: Request) {
  // Directly processes request without verifying user identity
  const body = await request.json();
  // ...
}
```

**Evidence from `/email-workflow/app/api/compose/save/route.ts`:**
```typescript
// NO auth check
export async function POST(request: Request) {
  // Uses hardcoded NYLAS_GRANT_ID from env vars
  // No verification that the user is authorized to use this grant
  const grantRes = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}`,
```

**Impact:**
- **API Key Theft/Abuse**: Attackers can drain Braintrust credits
- **Unauthorized Email Access**: Attackers can create drafts in user's Gmail account
- **Cost Escalation**: Unlimited API calls can result in significant financial impact

## Proposed Solutions

### Solution 1: Add Next.js Middleware with Session Auth (Recommended)
**Pros:**
- Centralized authentication logic
- Works for all protected routes
- Easy to test and maintain

**Cons:**
- Requires session management setup
- Need to handle session storage

**Effort**: Medium (4 hours)
**Risk**: Low - standard Next.js pattern

**Implementation:**
```typescript
// middleware.ts
import { getServerSession } from "next-auth";

export async function middleware(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Attach user context to request
  request.headers.set("X-User-Id", session.user.id);
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/compose/:path*"]
};
```

### Solution 2: Per-Route Authentication
**Pros:**
- Simpler, no middleware needed
- More explicit, easier to understand

**Cons:**
- Code duplication across routes
- Easy to forget on new routes

**Effort**: Low (2 hours)
**Risk**: Medium - prone to human error

**Implementation:**
```typescript
// In each route handler
import { getServerSession } from "next-auth";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user owns the grant
  const userGrantId = session.user.nylasGrantId;
  if (!userGrantId) {
    return NextResponse.json(
      { error: "No email account linked" },
      { status: 403 }
    );
  }

  // Use user-specific grant instead of hardcoded env var
  // ...
}
```

### Solution 3: API Key Authentication
**Pros:**
- Simpler than session management
- Good for API-first clients

**Cons:**
- Requires key distribution and rotation
- Less secure than session tokens

**Effort**: Low (2 hours)
**Risk**: Medium - key management complexity

## Recommended Action

**Use Solution 1** (Middleware with session auth) because:
1. Centralized logic prevents forgetting auth on new routes
2. Standard Next.js pattern with good ecosystem support
3. User-scoped grants (not hardcoded env var)

## Technical Details

**Affected Files:**
- `/email-workflow/app/api/compose/route.ts` (NO auth)
- `/email-workflow/app/api/compose/save/route.ts` (NO auth)
- New file: `/email-workflow/middleware.ts` (to create)

**Related Issues:**
- Issue #9 in security review: Hardcoded grant ID (should be per-user)

**Database/Migration Changes:**
None (assumes user system exists with Nylas grant IDs)

## Acceptance Criteria

- [ ] All `/api/compose/*` endpoints require valid session
- [ ] 401 returned if no session exists
- [ ] 403 returned if user has no linked email account
- [ ] User-specific Nylas grant ID used (not hardcoded env var)
- [ ] Tests added for unauthorized access attempts
- [ ] Middleware applied to all compose routes

## Work Log

**2026-01-11**: Issue identified during code review by security-sentinel agent

## Resources

- **PR**: #79 - feat: Add AI-powered compose email feature
- **Review Agent**: security-sentinel
- **OWASP Category**: A07 - Identification and Authentication Failures
- **Severity**: CRITICAL - Blocks merge
