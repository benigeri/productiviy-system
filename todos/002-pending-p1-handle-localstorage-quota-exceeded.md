---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, data-integrity, ux]
dependencies: []
---

# Handle localStorage Quota Exceeded Errors

## Problem Statement

**Critical data loss issue**: When localStorage quota is exceeded (5-10MB limit), save operations fail silently with no user notification. Users lose conversation history without knowing why, creating a catastrophic UX failure.

**Why it matters**:
- Users spend time iterating on drafts
- All conversation history lost on save failure
- No recovery mechanism
- User has no idea why feature stopped working
- Silent failures erode trust in the application

## Findings

**From Data Integrity Review:**
- `setStore()` catches all errors but doesn't handle QuotaExceededError specifically
- Users have no notification when storage fails
- Conversations grow unbounded (no cleanup), accelerating quota issues
- No retry strategy or graceful degradation

**From Performance Review:**
- Conversations can grow to several MB over time
- 100 threads × 50 messages × 500 bytes = ~2.5MB
- No limits on message count or conversation age
- Storage growth is linear with usage

**From Security Review:**
- Quota errors expose operational issues
- No telemetry to detect how often this occurs in production

## Proposed Solutions

### Solution 1: Automatic Pruning + User Notification (Recommended)
**Pros:**
- Transparent to user most of the time
- Automatic recovery without user action
- Preserves most recent/relevant data
- User only notified if pruning fails

**Cons:**
- Data loss (oldest conversations deleted)
- Need to define pruning policy

**Effort:** Medium (2-3 hours)
**Risk:** Low

**Implementation:**
```typescript
const MAX_CONVERSATIONS = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setStore(store: ConversationStore): boolean {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, attempting to prune');

      // Strategy: Keep only recent conversations
      const now = Date.now();
      const entries = Object.entries(store)
        .filter(([_, conv]) => now - conv.timestamp < MAX_AGE_MS)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, MAX_CONVERSATIONS);

      const pruned = Object.fromEntries(entries);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
        showNotification('warning', 'Storage limit reached. Cleared old conversations.');
        return true;
      } catch (retryError) {
        showNotification('error', 'Cannot save conversation. Please clear browser data.');
        return false;
      }
    }

    console.error('Failed to save conversations:', error);
    return false;
  }
}
```

### Solution 2: Per-Thread Storage Keys
**Pros:**
- Only affected thread loses data on quota error
- Easier to prune individual threads
- Better isolation

**Cons:**
- Requires refactoring storage architecture
- More localStorage operations
- Harder to get full conversation list

**Effort:** High (4 hours)
**Risk:** Medium (breaking change)

### Solution 3: Move to IndexedDB
**Pros:**
- Much larger quota (~50MB+)
- Better performance for large data
- Async API (doesn't block UI)

**Cons:**
- Significantly more complex
- Requires IndexedDB wrapper library
- Migration path for existing users

**Effort:** Very High (8+ hours)
**Risk:** High (new API, browser support)

## Recommended Action

**Use Solution 1 (Automatic Pruning)**. This provides immediate relief without major architecture changes. Solution 2 (per-thread storage) should be considered in a follow-up refactor.

## Technical Details

**Affected Files:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
  - Line 49: Replace generic error catch with specific QuotaExceededError handling

**Add Notification System:**
```typescript
// lib/notifications.ts
export function showNotification(
  type: 'info' | 'warning' | 'error',
  message: string
) {
  // Use toast library or custom notification UI
  console[type === 'error' ? 'error' : 'warn'](message);
  // TODO: Implement actual UI notification
}
```

**Pruning Policy:**
- Keep only last 20 conversations
- Delete conversations older than 7 days
- Prioritize most recently updated
- Clear ALL conversations if pruning doesn't free enough space

## Acceptance Criteria

- [ ] QuotaExceededError detected and handled specifically
- [ ] Automatic pruning removes old conversations (7 day TTL)
- [ ] Conversation limit enforced (max 20 conversations)
- [ ] User sees notification when storage limit reached
- [ ] User sees error notification if pruning fails
- [ ] Function returns boolean success/failure status
- [ ] Tests verify pruning logic works correctly
- [ ] Tests verify user notifications appear
- [ ] Telemetry added to track quota errors in production

## Work Log

**2026-01-10**: Issue identified in PR #60 code review (data-integrity, performance agents)

## Resources

- **PR #60**: https://github.com/benigeri/productiviy-system/pull/60
- **File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
- **MDN QuotaExceededError**: https://developer.mozilla.org/en-US/docs/Web/API/DOMException
- **localStorage Limits**: https://web.dev/storage-for-the-web/
