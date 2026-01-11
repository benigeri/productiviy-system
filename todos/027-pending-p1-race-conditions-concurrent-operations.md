---
status: pending
priority: p1
issue_id: "027"
tags: [code-review, frontend-races, concurrency]
dependencies: []
---

# Race Conditions in Concurrent Draft Operations

## Problem Statement

Multiple race conditions exist in the draft generation workflow where concurrent user actions can lead to:
1. **Wrong draft displayed** - User sees one draft, but conversation history has another
2. **Wrong draft saved** - User approves one draft, but a different version gets saved to Gmail
3. **State corruption** - Draft from wrong thread displayed after rapid navigation
4. **Memory leaks** - State updates on unmounted components

**Why this matters:**
- Users lose trust when drafts "change on their own"
- Data integrity issues (conversation history out of sync)
- Production bugs that are hard to reproduce
- User confusion and support burden

## Findings

**From Frontend Races Review (Julik):**

### Race 1: Double-Click on "Generate Draft"

**Timeline:**
```
T+0ms:   Click #1 → setLoading(true), fetch starts
T+50ms:  Click #2 → button not yet disabled, setLoading(true) again, second fetch starts
T+800ms: First fetch completes → setDraft(bodyA), setLoading(false)
T+1200ms: Second fetch completes → setDraft(bodyB), setLoading(false)
```

**Result:** UI shows `bodyB`, but conversation history has `addMessage('assistant', bodyA)` first. History and UI are out of sync.

**Root Cause:** React state updates are batched/async. Between `setLoading(true)` and re-render, rapid clicks slip through.

### Race 2: Approve During Regenerate

**Timeline:**
```
T+0ms:   "Regenerate" starts → setLoading(true), fetch begins
T+100ms: User clicks "Approve" → setSaving(true), starts saving OLD draft
T+800ms: "Regenerate" completes → setDraft(newBody), setLoading(false)
T+1200ms: "Approve" completes → saves OLD draft to Gmail
```

**Result:** UI shows `newBody`, but `oldBody` was saved to Gmail. User thinks they approved the new draft.

**Root Cause:** "Approve" button is disabled by `saving`, not `loading`. While regenerating, `saving` is false, so button is clickable.

### Race 3: Component Unmount During Fetch

**Timeline:**
```
T+0ms:   "Generate Draft" starts → fetch begins
T+500ms: User clicks "Next →" → component unmounts
T+1000ms: Fetch completes → setDraft(), setLoading() called on unmounted component
```

**Result:** React warning "Can't perform state update on unmounted component", memory leak from closures over state setters.

### Race 4: Rapid Thread Navigation

**Timeline:**
```
T+0ms:   Thread A loads → useEffect runs → setDraft('')
T+100ms: User clicks "Next" → Thread B loads → useEffect runs → setDraft('')
T+200ms: User clicks "Next" → Thread C loads → useEffect runs → setDraft('')
T+300ms: Meanwhile, "Generate Draft" for Thread A completes → setDraft(bodyA)
```

**Result:** Viewing Thread C, but displaying draft from Thread A. Complete chaos.

**Root Cause:** No cleanup or cancellation token in fetch. Thread A's fetch doesn't know component moved to Thread C.

## Proposed Solutions

### Option 1: State Machine + Cancellation Tokens (Recommended)

**Pros:**
- Prevents all identified race conditions
- Single source of truth for operation state
- Proper cleanup on unmount/navigation
- Industry-standard pattern

**Cons:**
- Requires refactoring existing state management
- More complex than current implementation

**Effort:** Medium (4-6 hours)
**Risk:** Low

**Implementation:**

**Step 1: Replace loading/saving with state machine**

```typescript
type OpState = 'idle' | 'generating' | 'regenerating' | 'saving';
const [opState, setOpState] = useState<OpState>('idle');
```

**Step 2: Add cancellation tokens**

```typescript
const [cancelToken, setCancelToken] = useState({ canceled: false });

useEffect(() => {
  // Reset cancelation token when thread changes
  const newToken = { canceled: false };
  setCancelToken(newToken);

  return () => {
    newToken.canceled = true; // Cancel on unmount or thread change
  };
}, [thread.id]);

async function generateDraft() {
  if (opState !== 'idle') {
    console.warn('Operation already in progress, ignoring generateDraft');
    return;
  }

  const currentToken = cancelToken;
  setOpState('generating');
  setError('');

  if (instructions.trim()) {
    addMessage('user', instructions);
  }

  try {
    const res = await fetch('/api/drafts', { /* ... */ });

    if (currentToken.canceled) return; // Check before state update

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate draft');
    }

    if (currentToken.canceled) return; // Check after async boundary

    const { to = [], cc = [], body } = data;
    addMessage('assistant', body);
    updateDraft(body);
    setDraft(body);
    setDraftTo(to);
    setDraftCc(cc);
    setInstructions('');
  } catch (error) {
    if (currentToken.canceled) return; // Don't show errors for canceled ops

    const message = error instanceof Error ? error.message : 'Failed';
    setError(message);
  } finally {
    if (!currentToken.canceled) {
      setOpState('idle');
    }
  }
}
```

**Step 3: Update button disable conditions**

```typescript
<Button
  onClick={generateDraft}
  disabled={opState !== 'idle' || !instructions.trim()}
  className="w-full h-12"
>
  {opState === 'generating' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {opState === 'generating' ? 'Generating Draft...' : 'Generate Draft'}
</Button>

<Button
  onClick={handleApprove}
  disabled={opState !== 'idle'} // ✅ Blocks during all operations
  className="flex-1 h-12"
>
  {opState === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {opState === 'saving' ? 'Saving...' : 'Approve & Send to Gmail'}
</Button>
```

### Option 2: AbortController (Modern Browser API)

**Pros:**
- Native browser API
- Cancels actual network requests (not just state updates)
- Cleaner than custom cancellation tokens

**Cons:**
- Slightly more complex
- Requires understanding AbortController API

**Effort:** Medium (4-6 hours)
**Risk:** Low

**Implementation:**

```typescript
const abortControllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  return () => {
    // Cancel pending requests on unmount/thread change
    abortControllerRef.current?.abort();
  };
}, [thread.id]);

async function generateDraft() {
  if (opState !== 'idle') return;

  // Cancel any pending request
  abortControllerRef.current?.abort();

  const controller = new AbortController();
  abortControllerRef.current = controller;

  setOpState('generating');
  setError('');

  try {
    const res = await fetch('/api/drafts', {
      signal: controller.signal, // ✅ Attach abort signal
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ /* ... */ }),
    });

    // Rest of implementation same as Option 1
  } catch (error) {
    if (error.name === 'AbortError') return; // Request was canceled
    // Handle other errors
  } finally {
    setOpState('idle');
  }
}
```

## Recommended Action

**Implement Option 1: State Machine + Cancellation Tokens**

Reasons:
1. Simpler conceptual model than AbortController
2. Handles all identified races (not just network cancellation)
3. Can be implemented incrementally
4. Easier to test and debug

**Implementation plan:**
1. Replace `loading`/`saving` with `opState` state machine (2 hours)
2. Add cancellation token system (1 hour)
3. Update all three async functions (`generateDraft`, `regenerateDraft`, `handleApprove`) (2 hours)
4. Update button disable conditions (30 min)
5. Test edge cases (1 hour)

## Technical Details

**Affected Files:**
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ThreadDetail.tsx`
  - Lines 47-48: Replace `loading`/`saving` state
  - Lines 64-121: Update `generateDraft`
  - Lines 123-178: Update `regenerateDraft`
  - Lines 208-278: Update `handleApprove`
  - Lines 484, 509, 517, 525: Update button disable logic

**State Machine Transitions:**
```
idle → generating → idle
idle → regenerating → idle
idle → saving → idle

Invalid transitions (blocked):
generating → saving (Approve during Generate)
regenerating → saving (Approve during Regenerate)
generating → regenerating (Regenerate during Generate)
```

**Edge Cases to Test:**
1. Double-click "Generate Draft" rapidly
2. Click "Regenerate" immediately after "Generate" completes
3. Click "Approve" while "Regenerate" is in progress
4. Click "Next →" while "Generate Draft" is in progress
5. Navigate back and forth between threads rapidly
6. Click "Skip" while draft generation is in progress

## Acceptance Criteria

- [ ] Cannot trigger multiple draft generations simultaneously (double-click)
- [ ] Cannot approve draft while regeneration is in progress
- [ ] Cannot regenerate while generation is in progress
- [ ] State updates on unmounted component warning eliminated
- [ ] Rapid thread navigation doesn't show wrong draft
- [ ] All buttons properly disabled during async operations
- [ ] Tests verify each edge case scenario
- [ ] Manual testing with rapid clicks passes

## Work Log

### 2026-01-11
- **Issue Created:** Frontend races review identified critical timing bugs
- **Severity:** P1 (BLOCKS MERGE) - Can cause data corruption and user confusion
- **Reproducer:** Double-click "Generate Draft" button rapidly
- **Next Step:** Implement state machine to replace loading/saving flags

## Resources

- [PR #78 - Draft Metadata Display](https://github.com/benigeri/productiviy-system/pull/78)
- [React useEffect Cleanup](https://react.dev/reference/react/useEffect#useeffect)
- [AbortController MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [State Machine Pattern](https://kentcdodds.com/blog/implement-a-simple-state-machine)
