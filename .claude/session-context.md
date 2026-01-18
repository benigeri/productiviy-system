# Session Context - Email Workflow Labels

## Key Learning: Gmail Array Ordering

**Gmail does NOT guarantee the order of labels in the folders array.** Do not rely on array position to determine which label was "most recently added."

## Architecture Decision: Workflow Label Management

Workflow labels (`wf_respond`, `wf_review`, `wf_drafted`) are mutually exclusive states.

### Responsibility Split

**Composer (email-workflow app):**
- When adding `wf_drafted`, remove `wf_respond` and `wf_review` in the SAME Nylas API call
- The app knows user intent, so it handles state transitions

**Webhook (nylas-webhook):**
- Archive detected (no INBOX) → clear ALL workflow labels from thread
- Sent detected → clear ALL workflow labels from thread
- No deduplication logic needed - just handles "done" transitions

### Why This Is Better
- No reliance on Gmail array ordering
- Each component has single responsibility
- Deterministic behavior controlled by our code

## Plan: Update Composer to Clear Workflow Labels

### Task 1: Find composer label-setting code
Location: `email-workflow/` app - find where `wf_drafted` is added

### Task 2: Update to remove other workflow labels
When adding `wf_drafted`:
```typescript
// Instead of just adding wf_drafted:
folders: [...currentFolders, wf_drafted_id]

// Remove other workflow labels AND add wf_drafted:
folders: currentFolders
  .filter(id => !isWorkflowLabel(id))  // Remove wf_respond, wf_review, wf_drafted
  .concat(wf_drafted_id)               // Add wf_drafted
```

### Task 3: Remove/simplify webhook deduplication
- Remove `getMostRecentWorkflowLabel` usage from webhook
- Keep the function as utility but don't use for deduplication
- Webhook only handles archive/sent detection (already working)

## Fixed This Session

1. **SENT label error** - Filter out read-only system labels (SENT, DRAFT, TRASH, SPAM) from folder updates
2. **Superhuman "Done"** - Archive detection triggers workflow label removal (working)

## Open Issues

- **ps-58**: Some emails not getting classified - need to investigate classifier calls
- **ps-59**: Gmail quote handling
