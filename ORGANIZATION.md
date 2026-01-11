# Project Organization (Updated 2026-01-10)

## Summary

**What happened:**
- Jan 8: Created TMUX email workflow improvements (epic y0o + 8 bug beads)
- Jan 8: Fixed all TMUX bugs (8 beads closed)
- Jan 10: **Pivoted to web app** instead of TMUX
- Jan 10: Built and deployed Next.js web app to https://email-workflow-phi.vercel.app
- Jan 10: Cleaned up organization (closed epic, archived plans, deleted TMUX code)

---

## Current State

### ✅ Active Email Workflow

**Live app:** https://email-workflow-phi.vercel.app

**Code location:** `email-workflow/` directory

**Stack:** Next.js 15 + TypeScript + Tailwind + Braintrust + Nylas API

**What it does:**
- Reply to emails labeled "to-respond-paul"
- AI draft generation via Braintrust
- Save drafts to Gmail via Nylas
- Update labels automatically

### 📋 Open Beads (Email-Related)

| Bead | Title | Priority | Type |
|------|-------|----------|------|
| productiviy-system-0so | Create /compose-email skill for net-new emails | P2 | feature |
| productiviy-system-gvp | Add forward feature to email workflow web app | P2 | feature |

**Note:** Both updated to be about **web app features**, not TMUX.

### 📁 Active Plans

| File | Purpose |
|------|---------|
| `plans/email-workflow-simple-webapp-v2.md` | Web app implementation plan (post-review, simplified) |
| `docs/local-webapp-tech-stack-2026.md` | Tech stack research and decisions |

### 🗄️ Archived Plans

All moved to `plans/archive/` and `docs/archive/`:
- ~~email-workflow-simple-webapp.md~~ (v1, superseded by v2)
- ~~email-workflow-local-webapp-redesign.md~~ (comprehensive redesign, not needed)
- ~~email-workflow-plan.md~~ (old TMUX plan)
- ~~email-workflow-v2-plan.md~~ (TMUX improvements)
- ~~telegram-pipeline-plan.md~~ (completed, archived)
- ~~email-workflow-improvements.md~~ (TMUX improvements)

### 🗑️ Deleted Code

**TMUX system completely removed:**
- ❌ `email_utils.py` (project root)
- ❌ `draft-email.py` (project root)
- ❌ `.claude/skills/email-respond/*.py` (all TMUX scripts)
- ❌ `.claude/skills/email-respond/*.sh` (panel manager, hotkeys)
- ❌ `.claude/skills/email-respond/SKILL.md` (355-line TMUX workflow)

**Kept for reference:**
- ✅ `.claude/skills/email-respond/email-writing-guidelines.md` (AI prompt patterns)
- ✅ `.claude/skills/email-respond/paul-emails.txt` (email style examples)
- ✅ `.claude/skills/email-respond/archive/` (old plans and docs for reference)

---

## Closed Beads (Recently Completed)

### TMUX System (Jan 8)
- ✅ productiviy-system-y0o - Epic (closed: TMUX work done, web app deployed)
- ✅ productiviy-system-g3c - Fix draft not appearing in Gmail
- ✅ productiviy-system-i3u - Fix label removal after draft creation
- ✅ productiviy-system-a5j - Fix line breaks in draft preview
- ✅ 5 more TMUX bug fixes

### Web App (Jan 10)
- ✅ productiviy-system-dxe - Email Workflow: Setup Next.js app
- ✅ productiviy-system-4fi - Email Workflow: Build inbox page
- ✅ productiviy-system-b0o - Email Workflow: Build draft API route
- ✅ productiviy-system-3jh - Email Workflow: Build label update API
- ✅ productiviy-system-urq - Email Workflow: Test & Deploy
- ✅ productiviy-system-stv - Email Workflow: Documentation

---

## File Structure

```
productivity-system/
├── email-workflow/              # 🌟 ACTIVE: Next.js web app
│   ├── app/
│   │   ├── inbox/              # Email reply workflow
│   │   └── api/                # Draft generation + label updates
│   ├── STATUS.md               # Deployment status
│   └── README.md               # Setup instructions
│
├── plans/
│   ├── email-workflow-simple-webapp-v2.md  # Active plan
│   └── archive/                # Old plans (v1, redesign)
│
├── docs/
│   ├── local-webapp-tech-stack-2026.md     # Active tech docs
│   └── archive/                # Old TMUX plans
│
├── .claude/skills/email-respond/
│   ├── email-writing-guidelines.md  # AI prompt patterns (keep)
│   ├── paul-emails.txt              # Style examples (keep)
│   ├── archive/                     # Old TMUX docs
│   └── README.md                    # Points to web app
│
└── ORGANIZATION.md             # This file
```

---

## Next Steps

### P2 Features (Future)
1. **Compose new emails** (bead 0so)
   - Add `/compose` route to web app
   - Form for To/CC/Subject/Body
   - Reuse Braintrust draft generation

2. **Forward emails** (bead gvp)
   - Add "Forward" button to thread view
   - Implement Gmail-style forward body format
   - Omit `reply_to_message_id` (forwards start new threads)

### P3+ (Backlog)
- Linear integration
- Telegram reply → Linear comments
- Calendar integration

---

## Lessons Learned

### Organization Anti-Patterns (Fixed)
❌ Epic with all dependencies closed but epic still open
❌ 8 plan files scattered across 3 directories
❌ Plans referencing deprecated system (TMUX)
❌ Code split between Python (TMUX) and TypeScript (web app)
❌ Beads referring to deleted features

### Current Best Practices
✅ One epic per major effort, close when dependencies done
✅ One active plan per feature + archive old plans
✅ Update bead descriptions when pivoting approaches
✅ Delete deprecated code, don't accumulate cruft
✅ Keep reference materials in archive/ subdirectories

---

**Last Updated:** 2026-01-10
**Current Focus:** Web app is deployed and working, ready for P2 features (compose, forward)
