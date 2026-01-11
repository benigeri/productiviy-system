---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, architecture, testability]
dependencies: []
---

# Add Storage Abstraction Layer

## Problem Statement

**Architectural issue**: Direct coupling to `localStorage` API violates Dependency Inversion Principle and makes the code difficult to test. Cannot swap storage implementations or mock for testing without complex global object mocking.

**Why it matters**:
- Hard to test without mocking global `window.localStorage`
- Cannot switch to alternative storage (IndexedDB, sessionStorage) without rewriting
- Cannot implement cloud sync or offline support
- SSR checks scattered throughout code
- Tight coupling to browser APIs

## Findings

**From Architecture Review:**
- Violates OCP (Open/Closed Principle)
- Violates DIP (Dependency Inversion Principle)
- No abstraction layer allows extensibility
- Direct dependencies on localStorage throughout

**From Pattern Recognition Review:**
- Repository Pattern implemented but storage layer is not abstracted
- Would benefit from Strategy Pattern for storage
- Cannot inject mock storage for testing

**From Testability Review:**
- Every test requires mocking `window.localStorage`
- Complex setup for testing SSR behavior
- Cannot test error handling paths easily

## Proposed Solutions

### Solution 1: Storage Adapter Interface (Recommended)
**Pros:**
- Clean abstraction boundary
- Easy to swap implementations
- Simple to test with mock adapter
- Follows Dependency Inversion Principle
- Can support multiple storage backends

**Cons:**
- Additional layer of indirection
- Slightly more code

**Effort:** Medium (2 hours)
**Risk:** Low

**Implementation:**
```typescript
// lib/storage-adapter.ts
export interface StorageAdapter<T = string> {
  get(key: string): T | null;
  set(key: string, value: T): void;
  delete(key: string): void;
  list(prefix?: string): string[];
}

export class LocalStorageAdapter implements StorageAdapter<string> {
  constructor(private keyPrefix: string = '') {}

  get(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(this.keyPrefix + key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.keyPrefix + key, value);
    } catch (error) {
      console.error('Storage write failed:', error);
      throw error;
    }
  }

  delete(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.keyPrefix + key);
  }

  list(prefix?: string): string[] {
    if (typeof window === 'undefined') return [];
    const keys: string[] = [];
    const fullPrefix = this.keyPrefix + (prefix || '');

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(fullPrefix)) {
        keys.push(key.substring(this.keyPrefix.length));
      }
    }

    return keys;
  }
}

// Mock for testing
export class MockStorageAdapter implements StorageAdapter<string> {
  private store = new Map<string, string>();

  get(key: string): string | null {
    return this.store.get(key) || null;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  list(prefix?: string): string[] {
    const keys = Array.from(this.store.keys());
    return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
  }
}
```

**Update conversation.ts:**
```typescript
// lib/conversation.ts
export class ConversationRepository {
  constructor(private storage: StorageAdapter = new LocalStorageAdapter('email-workflow-')) {}

  getConversation(threadId: string): Conversation | null {
    const data = this.storage.get(`conversations:${threadId}`);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse conversation:', error);
      return null;
    }
  }

  saveConversation(threadId: string, conversation: Conversation): void {
    const data = JSON.stringify(conversation);
    this.storage.set(`conversations:${threadId}`, data);
  }

  clearConversation(threadId: string): void {
    this.storage.delete(`conversations:${threadId}`);
  }
}

// Default instance for convenience
export const conversationRepo = new ConversationRepository();
export const getConversation = conversationRepo.getConversation.bind(conversationRepo);
export const saveConversation = conversationRepo.saveConversation.bind(conversationRepo);
export const clearConversation = conversationRepo.clearConversation.bind(conversationRepo);
```

**Testing becomes trivial:**
```typescript
// conversation.test.ts
import { ConversationRepository, MockStorageAdapter } from './conversation';

describe('ConversationRepository', () => {
  let repo: ConversationRepository;
  let storage: MockStorageAdapter;

  beforeEach(() => {
    storage = new MockStorageAdapter();
    repo = new ConversationRepository(storage);
  });

  it('should save and retrieve conversation', () => {
    const conv = { messages: [], currentDraft: '', timestamp: Date.now() };
    repo.saveConversation('thread-1', conv);
    expect(repo.getConversation('thread-1')).toEqual(conv);
  });

  // No need to mock window or localStorage!
});
```

### Solution 2: Dependency Injection Pattern
**Pros:**
- Very flexible
- Easy to test
- Follows SOLID principles

**Cons:**
- More complex
- Need to pass storage to all functions

**Effort:** Medium (2-3 hours)
**Risk:** Medium

## Recommended Action

**Implement Solution 1 (Storage Adapter)**. This provides the best balance of flexibility, testability, and ease of use. The class-based repository pattern with dependency injection is clean and testable.

## Technical Details

**Affected Files:**
- New: `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/storage-adapter.ts`
- Update: `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
- Update: `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.test.ts`

**Benefits:**
1. **Testability**: Inject mock storage, no global mocking needed
2. **Flexibility**: Switch to IndexedDB without changing conversation logic
3. **SSR Safety**: Handled in adapter, not scattered through code
4. **Error Handling**: Centralized in adapter
5. **Future-Proof**: Easy to add cloud sync, compression, encryption

**Future Storage Implementations:**
```typescript
// Could easily add:
class IndexedDBAdapter implements StorageAdapter { ... }
class SessionStorageAdapter implements StorageAdapter { ... }
class FileSystemAdapter implements StorageAdapter { ... }
class CloudSyncAdapter implements StorageAdapter { ... }
```

## Acceptance Criteria

- [ ] StorageAdapter interface defined
- [ ] LocalStorageAdapter implements interface
- [ ] MockStorageAdapter for testing
- [ ] ConversationRepository uses injected storage
- [ ] All tests use MockStorageAdapter
- [ ] No direct localStorage calls remain in conversation.ts
- [ ] SSR checks centralized in adapter
- [ ] Error handling centralized in adapter
- [ ] Documentation explains how to use adapters

## Work Log

**2026-01-10**: Issue identified in PR #60 architecture and testability reviews

## Resources

- **PR #60**: https://github.com/benigeri/productiviy-system/pull/60
- **Dependency Inversion Principle**: https://en.wikipedia.org/wiki/Dependency_inversion_principle
- **Strategy Pattern**: https://refactoring.guru/design-patterns/strategy
