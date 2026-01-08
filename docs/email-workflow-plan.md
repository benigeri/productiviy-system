# Email Workflow Improvement Plan

## Current Status: E2E Test Partial - Improvements Needed

E2E test started 2026-01-07. Thread 1 processed successfully (draft created, labels updated).
Several issues discovered that need fixing before full rollout.

## Implementation Steps

| Step | Task | Status | PR |
|------|------|--------|-----|
| 1 | Create `drafted` label (Label_215) | ✅ Done | - |
| 2 | Create email-canvas.py | ✅ Done | #34 |
| 3 | Create draft-email.py | ✅ Done | #33 |
| 4 | Rewrite SKILL.md | ✅ Done | #35 |
| 5 | Add tests (29 tests) | ✅ Done | #36 |
| 6 | E2E test (partial) | ⚠️ Issues | - |
| 7 | Fix paragraph formatting | ✅ Done | - |
| 8 | **Fix issues below** | ⏳ Next | - |

## Known Issues (from E2E testing)

### 1. Draft Mismatch (productiviy-system-126)
**Problem:** The draft shown in the panel differs from the draft sent to Gmail.
- Panel shows one version, Gmail gets a different (possibly better) version
- Need to ensure consistency: what you see is what gets saved

### 2. Prompt Quality (productiviy-system-mhg)
**Problem:** draft-email.py prompts not generating exact desired output.
- Need to debug and tune the prompts in `email-writing-guidelines.md`
- May need to adjust temperature, add examples, or refine instructions

### 3. Tmux Performance (productiviy-system-smy)
**Problem:** Panel rendering is slow and buggy.
- Loading drafts into panel is slow
- Panel sometimes disappears unexpectedly
- Need to build a more robust utility for faster rendering
- Consider: batch updates, simpler refresh mechanism, or alternative display

## Files

```
.claude/skills/email-respond/
├── SKILL.md                      # Workflow instructions
├── email-canvas.py               # Terminal panel display
├── email-canvas_test.py          # 12 tests
├── email-writing-guidelines.md   # Paul's email prompt
└── paul-emails.txt               # Style reference examples

draft-email.py                    # AI draft generator (project root)
draft-email_test.py               # 17 tests
```

## Key Details

### Label IDs
- `to-respond-paul`: Label_139
- `to-read-paul`: Label_138
- `drafted`: Label_215

### draft-email.py Output
Returns raw JSON (no code blocks):
```json
{"to": [...], "cc": [...], "subject": "Re: ...", "body": "<p>HTML with <a href>links</a></p>"}
```

### Running Tests
```bash
pytest draft-email_test.py .claude/skills/email-respond/email-canvas_test.py -v
# 29 tests pass
```

## E2E Test Checklist

- [ ] Run `/handle-to-respond-paul`
- [ ] Verify tmux panel shows thread list
- [ ] Select a thread, verify it displays
- [ ] Dictate a response
- [ ] Verify AI draft appears in panel
- [ ] Say "approve"
- [ ] Verify Gmail draft created
- [ ] Verify labels updated (drafted added, to-respond-paul removed)
- [ ] Verify auto-advances to next thread

## Resume Instructions

```bash
bd prime                              # Load beads context
cat docs/email-workflow-plan.md       # Review this plan
bd ready                              # See available work
```

Then run `/handle-to-respond-paul` to test the workflow.
