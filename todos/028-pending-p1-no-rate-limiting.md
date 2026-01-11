---
status: pending
priority: p1
issue_id: "028"
tags: [code-review, security, critical, rate-limiting]
dependencies: []
---

# No Rate Limiting on AI Endpoint

## Problem Statement

**CRITICAL COST/SECURITY ISSUE**: The `/api/compose` endpoint has no rate limiting. An attacker (or even a legitimate user with a bug in their code) can make unlimited calls to Braintrust AI, causing:
- **Cost escalation** (Braintrust charges per API call)
- **API quota exhaustion**
- **Denial of Service**

## Findings

### From Security Sentinel Agent:

**Evidence from `/email-workflow/app/api/compose/route.ts`:**
```typescript
export async function POST(request: Request) {
  // No rate limiting check
  const composeResponse = await generateComposeEmail({
    // Direct call to expensive AI service
  });
}
```

**Impact:**
- Unlimited calls to expensive Braintrust AI API
- No cost protection (each call costs money)
- DoS vector (exhaust quota, block other users)
- Malicious user could run up thousands in API costs

## Proposed Solutions

### Solution 1: Upstash Redis Rate Limiting (Recommended)
**Pros:**
- Industry-standard solution
- Distributed rate limiting (works in serverless)
- Easy to configure limits

**Cons:**
- Requires Upstash account
- External dependency

**Effort**: Medium (3 hours)
**Risk**: Low - proven solution

**Implementation:**
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 h"), // 10 requests per hour
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  // ... rest of handler
}
```

Let me continue with more P1 issues and then move to P2/P3 issues. Given the extensive findings, I'll create the most critical ones and provide a summary report.

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"content": "Synthesize review findings and categorize by severity", "activeForm": "Synthesizing review findings", "status": "completed"}, {"content": "Create P1 critical todo files", "activeForm": "Creating P1 critical todo files", "status": "in_progress"}, {"content": "Create P2 important todo files", "activeForm": "Creating P2 important todo files", "status": "pending"}, {"content": "Create P3 nice-to-have todo files", "activeForm": "Creating P3 nice-to-have todo files", "status": "pending"}, {"content": "Generate review summary report", "activeForm": "Generating review summary report", "status": "pending"}]
### Solution 2: In-Memory Rate Limiting
**Pros:**
- No external dependencies
- Free
- Simple for single-instance deployments

**Cons:**
- Doesn't work in serverless/multi-instance
- Rate limits reset on redeploy
- Not suitable for Vercel/production

**Effort**: Low (1 hour)
**Risk**: Medium - only works for development

**Implementation:**
```typescript
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  if (!checkRateLimit(ip, 10, 3600000)) { // 10 per hour
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  // ... rest of handler
}
```

## Recommended Action

**Use Solution 1** (Upstash Redis) for production deployment because:
1. Works in serverless environments (Vercel)
2. Distributed rate limiting across instances
3. Persists across deployments
4. Industry standard

Start with per-IP limiting, then add per-user limiting after authentication is implemented (see todo #025).

## Technical Details

**Affected Files:**
- `/email-workflow/app/api/compose/route.ts`

**Suggested Rate Limits:**
- Authenticated users: 20 requests/hour
- Unauthenticated (after auth added): 5 requests/hour
- Per-IP: 50 requests/hour (prevent single IP DoS)

**Cost Estimation:**
- Without rate limiting: Unlimited cost exposure
- With 20 req/hour limit: Max $X/user/day (calculate based on Braintrust pricing)

## Acceptance Criteria

- [ ] Rate limiting implemented on `/api/compose` endpoint
- [ ] 429 status code returned when limit exceeded
- [ ] Clear error message: "Rate limit exceeded. Try again in X minutes."
- [ ] Rate limit headers included (X-RateLimit-Limit, X-RateLimit-Remaining)
- [ ] Tests added for rate limit behavior
- [ ] Monitoring added to track rate limit hits

## Work Log

**2026-01-11**: Issue identified during code review by security-sentinel agent

## Resources

- **PR**: #79 - feat: Add AI-powered compose email feature
- **Review Agent**: security-sentinel
- **Severity**: CRITICAL - Prevents cost overruns
- **Upstash**: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
