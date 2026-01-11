---
status: pending
priority: p1
issue_id: code-review-plan-2026-01-11
tags: [security, code-review, authentication, api]
dependencies: []
created: 2026-01-11
---

# Add Authentication to Email API Endpoints

## Problem Statement

**What's broken:** All API endpoints (`/api/drafts`, `/api/drafts/save`, `/api/threads`) have NO authentication. Anyone with the URL can access business emails, generate drafts, and modify labels.

**Why it matters:** Complete data breach risk. An attacker could:
- Read all email threads
- Generate/modify drafts
- Leak confidential conversations
- Manipulate workflow labels

**Current State:** Plan proposes new features with zero security consideration.

**Evidence:** Security audit identified this as CRITICAL severity blocking deployment.

## Findings

**From Security Sentinel Agent:**

```
Current API Routes:
- POST /api/drafts (draft generation) → No auth
- POST /api/drafts/save (save to Gmail) → No auth
- POST /api/threads (label updates) → No auth

Attack Vector:
1. Attacker discovers URL (easily found in browser network tab)
2. Calls /api/drafts with any thread_id
3. Reads full email conversation
4. Extracts sensitive business data
```

**Impact:**
- Confidentiality: HIGH (email exposure)
- Integrity: HIGH (draft manipulation)
- Availability: MEDIUM (API abuse)

**OWASP Category:** A01:2021 - Broken Access Control

## Proposed Solutions

### Solution 1: JWT Authentication with NextAuth.js (Recommended)

**Approach:**
1. Install NextAuth.js v5
2. Configure Google OAuth provider (user already uses Gmail)
3. Protect API routes with middleware
4. Store session in encrypted JWT

**Pros:**
- Standard authentication pattern
- Works with existing Gmail account
- No password management needed
- Session management included

**Cons:**
- Requires Google OAuth setup
- Adds dependency
- Session expiry handling needed

**Effort:** 4-6 hours
**Risk:** LOW - well-documented pattern

**Implementation:**
```typescript
// middleware.ts
import { auth } from '@/lib/auth';

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
});

// lib/auth.ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth } = NextAuth({
  providers: [Google],
});
```

### Solution 2: API Key Authentication (Faster MVP)

**Approach:**
1. Generate secure API key
2. Store in environment variable
3. Check `Authorization: Bearer <key>` header
4. Frontend includes key in requests

**Pros:**
- Fast to implement (1 hour)
- No OAuth setup required
- Works for internal tool

**Cons:**
- Key rotation manual
- No multi-user support
- Key exposure risk in frontend code

**Effort:** 1-2 hours
**Risk:** MEDIUM - key management burden

**Implementation:**
```typescript
// middleware.ts
export function middleware(req: Request) {
  const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');

  if (apiKey !== process.env.API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// Frontend
fetch('/api/drafts', {
  headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_KEY}` }
});
```

**Security Note:** API key would be visible in frontend bundle. Only acceptable for internal tool behind VPN.

### Solution 3: IP Whitelist (Temporary Mitigation)

**Approach:**
1. Restrict API access to specific IP addresses
2. Use Vercel's IP allowlist feature
3. Or implement in middleware

**Pros:**
- Quick to implement (30 minutes)
- No code changes needed (Vercel config)
- Works for single office/VPN

**Cons:**
- Doesn't prevent insider threats
- Breaks when IP changes
- Not scalable

**Effort:** 30 minutes
**Risk:** HIGH - weak security

**Use case:** ONLY as temporary mitigation while implementing Solution 1.

## Recommended Action

**Primary:** Solution 1 (JWT with NextAuth.js)
- Proper authentication for production
- Supports future multi-user scenarios
- Industry standard pattern

**Temporary:** Solution 3 (IP whitelist) while implementing Solution 1
- Immediate risk reduction
- Buys time for proper implementation

**Timeline:**
- Day 1: Implement IP whitelist (30 min)
- Day 2-3: Implement NextAuth.js (6 hours)
- Day 4: Remove IP whitelist, launch

## Technical Details

**Affected Files:**
- `/email-workflow/middleware.ts` (new)
- `/email-workflow/lib/auth.ts` (new)
- `/email-workflow/app/api/drafts/route.ts` (add auth check)
- `/email-workflow/app/api/drafts/save/route.ts` (add auth check)
- `/email-workflow/app/api/threads/route.ts` (add auth check)
- `/email-workflow/app/layout.tsx` (add SessionProvider)

**Dependencies:**
```json
{
  "dependencies": {
    "next-auth": "^5.0.0-beta.22",
    "@auth/core": "^0.37.2"
  }
}
```

**Environment Variables:**
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
AUTH_SECRET=random_32_char_string

# Or API Key (temporary)
API_KEY=secure_random_key_here
```

**Database:** None required (JWT stored client-side)

**Deployment:**
- Update Vercel environment variables
- Redeploy application

## Acceptance Criteria

- [ ] Unauthenticated requests to `/api/*` return 401
- [ ] Authenticated requests work as expected
- [ ] Session persists across page refreshes
- [ ] Session expires after 24 hours
- [ ] Logout functionality works
- [ ] Login redirects to /inbox after success
- [ ] No API keys visible in frontend bundle (if using JWT)
- [ ] Security audit shows "Authentication: PASS"

## Work Log

### 2026-01-11 - Initial Finding
**Action:** Security review identified missing authentication
**Status:** Documented as P1 blocker
**Next:** Await decision on Solution 1 vs Solution 2

## Resources

- **Related PRs/Issues:** N/A (new finding)
- **Documentation:**
  - [NextAuth.js v5 Docs](https://authjs.dev/getting-started/installation)
  - [OWASP: Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- **Similar Patterns:** N/A (first auth implementation)
- **Security Audit:** `/plans/2026-01-11-security-audit-email-reply-enhancement.md`
