---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, performance, refactoring]
dependencies: ["001", "002"]
---

# Refactor to Per-Thread localStorage Keys

## Problem Statement

**Performance scalability issue**: Current implementation stores all conversations in a single localStorage key, causing O(n) complexity on every read/write operation. As conversation history grows, every save operation parses and stringifies the entire store, even when only one thread changed.

**Why it matters**:
- Performance degrades linearly with number of threads
- At 50 threads: 50-100ms per save operation (noticeable UI lag)
- At 100 threads: 200-500ms per save operation (severe freezing)
- Blocks main thread during save
- Poor scalability for long-term usage

## Findings

**From Performance Review:**
- Every addMessage() reads/writes entire store
- Complexity: O(n × m) where n = threads, m = messages per thread
- With 100 threads × 50 messages: ~200KB parsed/stringified per operation
- JSON.parse/stringify is CPU-intensive
- Blocks main thread, causes dropped frames

**Projected Impact:**
- Month 1: Acceptable (<10ms)
- Month 3: Degrading (50-100ms)
- Month 6: Severe (200-500ms)
- Month 12: Hit storage quota, all saves fail

## Proposed Solutions

### Solution 1: Separate localStorage Keys Per Thread (Recommended)
**Pros:**
- O(n) → O(1) complexity (100x faster)
- Only read/write affected thread
- Better isolation between threads
- Easier to prune individual threads
- Smaller JSON operations

**Cons:**
- More localStorage keys
- Need to iterate keys to get all threads
- Slightly more complex cleanup logic

**Effort:** Medium (2-3 hours)
**Risk:** Low

**Implementation:**
```typescript
const STORAGE_KEY_PREFIX = 'email-workflow-conversation:';

export function getConversation(threadId: string): Conversation | null {
  const key = `${STORAGE_KEY_PREFIX}${threadId}`;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error(`Failed to load conversation ${threadId}:`, error);
    return null;
  }
}

export function saveConversation(threadId: string, conversation: Conversation): void {
  const key = `${STORAGE_KEY_PREFIX}${threadId}`;
  try {
    localStorage.setItem(key, JSON.stringify(conversation));
  } catch (error) {
    console.error(`Failed to save conversation ${threadId}:`, error);
    throw error;
  }
}

export function clearConversation(threadId: string): void {
  const key = `${STORAGE_KEY_PREFIX}${threadId}`;
  localStorage.removeItem(key);
}

export function getAllConversations(): Record<string, Conversation> {
  const conversations: Record<string, Conversation> = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      const threadId = key.substring(STORAGE_KEY_PREFIX.length);
      const conv = getConversation(threadId);
      if (conv) conversations[threadId] = conv;
    }
  }

  return conversations;
}
```

### Solution 2: Move to IndexedDB
**Pros:**
- Much larger quota (~50MB+)
- Better performance for large data
- Async API (doesn't block UI)
- Built-in indexing

**Cons:**
- Significant complexity increase
- Need IndexedDB wrapper library
- Migration path for existing users
- Overkill for current needs

**Effort:** Very High (8+ hours)
**Risk:** High

## Recommended Action

**Implement Solution 1 after fixing P1 issues**. The per-thread key approach is a natural evolution that provides massive performance gains without over-engineering.

**Note**: This should be done AFTER issues 001 (validation) and 002 (quota handling) are fixed, as those changes will be easier to implement with the current single-store architecture.

## Technical Details

**Affected Files:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
  - Refactor all storage functions
- `/Users/benigeri/Projects/productiviy-system/email-workflow/hooks/useConversation.ts`
  - No changes needed (abstracts storage layer)

**Migration Strategy:**
```typescript
// One-time migration on first load
function migrateToPerThreadStorage() {
  const OLD_KEY = 'email-workflow-conversations';
  const oldData = localStorage.getItem(OLD_KEY);

  if (oldData) {
    try {
      const store: ConversationStore = JSON.parse(oldData);

      // Move each thread to its own key
      for (const [threadId, conversation] of Object.entries(store)) {
        saveConversation(threadId, conversation);
      }

      // Remove old single-key storage
      localStorage.removeItem(OLD_KEY);
      console.log('Migrated conversations to per-thread storage');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }
}
```

**Performance Gain Calculation:**
```
Current: O(n × m) where n = threads, m = avg messages
- 10 threads: ~10ms
- 50 threads: ~100ms
- 100 threads: ~500ms

After: O(m) - only process one thread
- Any thread count: ~5-10ms
```

## Acceptance Criteria

- [ ] Each thread stored with key `email-workflow-conversation:{threadId}`
- [ ] getConversation() only reads one key
- [ ] saveConversation() only writes one key
- [ ] Migration function runs on first load
- [ ] Old data automatically migrated
- [ ] Tests verify migration works
- [ ] Performance benchmarks show 10-100x improvement
- [ ] No functionality regression
- [ ] Cleanup logic updated to iterate keys

## Work Log

**2026-01-10**: Issue identified in PR #60 performance review

## Resources

- **PR #60**: https://github.com/benigeri/productiviy-system/pull/60
- **File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
- **Performance Analysis**: See performance-oracle agent report
