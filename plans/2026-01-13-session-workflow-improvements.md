# Session Workflow Improvements Plan

**Bead:** ps-40
**Branch:** `feature/session-workflow-improvements`
**Repos:** productivity-system, claude-config-templates, deep-research-archive

---

## Summary

Improve `/start`, `/end`, and add `/health` commands to prevent bead drift, branch accumulation, and lost work.

---

## Actual Files to Edit

| File | Location | Action |
|------|----------|--------|
| `start.md` | `~/.claude/commands/start.md` | Enhance |
| `end.md` | `~/.claude/commands/end.md` | Enhance |
| `health.md` | `~/.claude/commands/health.md` | Create new |
| `CLAUDE-TEMPLATE.md` | `productiviy-system/claude-config-templates/` | Add conventions |
| `BEADS-WORKFLOW.md` | `productiviy-system/claude-config-templates/` | Add conventions |

After completing in productivity-system, copy to:
- `deep-research-archive/` (CLAUDE.md, BEADS-WORKFLOW.md)

---

## Changes to Implement

### 1. New `/health` Command (Standalone)

**File:** `~/.claude/commands/health.md` (create new)

Full audit that runs anytime:

```
/health output:

🔍 HEALTH CHECK

Git State:
  ✓ Branch: main (clean)
  ⚠️ 3 unpushed commits
  ⚠️ 12 remote branches (recommend < 5)

Beads:
  ⚠️ 2 in_progress beads:
     - ps-36: Braintrust integration
     - ps-40: Session workflow improvements

  ⚠️ Potential stale beads (merged PRs found):
     - ps-35: PR #87 merged 2d ago - should close?

Actions:
  - Run `git push` to push commits
  - Run `git fetch --prune` to clean refs
  - Run `bd close ps-35` if work is done
```

**Checks:**
- Uncommitted changes
- Unpushed commits
- In-progress beads
- Cross-reference in_progress beads with merged PRs (via `gh pr list`)
- Remote branch count
- Run `git fetch --prune` to clean stale refs

---

### 2. Enhanced `/start` Command

**File:** `~/.claude/commands/start.md`

**Current behavior preserved** + additions:

```diff
  Step 1: Show current state
    - Git branch (clean/dirty)
    - In-progress beads
+   - Check for unpushed commits (warn if found)
+   - Warn if multiple in_progress beads

  Step 2: Ask what you're working on
    - Resume existing work
    - Start new feature
+     - Add --worktree option
    - Quick fix

+ Step 2.5: If --worktree requested OR user chooses worktree option:
+   - Create worktree at ../worktrees/{feature-name}/
+   - Create bead(s) for the work
+   - Write SESSION_CONTEXT.md with requirements + bead IDs
+   - Output cd command with --dangerously-skip-permissions

+ Step 2.6: If SESSION_CONTEXT.md exists in current dir:
+   - Auto-read and display context
+   - "Continuing from previous session setup..."

  Step 3: Handle selected path (existing logic)
  Step 4: Output session summary
```

**Worktree integration:**
```bash
# Create worktree for new feature
/start --worktree session-workflow

# Output:
✓ Created worktree: ../worktrees/session-workflow/
✓ Created bead: ps-40
✓ Wrote SESSION_CONTEXT.md

# Copy this command to open new session:
cd /Users/benigeri/Projects/worktrees/session-workflow && claude --dangerously-skip-permissions
```

**Worktree naming:** Feature name only (no bead IDs) - cleaner, works for multi-bead scenarios.

**Multi-bead handling:**
- Related beads → same worktree (e.g., ps-40 + ps-41 both in `session-workflow/`)
- Unrelated beads → separate worktrees
- SESSION_CONTEXT.md lists all related beads being worked on

---

### 3. Enhanced `/end` Command

**File:** `~/.claude/commands/end.md`

**Current behavior preserved** + additions:

```diff
  Step 1: Check state
    - Uncommitted changes
+   - Unpushed commits (BLOCK if found)
    - In-progress beads
+   - Detect if in worktree

  Step 2: Handle uncommitted changes (existing)

  Step 3: Handle in-progress beads
    - Close with reason
    - Keep in progress
+   - Park with note (explicit pause with context)

+ Step 4: Push verification
+   If unpushed commits:
+   ⚠️ You have unpushed commits. Push before ending? [Yes/No]

+ Step 5: Worktree cleanup (if in worktree)
+   Output commands to run in main terminal:
+
+   # Cleanup worktree (run from main repo):
+   cd /Users/benigeri/Projects/productivity-system
+   git worktree remove ../worktrees/session-workflow
+   rm -rf ../worktrees/session-workflow

  Step 6: Session summary
```

---

### 4. Branch Naming Convention

Document in CLAUDE.md:

```
feature/{bead-id}-{kebab-case-description}
fix/{bead-id}-{kebab-case-description}
chore/{bead-id}-{kebab-case-description}

Examples:
  feature/ps-40-session-workflow
  fix/ps-35-braintrust-config
```

This enables auto-detection of bead-PR matches.

---

## Implementation Order

1. **Create `/health` command** at `~/.claude/commands/health.md`
2. **Update `/start`** at `~/.claude/commands/start.md`
3. **Update `/end`** at `~/.claude/commands/end.md`
4. **Update templates** in `productiviy-system/claude-config-templates/`
5. **Sync to deep-research-archive** - copy relevant sections

---

## Verification

After implementation:

1. Run `/health` - should show current state accurately
2. Run `/start` - should warn about unpushed commits if any
3. Create test worktree via `/start --worktree test-feature`
4. Verify worktree created at `../worktrees/test-feature/` (feature name, no bead ID)
5. Verify SESSION_CONTEXT.md created with bead IDs listed
6. Verify output includes `claude --dangerously-skip-permissions`
7. Run `/end` in worktree - should offer cleanup commands
8. Verify branch naming convention documented in templates

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| /health standalone or in /start? | Standalone only |
| Multiple in_progress beads? | Warn, don't block |
| Unpushed commits check where? | Both /start and /end |
| Worktree location? | ../worktrees/ (sibling to repo) |
| Worktree naming? | Feature name only (no bead IDs) |
| Multi-bead in same worktree? | Yes, if related - SESSION_CONTEXT.md lists all |
| Context handoff? | SESSION_CONTEXT.md file in worktree |
| Solo mode? | Yes, use `--dangerously-skip-permissions` |
