# Email Workflow - End-to-End Test Guide

**Purpose**: Verify all bug fixes and features work correctly in real workflow usage.

**Date**: 2026-01-09
**Branch**: main (after hotkeys merge)

---

## Prerequisites

```bash
# Verify environment
source .env
echo "✓ NYLAS_API_KEY: ${NYLAS_API_KEY:0:10}..."
echo "✓ NYLAS_GRANT_ID: ${NYLAS_GRANT_ID:0:10}..."
echo "✓ ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:10}..."

# Verify you're in tmux
[ -n "$TMUX" ] && echo "✓ Running in tmux" || echo "✗ Not in tmux - start tmux first"
```

---

## Test Scenarios

### Scenario 1: Basic Workflow (Happy Path)

**Test**: Complete workflow with 2-3 simple emails

1. Start workflow:
   ```
   /email-respond
   ```

2. For each email shown:
   - Read the thread in the panel
   - Dictate a response (or use Alt+V to paste)
   - Review the generated draft
   - Press **Alt+A** to approve (or type "approve")
   - Verify draft appears in panel as approved

3. After processing 2-3 emails:
   - Type "done" or press **Alt+D**
   - Verify session summary shows correct counts

**Expected Results**:
- [ ] Panel shows email threads correctly
- [ ] Drafts are generated and displayed
- [ ] Alt+A/S/D hotkeys work correctly
- [ ] Session summary appears with draft count
- [ ] All drafts appear in Gmail drafts folder
- [ ] Threads have `drafted` label (Label_215)
- [ ] Threads no longer have `to-respond-paul` label (Label_139)

**Bug Verification**:
- [ ] Bug #5 FIXED: Labels updated correctly (to-respond removed, drafted added)
- [ ] Bug #6 FIXED: Drafts appear in Gmail
- [ ] Bug #7 FIXED: Line breaks visible in draft preview

---

### Scenario 2: Feedback Iteration

**Test**: Revise a draft based on feedback

1. Start workflow and show first email
2. Dictate a response
3. When draft appears, give feedback:
   ```
   make it shorter and more casual
   ```
4. Review revised draft
5. Approve with Alt+A

**Expected Results**:
- [ ] Revised draft reflects feedback
- [ ] Revision appears in panel
- [ ] Final draft saved to Gmail correctly

---

### Scenario 3: Long Thread (25+ messages)

**Test**: Handle thread with many messages (tests batching fix)

1. Find a thread with 20+ messages in Gmail
2. Add `to-respond-paul` label
3. Start workflow
4. Navigate to that thread

**Expected Results**:
- [ ] Thread displays without "message_id cannot exceed 20" error (Bug #2 fixed)
- [ ] All messages shown in chronological order
- [ ] Latest message at bottom with "LATEST" indicator
- [ ] Thread is readable and navigable

---

### Scenario 4: Skip & Progress Tracking

**Test**: Skip feature and progress counters

1. Start workflow with multiple threads
2. For some threads, press **Alt+S** to skip
3. For others, create drafts with **Alt+A**
4. Monitor progress display in panel header

**Expected Results**:
- [ ] Alt+S skips to next thread immediately
- [ ] Progress count updates (e.g., "Thread 3/10: [2 drafted, 1 skipped]")
- [ ] Skipped threads keep original labels
- [ ] Session summary shows correct drafted/skipped counts

---

### Scenario 5: Multi-line Dictation (Alt+V)

**Test**: Paste multi-line clipboard content

1. Copy this text to clipboard:
   ```
   Thanks for reaching out.

   I'd love to discuss this further. Let me know your availability next week.

   Best regards
   ```
2. Start workflow, show first email
3. Press **Alt+V** to paste
4. Verify draft is generated with dictation

**Expected Results**:
- [ ] Alt+V pastes full clipboard content
- [ ] Multi-line content preserved
- [ ] Draft generated correctly
- [ ] No command injection issues (security)

---

### Scenario 6: Hotkey Cleanup

**Test**: Verify hotkeys are properly bound/unbound

1. Before starting workflow:
   ```bash
   tmux list-keys -T root | grep -E 'M-(a|s|d|v)'
   # Should show: 0 bindings
   ```

2. Start workflow (panel created)
   ```bash
   tmux list-keys -T root | grep -E 'M-(a|s|d|v)' | wc -l
   # Should show: 4 bindings
   ```

3. Exit workflow (panel closed)
   ```bash
   tmux list-keys -T root | grep -E 'M-(a|s|d|v)'
   # Should show: 0 bindings
   ```

**Expected Results**:
- [ ] Hotkeys activate when panel opens
- [ ] Hotkeys deactivate when panel closes
- [ ] No stale bindings remain

---

### Scenario 7: Panel Safety

**Test**: Verify panel manager doesn't kill wrong pane (Bug #1)

1. Open email workflow (creates panel on right)
2. Try closing panel:
   ```
   done
   ```
3. Verify Claude Code conversation pane is still active

**Expected Results**:
- [ ] Only email panel closes
- [ ] Agent Deck conversation pane remains open (Bug #1 fixed)
- [ ] Can continue conversation normally

---

## Post-Test Verification

After completing E2E tests, verify in Gmail:

### Check Drafts
1. Go to Gmail → Drafts
2. Verify all approved emails appear as drafts
3. Open a few drafts and check:
   - [ ] Recipients are correct (to/cc)
   - [ ] Subject is appropriate
   - [ ] Body has proper formatting (line breaks, paragraphs)
   - [ ] Body is HTML (not plain text)

### Check Labels
1. Search Gmail for `label:drafted`
2. Verify threads you drafted show up
3. Check that `to-respond-paul` label is removed from those threads
4. Verify no workflow labels on skipped threads

---

## Known Limitations (Acceptable)

- **macOS Only**: Alt+V clipboard paste uses `pbpaste` (macOS only)
- **Tmux Required**: Hotkeys require tmux session
- **Gmail Sync**: Drafts may take 1-2 seconds to appear in Gmail UI

---

## If Issues Found

Document any issues in this format:

```markdown
### Issue: [Brief description]
**Scenario**: [Which test scenario]
**Steps to reproduce**:
1. ...
2. ...

**Expected**: ...
**Actual**: ...
**Priority**: [P0/P1/P2/P3]
```

---

## Success Criteria

**All scenarios pass** = Ready to archive planning docs and close epic

- [ ] All 7 test scenarios completed successfully
- [ ] No P0 or P1 bugs found
- [ ] All historical bugs verified fixed
- [ ] Hotkeys work reliably
- [ ] Gmail drafts appear correctly
- [ ] Labels update correctly
