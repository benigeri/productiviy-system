# Beads Workflow Guide

**Your practical guide to using Beads properly with Claude Code**

Last Updated: 2026-01-10

---

## What is Beads?

**Beads = Git-native issue tracking designed for AI agents**

- Issues stored in `.beads/issues.jsonl` (committed to git)
- Fast SQLite cache for querying
- Designed for epics, dependencies, and parallel work
- Works across sessions (Claude remembers via Beads)

---

## The Basic Cycle (Learn This First)

```bash
# 1. Find work
bd ready

# 2. Pick an issue and mark it active
bd update productiviy-system-abc --status in_progress

# 3. Do the work
# ...

# 4. Close when done
bd close productiviy-system-abc
# (auto-saves to .beads/issues.jsonl)
```

**That's it.** Commit `.beads/` with your code changes. Everything else builds on this cycle.

---

## Core Commands (Memorize These 10)

### Finding Work
```bash
bd ready                      # Show unblocked work (most important!)
bd list --status=open         # All open issues
bd list --priority P0,P1      # High priority work
bd show productiviy-system-abc  # See issue details
```

### Creating Work
```bash
bd create "Add login page"                           # Simple
bd create "Fix bug" --type bug --priority 1          # With metadata
bd create "Epic name" --type epic --priority 1       # For big features
```

### Working on Issues
```bash
bd update <id> --status in_progress    # Start work
bd note <id> "Progress update"         # Add note without reopening
bd close <id>                          # Mark done
bd close <id> --reason "Fixed by implementing X"  # With explanation
```

### Dependencies
```bash
bd dep add <child-id> <parent-id>      # Child depends on parent
bd list --parent <id>                  # Show children
bd epic status                         # See epic progress
```

### Persistence (JSONL-only mode)
```bash
# Beads auto-save to .beads/issues.jsonl
# Just commit .beads/ with your other changes
git add .beads/ && git commit -m "Update beads"
```

---

## The Epic Workflow (For Big Features)

**Use this when you have 3+ related tasks.**

### Step 1: Create the Epic

```bash
bd create "Email Workflow V2" --type epic --priority 1 \
  --description "Add draft iteration, Skip/Approve buttons, shadcn UI.

Current Issues:
- Drafts auto-save immediately (should only save on Approve)
- No feedback/iteration loop
- No Skip/Approve buttons

Implementation Plan:
1. Install shadcn components
2. Add conversation state in localStorage
3. Implement feedback loop UI
4. Add Skip/Approve buttons
5. Refactor API to prevent auto-save"
```

**Result:** Creates `productiviy-system-abc` (the epic)

### Step 2: Break Down Into Tasks

```bash
# Create child tasks that block the epic
bd create "Install shadcn components"
# → Creates productiviy-system-def

bd create "Add feedback loop UI"
# → Creates productiviy-system-ghi

bd create "Add Skip/Approve buttons"
# → Creates productiviy-system-jkl

bd create "Refactor API to prevent auto-save"
# → Creates productiviy-system-mno
```

### Step 3: Link Tasks to Epic

```bash
# Make epic depend on (blocked by) all tasks
bd dep add productiviy-system-def productiviy-system-abc  # shadcn blocks epic
bd dep add productiviy-system-ghi productiviy-system-abc  # feedback blocks epic
bd dep add productiviy-system-jkl productiviy-system-abc  # buttons block epic
bd dep add productiviy-system-mno productiviy-system-abc  # API blocks epic
```

**Result:** Epic won't show in `bd ready` until all tasks are closed.

### Step 4: Work Through Tasks

```bash
# See what's ready to work on
bd ready

# Shows:
# productiviy-system-def: Install shadcn components
# productiviy-system-ghi: Add feedback loop UI
# ... (all tasks, since none have blockers)

# Pick one
bd update productiviy-system-def --status in_progress

# Do the work...

# Close it
bd close productiviy-system-def --reason "Installed shadcn with Dialog, Button, Textarea components"
# Auto-saved to .beads/issues.jsonl
```

### Step 5: Track Progress

```bash
# See epic status
bd epic status

# Shows:
# productiviy-system-abc (Email Workflow V2)
#   Dependencies: 4 total, 1 closed, 3 open
#   Ready to close: No
```

### Step 6: Close the Epic

```bash
# When all tasks done, epic becomes ready
bd ready
# Shows: productiviy-system-abc (Email Workflow V2)

# Close it
bd close productiviy-system-abc --reason "All features implemented and tested"
# Auto-saved to .beads/issues.jsonl
```

---

## Integrating With Compound Engineering

### When You Use Plan Mode

**Before (complicated):**
- Use plan mode
- Create Epic + Plan file + Beads
- Maintain bidirectional links
- Verify synchronization

**After (simple):**
```bash
# 1. Use compound engineering plan mode
#    Claude creates a plan in the conversation

# 2. After planning, create an Epic with the plan in the description
bd create "Feature Name" --type epic --priority 1 \
  --description "$(pbpaste)"  # Paste the plan from conversation

# 3. Claude creates child Beads and links them
bd create "Task 1" --priority 1
bd dep add <task-id> <epic-id>
# Repeat for each task
```

**The Epic description IS your plan.** No separate files. No sync issues.

### When You Use Work Mode

**Work mode executes tasks,** Beads tracks them:

```bash
# Pick a Bead
bd ready
bd update <id> --status in_progress

# Work on it (using compound engineering work mode or directly)
# ...

# Close when done
bd close <id>
```

---

## Your Current Workflow (Already Good!)

Looking at your actual usage, you're already doing most of this right:

**✅ What You're Doing Well:**
1. Creating epics for big features (productiviy-system-2m4)
2. Using dependencies to track task completion
3. Writing detailed descriptions
4. Using priorities effectively (P0 for critical, P1 for sprint work)
5. Adding close reasons

**⚠️ What to Add:**
1. **Mark work in-progress:** `bd update <id> --status in_progress`
2. **Use `bd ready` daily:** Shows what's unblocked
3. **Commit .beads/ with your changes:** Beads auto-save to JSONL

---

## Common Patterns

### Quick Bug Fix
```bash
bd create "Fix: Button not working" --type bug --priority 0
bd update <id> --status in_progress
# Fix it...
bd close <id> --reason "Fixed event handler typo"
# Commit with your code changes
```

### Feature With Multiple PRs
```bash
# Epic
bd create "Add authentication" --type epic --priority 1

# Tasks (one per PR)
bd create "Backend: Add JWT auth"
bd create "Frontend: Add login form"
bd create "Tests: E2E auth tests"

# Link them
bd dep add <backend-id> <epic-id>
bd dep add <frontend-id> <epic-id>
bd dep add <tests-id> <epic-id>

# Work through them, one PR per task
```

### Parallel Work (Multiple Active Epics)
```bash
bd list --status=open --type=epic

# Shows:
# productiviy-system-2m4: Email Workflow
# productiviy-system-5r9: Weekly Cadence Skill

# Work on both simultaneously
bd ready  # Shows all unblocked tasks from both epics
# Pick from either epic as needed
```

---

## Priority Guidelines

Use these consistently:

- **P0 (Critical):** Blocking prod, must fix immediately
- **P1 (High):** This sprint, next 1-2 weeks
- **P2 (Medium):** Next sprint, 2-4 weeks
- **P3 (Low):** Backlog, nice-to-have
- **P4 (Someday):** Ideas, maybe never

**Example:**
```bash
bd create "Fix XSS vulnerability" --type bug --priority 0  # P0
bd create "Add dark mode" --type feature --priority 2      # P2
```

---

## Advanced: Using Labels

Add labels for better filtering:

```bash
# Create with labels
bd create "Add email templates" --label email,feature

# Add label to existing
bd label add <id> frontend,ui

# Filter by label
bd list --label email
bd list --label frontend,urgent
```

---

## Advanced: Due Dates

Set deadlines for time-sensitive work:

```bash
# Set due date
bd update <id> --due "2026-01-15"

# See what's overdue
bd list --overdue

# See what's due soon
bd list --due-before "tomorrow"
```

---

## The Daily Workflow

**Morning:**
```bash
bd ready                      # See unblocked work
bd list --priority P0,P1      # Focus on high priority
```

**Pick something:**
```bash
bd show <id>                  # Read full description
bd update <id> --status in_progress
```

**While working:**
```bash
bd note <id> "Implemented X, working on Y"
```

**After completing:**
```bash
bd close <id> --reason "What you did and how it was verified"
git add . && git commit       # Include .beads/ with your changes
git push
```

**End of day:**
```bash
bd list --status in_progress  # See what's still active
bd stats                      # See progress
git status                    # Ensure .beads/ is committed
```

---

## When NOT to Use Beads

**Don't create Beads for:**
- Tiny fixes (typos, formatting)
- Experiments that might not ship
- Personal notes/reminders
- Things that take < 30 minutes

**Just use:**
- Git commits for tiny fixes
- TODO comments in code for reminders
- Scratch files for experiments

**Beads is for work you want to track across sessions.**

---

## Troubleshooting

### "Beads not committed"
```bash
git status                    # Check if .beads/ has changes
git add .beads/               # Stage beads
git commit -m "Update beads"  # Commit
```

### "Can't find my issue"
```bash
bd list --status=closed --limit 50  # Recent closed
bd search "keyword"                 # Full-text search
bd list | grep "pattern"            # Grep output
```

### "Too many open issues"
```bash
bd list --status=open               # See all open
bd close <id1> <id2> <id3>          # Close multiple
bd delete <id>                      # Delete if created by mistake
```

### "Daemon issues"
```bash
bd doctor                    # Check health
bd doctor --fix              # Auto-fix common issues
bd daemon restart            # Restart daemon
```

---

## Quick Reference Card

```bash
# Essential Commands (memorize these)
bd ready                             # Find work
bd create "Title"                    # New issue
bd update <id> --status in_progress # Start work
bd close <id>                        # Finish work
# (auto-saves to .beads/issues.jsonl)

# Epic Workflow
bd create "Epic" --type epic         # Create epic
bd dep add <task-id> <epic-id>       # Link task to epic
bd epic status                       # See progress

# Viewing
bd show <id>                         # Details
bd list --status=open                # All open
bd list --priority P0,P1             # High priority
bd stats                             # Overview

# Advanced
bd note <id> "Update"                # Add note
bd search "keyword"                  # Search
bd label add <id> tag                # Label
```

---

## Example: Real Workflow From Your Repo

**Your Email Workflow Epic** (productiviy-system-2m4):

```bash
# 1. Created epic
bd create "Email Workflow: Iteration UI Improvements" --type epic --priority 1

# 2. Created 5 tasks
bd create "Implement draft feedback/iteration loop" --priority 1
bd create "Add Skip and Approve buttons" --priority 1
bd create "Refactor draft generation (no auto-save)" --priority 1
bd create "Add conversation state management" --priority 1
bd create "Install shadcn UI components" --priority 1

# 3. Linked all to epic
bd dep add productiviy-system-ohj productiviy-system-2m4
bd dep add productiviy-system-n0i productiviy-system-2m4
bd dep add productiviy-system-xhs productiviy-system-2m4
bd dep add productiviy-system-8a4 productiviy-system-2m4
bd dep add productiviy-system-rbm productiviy-system-2m4

# 4. Worked through tasks
bd ready  # Showed all 5 tasks
bd update productiviy-system-rbm --status in_progress
# ... implemented shadcn ...
bd close productiviy-system-rbm

# Repeat for each task...

# 5. Close epic when all done
bd close productiviy-system-2m4
# Commit .beads/ with your code changes
```

**This is the pattern.** Use it for all big features.

---

## Summary: The Simple Rules

1. **Use `bd ready` every morning** - Find unblocked work
2. **Create epics for 3+ related tasks** - Group work logically
3. **Link tasks to epics with dependencies** - Track progress
4. **Mark work in-progress** - Know what's active
5. **Write good close reasons** - Document what you did
6. **Sync after closing** - Commit to git
7. **Use priorities consistently** - P0-P4 scale

**That's the entire workflow.** Everything else is optional.

---

## Resources

- **Beads Help:** `bd --help` or `bd <command> --help`
- **Beads Repo:** https://github.com/steveyegge/beads
- **Best Practices:** https://steve-yegge.medium.com/beads-best-practices-2db636b9760c
- **Your Stats:** `bd stats`
- **Health Check:** `bd doctor`

---

**Questions?** Ask Claude to show you examples from your actual Beads.
