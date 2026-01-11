---
status: complete
priority: p2
issue_id: "016"
tags: [code-review, testing, integration, react]
dependencies: []
related_pr: 70
---

# Add Component-Hook Integration Tests

## Problem Statement

**Testing gap**: No tests verify how `ThreadDetail.tsx` component integrates with the `useConversation` hook. Current tests cover lib→hook integration but skip component→hook integration.

**Why it matters**:
- Multi-step workflows (generate → feedback → regenerate) cross boundaries multiple times
- Draft synchronization between component state and hook state is untested
- Navigation side effects (clearing on skip/approve) are untested
- Real user flows remain unvalidated

**Location**: Missing integration tests for `/email-workflow/app/inbox/ThreadDetail.tsx`

## Findings

**From Architecture Review:**
```
⚠️ GAP: Component ↔ Hook Integration
- Draft syncing logic (lines 50-53) untested
- Multi-step workflows untested
- Navigation side effects untested
```

**Current Coverage:**
- ✅ lib functions in isolation (22 tests)
- ✅ hook functions in isolation (14 tests)
- ❌ Component using hook (0 tests)

**Untested Integration Scenarios:**
```typescript
// ThreadDetail.tsx - Untested flows
useEffect(() => {
  setDraft(storedDraft || '');
}, [storedDraft, thread.id]);  // Draft sync on thread change

// Multi-step workflow
handleSend()           // User enters instructions
  → addMessage()       // Saves to conversation
  → fetch('/api/...')  // Network call
  → addMessage()       // Saves AI response
  → updateDraft()      // Updates draft
```

## Proposed Solutions

### Solution 1: Add React Testing Library Integration Tests (Recommended)
**Implementation:**
```typescript
// ThreadDetail.integration.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadDetail } from './ThreadDetail';

describe('ThreadDetail integration', () => {
  it('syncs draft when thread changes', async () => {
    const thread1 = { id: 'thread-1', ... };
    const thread2 = { id: 'thread-2', ... };

    // Mock useConversation to return different drafts
    vi.mocked(useConversation).mockImplementation((threadId) => {
      return {
        currentDraft: threadId === 'thread-1' ? 'Draft 1' : 'Draft 2',
        ...
      };
    });

    const { rerender } = render(<ThreadDetail thread={thread1} />);

    expect(screen.getByRole('textbox')).toHaveValue('Draft 1');

    // Change thread
    rerender(<ThreadDetail thread={thread2} />);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Draft 2');
    });
  });

  it('completes full generate → feedback → regenerate workflow', async () => {
    const user = userEvent.setup();

    render(<ThreadDetail thread={mockThread} />);

    // Step 1: User enters instructions
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Write a polite email');
    await user.click(screen.getByText('Generate'));

    // Step 2: AI responds (mock network)
    await waitFor(() => {
      expect(screen.getByText(/Dear/)).toBeInTheDocument();
    });

    // Step 3: User gives feedback
    await user.type(textarea, 'Make it shorter');
    await user.click(screen.getByText('Regenerate'));

    // Step 4: AI regenerates
    await waitFor(() => {
      expect(screen.getByText(/Hi/)).toBeInTheDocument();
    });

    // Verify conversation history
    const messages = screen.getAllByTestId('conversation-message');
    expect(messages).toHaveLength(4); // user, assistant, user, assistant
  });

  it('clears conversation when skipping thread', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();

    render(<ThreadDetail thread={mockThread} onSkip={onSkip} />);

    // Add some conversation history
    await user.type(screen.getByRole('textbox'), 'Test message');
    await user.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByTestId('conversation-history')).toHaveTextContent('Test message');
    });

    // Skip should clear conversation
    await user.click(screen.getByText('Skip'));

    expect(onSkip).toHaveBeenCalled();
    // Verify conversation cleared (this is where we'd test the hook integration)
  });
});
```

**Pros:**
- Tests real user flows end-to-end
- Catches integration bugs (state sync, timing issues)
- Validates component + hook work together
- Industry standard React testing

**Cons:**
- More complex to set up (need to mock APIs)
- Slower tests (render full component tree)
- Requires mocking network calls

**Effort**: Medium-Large (4-6 hours)
**Risk**: Low-Medium (may reveal bugs in draft sync)

### Solution 2: Add Playwright Component Tests
**Implementation:**
```typescript
// Uses Playwright component testing (not E2E)
import { test, expect } from '@playwright/experimental-ct-react';
import { ThreadDetail } from './ThreadDetail';

test('syncs draft across thread navigation', async ({ mount }) => {
  const component = await mount(<ThreadDetail thread={thread1} />);

  await expect(component.getByRole('textbox')).toHaveValue('Draft 1');

  await component.update(<ThreadDetail thread={thread2} />);

  await expect(component.getByRole('textbox')).toHaveValue('Draft 2');
});
```

**Pros:**
- Real browser environment (most accurate)
- Easy to debug visually
- Can test browser-specific behavior

**Cons:**
- Requires Playwright setup
- Slower than RTL
- Overkill for simple integration tests

**Effort**: Large (6-8 hours with setup)
**Risk**: Low

### Solution 3: Add Cypress Component Tests
**Implementation:**
Similar to Playwright but using Cypress.

**Pros/Cons**: Similar to Playwright.

**Effort**: Large (6-8 hours)
**Risk**: Low

## Recommended Action

**Use Solution 1** (React Testing Library) because:
- Standard React testing approach
- Faster than browser-based testing
- Sufficient for integration testing
- Team likely familiar with RTL

**Consider Solution 2** if visual testing becomes important.

## Technical Details

**Affected Files:**
- Create new: `/email-workflow/app/inbox/ThreadDetail.integration.test.tsx`
- Reference: `/email-workflow/app/inbox/ThreadDetail.tsx` (component under test)
- Reference: `/email-workflow/hooks/useConversation.ts` (hook under test)

**Test Scenarios:**
1. Draft sync on thread change
2. Multi-step workflow (generate → feedback → regenerate)
3. Clearing conversation on skip/approve
4. Storage warning display to user
5. Loading states during generation

## Acceptance Criteria

- [ ] Test: Draft syncs when thread ID changes
- [ ] Test: Complete generate → feedback → regenerate workflow
- [ ] Test: Conversation clears on skip/approve
- [ ] Test: Storage warning displays to user
- [ ] Test: Loading states show during async operations
- [ ] All integration tests pass
- [ ] No race conditions in multi-step workflows

## Work Log

### 2026-01-11 - Issue Created
- **Source**: Architecture review of PR #70
- **Severity**: P2 - Important but not blocking merge
- **Gap**: Component-hook integration untested

## Resources

- **PR #70**: https://github.com/benigeri/productiviy-system/pull/70
- **RTL Docs**: https://testing-library.com/docs/react-testing-library/intro/
- **Component**: `/email-workflow/app/inbox/ThreadDetail.tsx`
- **Hook**: `/email-workflow/hooks/useConversation.ts`
