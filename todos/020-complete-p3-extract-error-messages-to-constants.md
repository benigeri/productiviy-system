---
status: complete
priority: p3
issue_id: "020"
tags: [code-review, code-quality, refactoring]
dependencies: []
related_pr: 70
---

# Extract Error Messages to Constants

## Problem Statement

**Code quality issue**: Storage warning message duplicated in `useConversation.ts` (lines 28, 40). Should extract to constant for maintainability.

**Why it matters**:
- Hard to update message consistently
- Risk of typos causing different messages
- Violates DRY principle

## Proposed Solution

```typescript
// lib/conversation.ts or hooks/useConversation.ts
export const ERROR_MESSAGES = {
  STORAGE_QUOTA_EXCEEDED: 'Storage limit reached. Old conversations were pruned. Please try again.',
} as const;

// Use in hook
setStorageWarning(ERROR_MESSAGES.STORAGE_QUOTA_EXCEEDED);
```

**Effort**: Small (15 minutes)
**Risk**: None

## Recommended Action

Nice-to-have cleanup. Not blocking for PR #70.

## Resources

- **PR #70**: https://github.com/benigeri/productiviy-system/pull/70
- **File**: `/email-workflow/hooks/useConversation.ts`
