# Session Context - Email Workflow Labels

## Key Learning: Gmail Array Ordering

**Gmail does NOT guarantee the order of labels in the folders array.** Do not rely on array position to determine which label was "most recently added."

## Architecture Decision: Workflow Label Management

Workflow labels (`wf_respond`, `wf_review`, `wf_drafted`) are mutually exclusive states.

### Responsibility Split

**Composer (email-workflow app):**
- When adding `wf_drafted`, remove `wf_respond` and `wf_review` in the SAME Nylas API call
- The app knows user intent, so it handles state transitions
- **Status: WORKING** - `/api/drafts/save` calls `/api/threads` with:
  - `addLabels: [wf_drafted]`
  - `removeLabels: [wf_respond, wf_review]`

**Webhook (nylas-webhook):**
- Archive detected (no INBOX) → clear ALL workflow labels from thread
- Sent detected → clear ALL workflow labels from thread
- No deduplication logic - just handles "done" transitions

**Raycast Extension:**
- Uses `/api/compose/save` for NEW emails (not replies)
- No workflow labels needed - correct behavior

### Why This Is Better
- No reliance on Gmail array ordering
- Each component has single responsibility
- Deterministic behavior controlled by our code

---

## Completed: Removed Webhook Deduplication Logic

### Changes Made

| File | Change |
|------|--------|
| `nylas-webhook/index.ts` | Removed `getMostRecentWorkflowLabel` import and dedup logic (lines 259-278) |
| `_shared/lib/workflow-labels.ts` | Deleted `getMostRecentWorkflowLabel()` function |
| `_shared/lib/workflow-labels.ts` | Simplified `removeWorkflowLabels()` - removed `keepLabel` parameter |
| `_shared/lib/workflow-labels.test.ts` | Removed `getHighestPriorityLabel` import and tests (function didn't exist) |
| `_shared/lib/workflow-labels.test.ts` | Removed tests for `keepLabel` parameter |
| `nylas-webhook/index.test.ts` | Removed "keeps most recent workflow label" test |

### LOC Reduction
- ~85 lines removed
- All tests pass (16/16 in both test files)

### What Was Removed
The webhook used to try to "pick a winner" when multiple workflow labels existed on a single message by using `getMostRecentWorkflowLabel()`. This was unreliable because Gmail doesn't guarantee array ordering.

### What Remains Working
- Archive detection (no INBOX → clears all workflow labels from thread)
- Sent detection (SENT folder → clears all workflow labels from thread)
- Composer handles mutual exclusivity proactively

---

## Fixed This Session

1. **SENT label error** - Filter out read-only system labels (SENT, DRAFT, TRASH, SPAM) from folder updates
2. **Superhuman "Done"** - Archive detection triggers workflow label removal (working)
3. **Removed unreliable deduplication** - Deleted `getMostRecentWorkflowLabel` and associated logic

## Open Issues

- **ps-58**: Some emails not getting classified - need to investigate classifier calls
- **ps-59**: Gmail quote handling
