# Email Workflow Improvement Plan

## Current Status: Ready for E2E Testing

All implementation complete. Next step: test `/handle-to-respond-paul` end-to-end.

## Implementation Steps

| Step | Task | Status | PR |
|------|------|--------|-----|
| 1 | Create `drafted` label (Label_215) | ✅ Done | - |
| 2 | Create email-canvas.py | ✅ Done | #34 |
| 3 | Create draft-email.py | ✅ Done | #33 |
| 4 | Rewrite SKILL.md | ✅ Done | #35 |
| 5 | Add tests (29 tests) | ✅ Done | #36 |
| 6 | **Test end-to-end** | ⏳ Next | - |

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
