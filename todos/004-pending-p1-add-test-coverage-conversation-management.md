---
status: pending
priority: p1
issue_id: "004"
tags: [code-review, testing, process-violation]
dependencies: []
---

# Add Test Coverage for Conversation Management

## Problem Statement

**Critical process violation**: PR #60 violates TDD workflow mandated in CLAUDE.md. No test files exist for the new conversation management code, making it impossible to verify correctness or prevent regressions.

**Why it matters**:
- CLAUDE.md requires: "Test-Driven Development - Write tests before implementation"
- No way to verify data integrity logic works correctly
- Can't test error handling paths (quota exceeded, corrupted data, etc.)
- Refactoring is risky without tests
- Production bugs will be discovered by users, not tests

## Findings

**From Pattern Recognition Review:**
- No `conversation.test.ts` file exists
- No `useConversation.test.tsx` file exists
- Code review identified multiple edge cases that need testing
- Per CLAUDE.md lines 35-44: "Write tests before implementation"

**From Code Simplicity Review:**
- Complexity score: Medium-High
- Without tests, refactoring to simplify is risky
- Current implementation has 227 lines that need coverage

**From Data Integrity Review:**
- Critical paths not tested: validation, quota handling, race conditions
- Missing tests for: corrupted data, storage unavailable, concurrent updates

## Proposed Solutions

### Solution 1: Comprehensive Test Suite (Recommended)
**Pros:**
- Full coverage of all code paths
- Tests for normal and error cases
- Prevents regressions
- Enables safe refactoring

**Cons:**
- Time investment upfront
- Requires mocking localStorage

**Effort:** High (4-6 hours)
**Risk:** Low

**Implementation:**
```typescript
// email-workflow/lib/conversation.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  getConversation,
  saveConversation,
  clearConversation,
  addMessage,
  updateDraft,
} from './conversation';

describe('Conversation Repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getConversation', () => {
    it('should return null for non-existent thread', () => {
      expect(getConversation('thread-1')).toBeNull();
    });

    it('should retrieve saved conversation', () => {
      const conv = { messages: [], currentDraft: '', timestamp: Date.now() };
      saveConversation('thread-1', conv);
      expect(getConversation('thread-1')).toEqual(conv);
    });

    it('should handle corrupted JSON gracefully', () => {
      localStorage.setItem('email-workflow-conversations', 'invalid json');
      expect(getConversation('thread-1')).toBeNull();
    });

    it('should handle invalid data structure', () => {
      localStorage.setItem('email-workflow-conversations', '{"thread-1": "not-an-object"}');
      expect(getConversation('thread-1')).toBeNull();
    });

    it('should be SSR-safe', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;
      expect(getConversation('thread-1')).toBeNull();
      global.window = originalWindow;
    });
  });

  describe('addMessage', () => {
    it('should add message to new conversation', () => {
      const conv = addMessage('thread-1', 'user', 'Hello');
      expect(conv.messages).toHaveLength(1);
      expect(conv.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should add message to existing conversation', () => {
      addMessage('thread-1', 'user', 'First');
      const conv = addMessage('thread-1', 'assistant', 'Second');
      expect(conv.messages).toHaveLength(2);
    });

    it('should update timestamp', () => {
      const before = Date.now();
      const conv = addMessage('thread-1', 'user', 'Test');
      expect(conv.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('should persist to localStorage', () => {
      addMessage('thread-1', 'user', 'Test');
      const retrieved = getConversation('thread-1');
      expect(retrieved?.messages[0].content).toBe('Test');
    });
  });

  describe('clearConversation', () => {
    it('should remove conversation from storage', () => {
      addMessage('thread-1', 'user', 'Test');
      clearConversation('thread-1');
      expect(getConversation('thread-1')).toBeNull();
    });

    it('should not affect other threads', () => {
      addMessage('thread-1', 'user', 'Test 1');
      addMessage('thread-2', 'user', 'Test 2');
      clearConversation('thread-1');
      expect(getConversation('thread-2')).not.toBeNull();
    });
  });

  describe('quota exceeded handling', () => {
    it('should handle quota exceeded error gracefully', () => {
      // Mock localStorage.setItem to throw QuotaExceededError
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        const error = new DOMException('quota exceeded', 'QuotaExceededError');
        throw error;
      };

      expect(() => addMessage('thread-1', 'user', 'Test')).not.toThrow();

      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe('concurrent updates', () => {
    it('should handle race conditions between multiple writes', () => {
      // Simulate concurrent addMessage calls
      const promise1 = Promise.resolve(addMessage('thread-1', 'user', 'Message 1'));
      const promise2 = Promise.resolve(addMessage('thread-1', 'user', 'Message 2'));

      return Promise.all([promise1, promise2]).then(() => {
        const conv = getConversation('thread-1');
        expect(conv?.messages).toHaveLength(2);
      });
    });
  });
});
```

```typescript
// email-workflow/hooks/useConversation.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useConversation } from './useConversation';

describe('useConversation Hook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should load existing conversation on mount', () => {
    addMessage('thread-1', 'user', 'Existing message');
    const { result } = renderHook(() => useConversation('thread-1'));
    expect(result.current.messages).toHaveLength(1);
  });

  it('should add message and update state', () => {
    const { result } = renderHook(() => useConversation('thread-1'));

    act(() => {
      result.current.addMessage('user', 'Test message');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Test message');
  });

  it('should clear conversation', () => {
    const { result } = renderHook(() => useConversation('thread-1'));

    act(() => {
      result.current.addMessage('user', 'Test');
      result.current.clear();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('should sync with localStorage changes from other tabs', () => {
    const { result } = renderHook(() => useConversation('thread-1'));

    // Simulate storage event from another tab
    act(() => {
      addMessage('thread-1', 'user', 'From another tab');
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'email-workflow-conversations',
        newValue: localStorage.getItem('email-workflow-conversations'),
      }));
    });

    // Note: This test will fail with current implementation (no storage listener)
    // expect(result.current.messages).toHaveLength(1);
  });
});
```

### Solution 2: Minimal Test Coverage
**Pros:**
- Faster to implement
- Covers critical paths only

**Cons:**
- Leaves edge cases untested
- Doesn't prevent all regressions

**Effort:** Medium (2 hours)
**Risk:** Medium

## Recommended Action

**Use Solution 1 (Comprehensive Test Suite)**. Given the data integrity and security issues identified in the review, comprehensive testing is essential.

## Technical Details

**Files to Create:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.test.ts`
- `/Users/benigeri/Projects/productiviy-system/email-workflow/hooks/useConversation.test.tsx`

**Test Framework:**
- Already using Jest (check package.json)
- Use `@testing-library/react` for hook testing
- Use `@testing-library/react-hooks` if needed

**Coverage Requirements:**
- Minimum 80% line coverage
- 100% coverage for critical paths (save, load, clear)
- All error handling paths tested

## Acceptance Criteria

- [ ] conversation.test.ts created with comprehensive tests
- [ ] useConversation.test.tsx created
- [ ] All tests pass: `npm test`
- [ ] Coverage report shows >80% coverage
- [ ] Tests for normal operation (happy path)
- [ ] Tests for error handling (quota, corruption, SSR)
- [ ] Tests for edge cases (empty data, concurrent updates)
- [ ] Tests for multi-tab synchronization
- [ ] Mock localStorage properly to avoid affecting real storage
- [ ] CI pipeline runs tests automatically

## Work Log

**2026-01-10**: Issue identified in PR #60 code review (pattern-recognition, data-integrity agents)

## Resources

- **PR #60**: https://github.com/benigeri/productiviy-system/pull/60
- **CLAUDE.md**: Lines 35-44 (TDD requirement)
- **Jest Documentation**: https://jestjs.io/
- **React Testing Library**: https://testing-library.com/docs/react-testing-library/intro/
- **Testing Hooks**: https://react-hooks-testing-library.com/
