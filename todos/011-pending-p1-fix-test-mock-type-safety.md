---
status: pending
priority: p1
issue_id: "011"
tags: [code-review, typescript, testing, type-safety]
dependencies: []
related_pr: 70
---

# Fix Dangerous Type Assertions in Test Mocks

## Problem Statement

**Critical type safety issue**: Test files use untyped mocks with `vi.fn()` and rely on `vi.mocked()` type assertions, bypassing TypeScript's type checking entirely. If function signatures change, tests won't catch the breakage.

**Why it matters**:
- TypeScript cannot verify mock functions match real implementations
- Refactoring breaks tests silently (false positives)
- Type errors in production code won't be caught by test suite
- Violates "type safety first" principle

**Location**: `/email-workflow/hooks/useConversation.test.tsx` lines 7-13, and multiple test call sites

## Findings

**From TypeScript Reviewer (kieran-typescript-reviewer):**
```typescript
// 🔴 FAIL: Mock factory doesn't preserve types
vi.mock('../lib/conversation', () => ({
  getConversation: vi.fn(),  // Returns any
  saveConversation: vi.fn(), // Returns any
  clearConversation: vi.fn(),
  addMessage: vi.fn(),
  updateDraft: vi.fn(),
}));

// Then used with type assertions
vi.mocked(conversationLib.getConversation).mockReturnValue(mockConversation);
```

**Impact**: Tests pass even when mocks don't match real function signatures. Production bugs slip through.

## Proposed Solutions

### Solution 1: Add Generic Types to Mock Factory (Recommended)
**Implementation:**
```typescript
vi.mock('../lib/conversation', () => ({
  getConversation: vi.fn<[string], Conversation | null>(),
  saveConversation: vi.fn<[string, Conversation], boolean>(),
  clearConversation: vi.fn<[string], void>(),
  addMessage: vi.fn<[string, 'user' | 'assistant', string], Conversation | null>(),
  updateDraft: vi.fn<[string, string], Conversation | null>(),
}));
```

**Pros:**
- Type-safe mock functions
- Compiler catches signature mismatches
- No manual type assertions needed
- Standard Vitest pattern

**Cons:**
- Requires updating mock setup (15 minutes)
- Must maintain type parameters

**Effort**: Small (30-60 minutes)
**Risk**: Low - purely additive change

### Solution 2: Use `vi.spyOn` Instead of `vi.mock`
**Implementation:**
```typescript
import * as conversationLib from '../lib/conversation';

beforeEach(() => {
  vi.spyOn(conversationLib, 'getConversation').mockReturnValue(null);
  vi.spyOn(conversationLib, 'saveConversation').mockReturnValue(true);
  // etc.
});
```

**Pros:**
- Inherits types from real implementation
- No manual type annotations
- TypeScript verifies automatically

**Cons:**
- Slightly more verbose setup
- Must import module as namespace
- Spies harder to reset than mocks

**Effort**: Medium (1-2 hours to refactor all tests)
**Risk**: Medium - changes test structure

### Solution 3: Create Typed Mock Helper
**Implementation:**
```typescript
// test-utils/mocks.ts
export function createConversationMocks() {
  return {
    getConversation: vi.fn<[string], Conversation | null>(),
    saveConversation: vi.fn<[string, Conversation], boolean>(),
    // ... etc
  };
}

// In tests
const mocks = createConversationMocks();
vi.mock('../lib/conversation', () => mocks);
```

**Pros:**
- Centralized type definitions
- Easy to update when signatures change
- Reusable across test files

**Cons:**
- Adds indirection
- Extra file to maintain

**Effort**: Small (1 hour to create + apply)
**Risk**: Low

## Recommended Action

**Use Solution 1** (add generic types to mock factory) because:
- Minimal code change
- Standard Vitest pattern
- Immediate type safety improvement
- No architectural changes needed

## Technical Details

**Affected Files:**
- `/email-workflow/hooks/useConversation.test.tsx` (lines 7-13, and ~20 call sites)
- Potentially other test files using similar patterns

**Components Affected:**
- All tests in `useConversation.test.tsx`
- Mock setup and usage throughout file

## Acceptance Criteria

- [ ] Mock factory uses `vi.fn<ParamTypes, ReturnType>()` generic syntax
- [ ] All mock function calls are type-checked by TypeScript
- [ ] Removing a parameter from real function causes compiler error in tests
- [ ] Changing return type of real function causes compiler error in tests
- [ ] All existing tests still pass after changes
- [ ] No `any` types in test file (verify with `tsc --noEmit`)

## Work Log

### 2026-01-11 - Issue Created
- **Source**: Code review of PR #70 by kieran-typescript-reviewer agent
- **Severity**: P1 - Blocks merge (critical type safety violation)
- **Context**: Part of comprehensive test review for conversation management

## Resources

- **PR #70**: https://github.com/benigeri/productiviy-system/pull/70
- **Vitest Mocking Docs**: https://vitest.dev/guide/mocking.html#functions
- **Test File**: `/email-workflow/hooks/useConversation.test.tsx`
- **Related**: TypeScript strict mode, type-safe testing practices
