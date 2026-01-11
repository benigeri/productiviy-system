---
status: pending
priority: p0
issue_id: "009"
tags: [code-review, security, csrf, critical]
dependencies: []
created: 2026-01-10
---

# Add CSRF Protection to API Routes

## Problem Statement

**Location**: All API routes in `email-workflow/app/api/`

The application has **NO CSRF (Cross-Site Request Forgery) protection** on any state-changing API endpoints. An attacker can create a malicious website that makes authenticated requests to the app's APIs, causing the user's browser to perform unwanted actions.

**Why it matters**:
- Attackers can force users to generate/save drafts without consent
- Email labels can be manipulated without user knowledge
- Violates OWASP Top 10 security guidelines
- **BLOCKS PRODUCTION DEPLOYMENT**

## Findings

### From Security Sentinel Agent:

**Attack Scenario:**
1. User logs into email-workflow app
2. User visits attacker's malicious website
3. Malicious site contains hidden form:
```html
<form action="https://your-app.com/api/drafts" method="POST">
  <input type="hidden" name="threadId" value="victim-thread">
  <!-- Other fields -->
</form>
<script>document.forms[0].submit();</script>
```
4. User's browser sends authenticated request (cookies auto-included)
5. Draft is generated/saved without user's consent

**Vulnerable Endpoints:**
- `POST /api/drafts` - Draft generation (abuse: spam Braintrust API quota)
- `PUT /api/drafts` - Save to Gmail (abuse: create unwanted drafts)
- `POST /api/threads` - Label updates (abuse: hide/mislabel emails)

### Current Status:
- ❌ No CSRF tokens
- ❌ No SameSite cookie attributes
- ❌ No custom headers verification
- ❌ No origin validation

## Proposed Solutions

### Option 1: Next.js Middleware with CSRF Tokens (Recommended)
**Effort**: Medium (4-6 hours)
**Risk**: Low

**Implementation:**
```typescript
// Install dependency
npm install @edge-csrf/nextjs

// middleware.ts
import { createCsrfProtect } from '@edge-csrf/nextjs';

const csrfProtect = createCsrfProtect({
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  },
});

export async function middleware(request: NextRequest) {
  // Apply CSRF protection to state-changing methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const csrfError = await csrfProtect(request, response);
    if (csrfError) {
      return NextResponse.json(
        { error: 'Invalid CSRF token' },
        { status: 403 }
      );
    }
  }

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

**Client-side updates:**
```typescript
// Get CSRF token from cookie or meta tag
const csrfToken = getCsrfToken();

// Include in requests
fetch('/api/drafts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  body: JSON.stringify(data),
});
```

**Pros:**
- Industry standard solution
- Works with Next.js Edge Runtime
- Minimal performance impact
- Well-tested library

**Cons:**
- Requires cookie management
- Client code changes needed
- Must handle token refresh

### Option 2: Custom Header Verification (Quick Fix)
**Effort**: Small (1-2 hours)
**Risk**: Low

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const customHeader = request.headers.get('X-Requested-With');

  if (['POST', 'PUT'].includes(request.method) && customHeader !== 'XMLHttpRequest') {
    return NextResponse.json(
      { error: 'Missing required header' },
      { status: 403 }
    );
  }

  return NextResponse.next();
}
```

**Pros:**
- Very simple to implement
- No dependencies
- Works immediately

**Cons:**
- Not as robust as CSRF tokens
- Can be bypassed in some scenarios
- Not OWASP recommended as sole protection

### Option 3: SameSite Cookies + Origin Validation
**Effort**: Small (2-3 hours)
**Risk**: Low

```typescript
// Set SameSite=Strict on session cookies
// + validate request origin

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'http://localhost:3000',
    'https://your-production-domain.com'
  ];

  if (['POST', 'PUT'].includes(request.method)) {
    if (!origin || !allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { error: 'Invalid origin' },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}
```

**Pros:**
- Simple implementation
- Good browser support
- No client changes needed

**Cons:**
- Doesn't work for same-site attacks
- Some browsers don't support SameSite
- Origin header can be omitted

## Recommended Action

**Option 1** - Implement CSRF tokens via `@edge-csrf/nextjs`

**Rationale:**
- Industry standard and OWASP recommended
- Most robust protection
- Supports modern browsers and APIs
- Worth the implementation effort for production security

## Technical Details

### Affected Files:
- `email-workflow/middleware.ts` (create new)
- `email-workflow/app/inbox/ThreadDetail.tsx` (update fetch calls)
- `email-workflow/app/layout.tsx` (embed CSRF token in page)

### Implementation Steps:
1. Install `@edge-csrf/nextjs`
2. Create middleware with CSRF protection
3. Add CSRF token to page layout (meta tag or cookie)
4. Update all fetch calls to include CSRF token header
5. Add error handling for CSRF failures
6. Test with malicious site simulation

### Testing:
```bash
# Create test malicious page
# Verify CSRF token prevents unauthorized requests
# Verify legitimate requests still work
```

## Acceptance Criteria

- [ ] CSRF middleware implemented and active on all `/api/*` routes
- [ ] CSRF tokens generated and embedded in page
- [ ] All client-side fetch calls include CSRF token
- [ ] POST/PUT/DELETE/PATCH requests fail without valid token
- [ ] GET requests work without CSRF token
- [ ] Error messages are clear when CSRF validation fails
- [ ] Tests verify CSRF protection works
- [ ] Documentation updated with CSRF token usage

## Work Log

### 2026-01-10 - Issue Created
- Identified by Security Sentinel agent as CRITICAL vulnerability
- Classified as P0 - BLOCKS PRODUCTION DEPLOYMENT
- Must be fixed before merging PR #61

## Resources

- PR: https://github.com/benigeri/productiviy-system/pull/61
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- @edge-csrf/nextjs: https://www.npmjs.com/package/@edge-csrf/nextjs
- Next.js Middleware Docs: https://nextjs.org/docs/app/building-your-application/routing/middleware
