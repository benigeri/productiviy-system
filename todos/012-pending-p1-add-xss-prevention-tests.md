---
status: pending
priority: p1
issue_id: "012"
tags: [code-review, security, xss, testing]
dependencies: []
related_pr: 70
---

# Add XSS Prevention Tests to Verify React Escaping

## Problem Statement

**Critical security gap**: No tests verify that user-generated content is properly escaped when rendered, leaving XSS vulnerabilities undetected. While React auto-escapes by default, there are no tests to prove it works or catch regressions if rendering changes.

**Why it matters**:
- XSS attacks can steal user data, session tokens, and credentials
- Manual `dangerouslySetInnerHTML` could be added in future without test coverage
- Framework updates or library changes might break escaping
- Security regressions are high-impact but preventable with tests

**Location**: Missing tests in `/email-workflow/app/inbox/ThreadDetail.test.tsx`

## Findings

**From Security Sentinel Review:**
```
❌ CRITICAL GAP: No XSS Prevention Tests
Severity: HIGH
Risk: Untested XSS vectors could be exploited if React rendering changes
```

**Current State:**
- React auto-escapes in expressions like `{msg.content}`
- No `dangerouslySetInnerHTML` found in codebase (good!)
- But NO TESTS verify this behavior works

**Attack Vectors Not Tested:**
1. Script injection: `<script>alert('xss')</script>`
2. Event handler injection: `<img src=x onerror=alert('xss')>`
3. JavaScript URLs: `<a href="javascript:alert('xss')">click</a>`
4. Encoded payloads: `%3Cscript%3Ealert('xss')%3C/script%3E`

## Proposed Solutions

### Solution 1: Add Rendering Security Test Suite (Recommended)
**Implementation:**
```typescript
describe('XSS prevention', () => {
  it('escapes script tags in message content', () => {
    const xssPayload = '<script>alert("xss")</script>';
    const { container } = render(
      <ThreadDetail
        thread={mockThread}
        messages={[{
          ...mockMessage,
          conversation: xssPayload
        }]}
        allThreads={[]}
      />
    );

    // Verify no executable script in DOM
    expect(container.querySelector('script')).toBeNull();

    // Verify content is escaped as text
    const textContent = container.textContent || '';
    expect(textContent).toContain('<script>'); // Rendered as text

    // Verify HTML is not interpreted
    expect(container.innerHTML).not.toMatch(/<script[^>]*>/);
  });

  it('neutralizes img onerror XSS vectors', () => {
    const imgXss = '<img src=x onerror=alert("xss")>';
    const { container } = render(
      <ThreadDetail
        thread={mockThread}
        messages={[{ ...mockMessage, conversation: imgXss }]}
        allThreads={[]}
      />
    );

    const img = container.querySelector('img[onerror]');
    expect(img).toBeNull();
  });

  it('sanitizes javascript: URLs', () => {
    const jsUrl = '<a href="javascript:alert(1)">click</a>';
    const { container } = render(
      <ThreadDetail
        thread={mockThread}
        messages={[{ ...mockMessage, conversation: jsUrl }]}
        allThreads={[]}
      />
    );

    const link = container.querySelector('a[href^="javascript:"]');
    expect(link).toBeNull();
  });

  it('handles multiple XSS payloads in same message', () => {
    const multiXss = `
      <script>alert(1)</script>
      <img src=x onerror=alert(2)>
      <a href="javascript:alert(3)">click</a>
    `;
    const { container } = render(
      <ThreadDetail
        thread={mockThread}
        messages={[{ ...mockMessage, conversation: multiXss }]}
        allThreads={[]}
      />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
```

**Pros:**
- Catches XSS regressions immediately
- Documents expected security behavior
- Tests multiple attack vectors
- Standard React Testing Library patterns

**Cons:**
- Adds test complexity (~50 lines)
- Requires XSS knowledge to maintain

**Effort**: Small (1-2 hours)
**Risk**: Low - purely additive tests

### Solution 2: Add Snapshot Tests for Malicious Input
**Implementation:**
```typescript
it('renders XSS payloads safely (snapshot)', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert("xss")>',
    '<a href="javascript:alert(1)">click</a>',
  ];

  xssPayloads.forEach(payload => {
    const { container } = render(
      <ThreadDetail
        thread={mockThread}
        messages={[{ ...mockMessage, conversation: payload }]}
        allThreads={[]}
      />
    );

    expect(container).toMatchSnapshot();
  });
});
```

**Pros:**
- Simple to implement
- Catches any rendering changes
- Visual verification of escaping

**Cons:**
- Snapshot churn (updates frequently)
- Less explicit than assertion-based tests
- Harder to understand what's being tested

**Effort**: Minimal (30 minutes)
**Risk**: Low

### Solution 3: Use DOMPurify + Test Sanitization
**Implementation:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

// In component
<div dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(msg.conversation)
}} />

// Test
it('sanitizes malicious HTML with DOMPurify', () => {
  const xss = '<script>alert("xss")</script>';
  const sanitized = DOMPurify.sanitize(xss);
  expect(sanitized).toBe(''); // Script removed
});
```

**Pros:**
- Explicit sanitization library
- Handles complex XSS vectors
- Industry-standard approach

**Cons:**
- Requires refactoring component (use `dangerouslySetInnerHTML`)
- Adds dependency (~45KB)
- Overkill for plain text rendering

**Effort**: Medium (2-3 hours)
**Risk**: Medium - changes rendering approach

## Recommended Action

**Use Solution 1** (add rendering security test suite) because:
- React's auto-escaping already works (no code changes needed)
- Tests prove it works and catch regressions
- Documents security expectations clearly
- Standard practice for security-critical rendering

**Do NOT use Solution 3** unless you need to render actual HTML (you don't).

## Technical Details

**Affected Files:**
- `/email-workflow/app/inbox/ThreadDetail.test.tsx` (add new test suite)
- Possibly `/email-workflow/app/inbox/ThreadDetail.tsx` (verify no `dangerouslySetInnerHTML`)

**Components Affected:**
- ThreadDetail component (message rendering)
- Any component displaying user-generated content

**Rendering Logic to Test:**
- Line 248-249: `{msg.conversation}`
- Line 272-274: `{msg.content}`
- Line 323-325: Draft display

## Acceptance Criteria

- [ ] Tests verify `<script>` tags are escaped as text
- [ ] Tests verify `onerror` attributes are neutralized
- [ ] Tests verify `javascript:` URLs are blocked
- [ ] Tests verify multiple XSS payloads in one message
- [ ] All tests pass with React's default escaping
- [ ] No `dangerouslySetInnerHTML` added to codebase
- [ ] Tests fail if dangerous HTML rendering is introduced

## Work Log

### 2026-01-11 - Issue Created
- **Source**: Security audit of PR #70 by security-sentinel agent
- **Severity**: P1 - Blocks merge (critical security gap)
- **Finding**: Implementation is likely secure (React escaping), but no tests prove it

## Resources

- **PR #70**: https://github.com/benigeri/productiviy-system/pull/70
- **OWASP XSS Guide**: https://owasp.org/www-community/attacks/xss/
- **React Security**: https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html
- **Test File**: `/email-workflow/app/inbox/ThreadDetail.test.tsx`
- **Component**: `/email-workflow/app/inbox/ThreadDetail.tsx`
