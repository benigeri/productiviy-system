---
status: pending
priority: p1
issue_id: "014"
tags: [code-review, performance, optimization, localstorage]
dependencies: []
related_pr: 70
---

# Add In-Memory Caching Layer for localStorage Reads

## Problem Statement

**Critical performance issue**: Every operation (addMessage, updateDraft, getConversation) calls `getStore()` which does:
1. `localStorage.getItem()` - blocking I/O (5-10ms)
2. `JSON.parse()` on entire store - O(n) complexity (10-25ms for 100KB)
3. Zod validation across all conversations - O(n) complexity (5-10ms)

With 20 conversations at ~5KB each (100KB total), **every keystroke in draft parses 100KB** of JSON.

**Why it matters**:
- User types at 60 WPM → 1 keystroke/second
- Each keystroke triggers updateDraft → getStore → parse 100KB
- **15-25ms latency per keystroke on mobile** = noticeable input lag
- Dropped frames, poor UX, battery drain

**Location**: `/email-workflow/lib/conversation.ts` - `getStore()` and `setStore()` functions

## Findings

**From Performance Oracle Review:**
```
Projected Impact at Scale:
- 20 conversations × 50 messages each = 100KB total
- JSON.parse(100KB): ~15-25ms (desktop), ~40-60ms (mobile)
- Every updateDraft call: full parse
- Result: Noticeable input lag, dropped frames
```

**Performance Math:**
```
Current: Every operation parses full store
- getStore() called: 6+ times per user interaction
- Each call: JSON.parse(100KB) + Zod validation
- Total overhead: 30-60ms per interaction (mobile)

With caching: 80-90% reduction
- Cache hit: ~0.1ms (object copy)
- Cache miss: ~10ms (localStorage read + parse)
- Total overhead: 3-6ms per interaction
```

## Proposed Solutions

### Solution 1: Add TTL-Based In-Memory Cache (Recommended)
**Implementation:**
```typescript
// Cache to avoid repeated localStorage reads
let cachedStore: ConversationStore | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 1000; // 1 second

function getStore(): ConversationStore {
  const now = Date.now();

  // Return cached store if fresh
  if (cachedStore && (now - cacheTimestamp) < CACHE_TTL) {
    return { ...cachedStore }; // Return copy to prevent mutations
  }

  // Cache miss - load from localStorage
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      cachedStore = {};
      cacheTimestamp = now;
      return {};
    }

    const parsed = JSON.parse(stored);
    const validated = ConversationStoreSchema.safeParse(parsed);

    if (!validated.success) {
      console.error('Invalid conversation store data:', validated.error);
      localStorage.removeItem(STORAGE_KEY);
      cachedStore = {};
      cacheTimestamp = now;
      return {};
    }

    cachedStore = validated.data;
    cacheTimestamp = now;
    return { ...cachedStore };
  } catch (error) {
    console.error('Failed to load conversations:', error);
    localStorage.removeItem(STORAGE_KEY);
    cachedStore = {};
    cacheTimestamp = now;
    return {};
  }
}

function setStore(store: ConversationStore): boolean {
  // Update cache immediately (optimistic)
  cachedStore = store;
  cacheTimestamp = Date.now();

  // Persist to localStorage
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    // Handle quota exceeded...
    // (existing logic)
  }
}

// Invalidate cache on storage events (multi-tab sync)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      cachedStore = null; // Invalidate cache
      cacheTimestamp = 0;
    }
  });
}
```

**Pros:**
- 80-90% performance improvement
- Simple TTL invalidation (1 second is safe)
- Handles multi-tab updates via storage event
- No breaking changes to API

**Cons:**
- Adds 20-30 lines of code
- Cache can be stale for up to 1 second
- Must handle multi-tab scenarios

**Effort**: Small (1-2 hours)
**Risk**: Low (purely additive, no API changes)

### Solution 2: Aggressive Caching with Manual Invalidation
**Implementation:**
```typescript
let cachedStore: ConversationStore | null = null;

function getStore(): ConversationStore {
  if (cachedStore) {
    return { ...cachedStore };
  }

  // Load and cache forever
  cachedStore = loadFromLocalStorage();
  return { ...cachedStore };
}

function setStore(store: ConversationStore): boolean {
  cachedStore = store; // Update cache
  return saveToLocalStorage(store);
}

// Manually invalidate when external changes detected
export function invalidateCache() {
  cachedStore = null;
}
```

**Pros:**
- Maximum performance (no TTL checks)
- Simplest implementation
- No stale data if single tab

**Cons:**
- Manual cache invalidation required
- Breaks multi-tab sync
- Risk of stale data if cache not invalidated

**Effort**: Minimal (30 minutes)
**Risk**: Medium (cache coherency issues)

### Solution 3: Debounce Draft Updates (Alternative)
**Implementation:**
```typescript
// In useConversation hook
import { useDebouncedCallback } from 'use-debounce';

const updateDraft = useDebouncedCallback((draft: string) => {
  const updated = updateDraftInStorage(threadId, draft);
  if (updated === null) {
    setStorageWarning('...');
  } else {
    setConversation(updated);
    setStorageWarning(null);
  }
}, 500); // Write after 500ms of inactivity
```

**Pros:**
- Reduces localStorage writes by 90%
- No changes to storage layer
- Simple hook-level solution

**Cons:**
- Only helps draft updates, not reads
- Adds dependency (use-debounce)
- 500ms delay feels sluggish

**Effort**: Small (1 hour)
**Risk**: Low

## Recommended Action

**Use Solution 1** (TTL-based cache) because:
- Addresses root cause (repeated reads)
- 80-90% performance gain
- Safe 1-second TTL prevents most staleness
- Handles multi-tab scenarios
- No API changes needed

**Also consider Solution 3** (debouncing) as additional optimization.

## Technical Details

**Affected Files:**
- `/email-workflow/lib/conversation.ts` (add caching layer)
- Potentially `/email-workflow/hooks/useConversation.ts` (optional debouncing)

**Functions Modified:**
- `getStore()` - add cache check before localStorage read
- `setStore()` - update cache on write
- New: `invalidateCache()` - for manual cache invalidation

**Cache Design:**
- **TTL**: 1 second (balances performance vs staleness)
- **Invalidation**: Automatic on TTL expiry + storage events
- **Multi-tab**: Storage event listener invalidates cache

## Acceptance Criteria

- [ ] Cache implemented with 1-second TTL
- [ ] Cache hit avoids localStorage read and JSON.parse
- [ ] Cache miss loads from localStorage and caches result
- [ ] setStore() updates cache immediately (optimistic)
- [ ] Storage event listener invalidates cache (multi-tab sync)
- [ ] All existing tests pass with caching layer
- [ ] Performance test: 100 sequential getStore() calls < 100ms (was 1000ms+)
- [ ] No stale data observed in multi-tab testing

## Work Log

### 2026-01-11 - Issue Created
- **Source**: Performance audit of PR #70 by performance-oracle agent
- **Severity**: P1 - Blocks merge (critical performance issue at scale)
- **Impact**: Mobile users will experience input lag with 10+ conversations

## Resources

- **PR #70**: https://github.com/benigeri/productiviy-system/pull/70
- **Web Performance**: https://web.dev/rail/
- **Caching Patterns**: https://martinfowler.com/articles/patterns-of-distributed-systems/time-bound-lease.html
- **File**: `/email-workflow/lib/conversation.ts`
- **Related**: localStorage performance, JSON.parse optimization
