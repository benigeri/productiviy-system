---
status: pending
priority: p1
issue_id: "025"
tags: [code-review, security, authentication]
dependencies: []
---

# Missing Authentication & Authorization

## Problem Statement

The email workflow application has **no authentication or authorization** system. All API endpoints (`/api/drafts`, `/api/drafts/save`) and pages (`/inbox`) are completely open, allowing anyone who can access the deployment to read and manipulate any user's emails.

**Why this matters:**
- Complete email data exposure
- Unauthorized draft creation and manipulation
- Privacy regulation violations (GDPR, CCPA)
- Security audit failure

## Findings

**From Security Audit:**

The application uses hardcoded environment variables (`NYLAS_GRANT_ID`, `NYLAS_API_KEY`) which means:
- Single grant serves all requests (no per-user isolation)
- No session management
- No authorization checks on thread access
- Anyone can call API endpoints with any `threadId`

**Proof of Concept:**
```bash
# Anyone can generate drafts for any thread:
curl -X POST https://your-app.com/api/drafts \
  -H "Content-Type: application/json" \
  -d '{"threadId":"any-thread-id","subject":"test","messages":[],"instructions":"hack"}'
```

**Affected Files:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/drafts/route.ts`
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/drafts/save/route.ts`
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/page.tsx`
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ThreadDetail.tsx`

## Proposed Solutions

### Option 1: Next.js Middleware + Session-Based Auth (Recommended)

**Pros:**
- Native Next.js pattern
- Works with existing OAuth providers
- Server-side session validation
- Can use next-auth or custom implementation

**Cons:**
- Requires session storage (Redis/Postgres)
- More complex than token-based auth

**Effort:** Medium (1-2 days)
**Risk:** Low

**Implementation:**
```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session');

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Validate session server-side
  // Add user context to request headers
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/inbox/:path*'],
};
```

### Option 2: OAuth with Google Workspace

**Pros:**
- Users already have Google accounts for email
- Nylas supports per-user OAuth grants
- No password management needed
- Aligns with email workflow use case

**Cons:**
- Requires OAuth flow implementation
- Need to migrate from single grant to per-user grants in Nylas

**Effort:** Medium-High (2-3 days)
**Risk:** Medium

**Implementation:**
```typescript
// Use next-auth with Google provider
// Store user's Nylas grant_id in session
// Pass grant_id to API routes from session
```

### Option 3: API Key-Based Auth (Quick Fix, Not Recommended for Production)

**Pros:**
- Quick to implement
- Good for MVP/development

**Cons:**
- Not user-friendly (users need to manage API keys)
- No session concept
- Limited to single user or requires key distribution

**Effort:** Low (4 hours)
**Risk:** Medium (not suitable for multi-user production)

**Implementation:**
```typescript
// Check Bearer token in API routes
const authHeader = request.headers.get('Authorization');
if (authHeader !== `Bearer ${process.env.API_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

## Recommended Action

**Implement Option 2: OAuth with Google Workspace**

This is the most appropriate solution because:
1. Users already authenticate with Google for email access
2. Nylas supports per-user OAuth grants (proper isolation)
3. Aligns with "email workflow" use case
4. Industry-standard pattern for email applications

**Migration plan:**
1. Add next-auth with Google provider
2. Create login page with Google OAuth flow
3. Store user's Nylas grant_id in session after OAuth
4. Update API routes to read grant_id from session
5. Add middleware to protect routes
6. Migrate from single hardcoded grant to per-user grants

## Technical Details

**Affected Components:**
- All API routes under `/api/*`
- All pages under `/inbox/*`
- Nylas integration (need per-user grants)

**Database Requirements:**
- User table (id, email, nylas_grant_id, created_at)
- Session storage (Redis or Postgres)

**Environment Variables to Add:**
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-app.com
```

**Environment Variables to Remove:**
```bash
# Remove hardcoded single-user grant:
# NYLAS_GRANT_ID=...  (move to per-user database)
```

## Acceptance Criteria

- [ ] Users must log in with Google OAuth before accessing `/inbox`
- [ ] API routes return 401 if no valid session exists
- [ ] Each user's Nylas grant is isolated (can only access their emails)
- [ ] Session expires after 7 days of inactivity
- [ ] Logout clears session and redirects to login
- [ ] No hardcoded credentials in environment variables
- [ ] Tests verify unauthorized access is blocked

## Work Log

### 2026-01-11
- **Issue Created:** Security audit identified critical authentication gap
- **Severity:** P1 (BLOCKS MERGE) - Cannot deploy to production without auth
- **Next Step:** Decide on OAuth implementation approach

## Resources

- [PR #78 - Draft Metadata Display](https://github.com/benigeri/productiviy-system/pull/78)
- [Next.js Middleware Docs](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [next-auth Documentation](https://next-auth.js.org/)
- [Nylas OAuth Guide](https://developer.nylas.com/docs/v3/auth/)
