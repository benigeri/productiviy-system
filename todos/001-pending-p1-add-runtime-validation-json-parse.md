---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security, data-integrity, typescript]
dependencies: []
---

# Add Runtime Validation for JSON.parse() Operations

## Problem Statement

**Critical security and data integrity issue**: `JSON.parse()` is used without runtime validation in `conversation.ts`, allowing corrupted or malicious localStorage data to crash the application. The TypeScript type system cannot protect against invalid data at runtime.

**Why it matters**:
- Users can manually edit localStorage via browser dev tools
- Storage corruption can occur due to browser crashes or quota issues
- Malicious browser extensions can modify localStorage
- Type-unsafe data causes runtime crashes when rendering UI

## Findings

**From Security Review:**
- JSON.parse() returns `any` type, bypassing TypeScript safety
- No validation that parsed data matches `ConversationStore` interface
- Corrupted data causes `TypeError` when UI tries to render (e.g., `messages.map is not a function`)

**From TypeScript Review:**
- Lines 33, 50 in conversation.ts use unsafe JSON.parse
- No type guards to verify data structure
- Silent failures allow invalid data to propagate

**From Data Integrity Review:**
- Manual localStorage edits crash the app
- Quota exceeded errors can cause partial writes
- No recovery mechanism for corrupted data

## Proposed Solutions

### Solution 1: Add Zod Schema Validation (Recommended)
**Pros:**
- Runtime type checking with TypeScript inference
- Automatic type narrowing
- Clear error messages
- Industry standard library
- Can generate TypeScript types from schemas

**Cons:**
- Adds ~14KB to bundle (tree-shakeable)
- Learning curve for team unfamiliar with Zod

**Effort:** Medium (2 hours)
**Risk:** Low

**Implementation:**
```typescript
import { z } from 'zod';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(100000), // 100KB limit
});

const ConversationSchema = z.object({
  messages: z.array(MessageSchema),
  currentDraft: z.string(),
  timestamp: z.number().positive(),
});

const ConversationStoreSchema = z.record(z.string(), ConversationSchema);

function getStore(): ConversationStore {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    const validated = ConversationStoreSchema.safeParse(parsed);

    if (!validated.success) {
      console.error('Invalid conversation store:', validated.error);
      localStorage.removeItem(STORAGE_KEY); // Clear corrupted data
      return {};
    }

    return validated.data;
  } catch (error) {
    console.error('Failed to load conversations:', error);
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}
```

### Solution 2: Manual Type Guards
**Pros:**
- No external dependencies
- Smaller bundle size
- Full control over validation logic

**Cons:**
- More code to maintain
- Easy to miss edge cases
- No TypeScript type inference
- Verbose and repetitive

**Effort:** Low (1 hour)
**Risk:** Medium (prone to bugs)

**Implementation:**
```typescript
function isMessage(obj: unknown): obj is Message {
  if (typeof obj !== 'object' || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    m.content.length <= 100000
  );
}

function isConversation(obj: unknown): obj is Conversation {
  if (typeof obj !== 'object' || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    Array.isArray(c.messages) &&
    c.messages.every(isMessage) &&
    typeof c.currentDraft === 'string' &&
    typeof c.timestamp === 'number' &&
    c.timestamp > 0
  );
}
```

### Solution 3: Hybrid Approach
**Pros:**
- Best of both worlds
- Use Zod for complex schemas, type guards for simple checks
- Gradual adoption

**Cons:**
- Mixed validation patterns
- Can be confusing

**Effort:** Medium (2 hours)
**Risk:** Low

## Recommended Action

**Use Solution 1 (Zod)**. The email-workflow is already using Zod for API validation (see `drafts/route.ts`), so this maintains consistency with existing patterns.

## Technical Details

**Affected Files:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
  - Lines 33, 50: Add validation after JSON.parse()

**Dependencies:**
- Install: `npm install zod` (already in project)
- Import: `import { z } from 'zod'`

**Related Issues:**
- Also affects session storage in ThreadDetail.tsx:82-84
- Should be fixed consistently across codebase

## Acceptance Criteria

- [ ] Zod schemas defined for Message, Conversation, ConversationStore
- [ ] getStore() validates parsed data before returning
- [ ] Invalid data is logged and cleared from localStorage
- [ ] Tests verify corrupted data is handled gracefully
- [ ] TypeScript types match Zod schemas (use z.infer)
- [ ] No `any` types remain in conversation.ts
- [ ] Error handling provides clear console messages

## Work Log

**2026-01-10**: Issue identified in PR #60 code review by multiple agents (security, typescript, data-integrity)

## Resources

- **PR #60**: https://github.com/benigeri/productiviy-system/pull/60
- **File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
- **Zod Documentation**: https://zod.dev/
- **Example**: email-workflow/app/api/drafts/route.ts uses Zod already
