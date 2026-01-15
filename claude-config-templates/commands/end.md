---
description: Close work session safely - commit changes and verify nothing is lost
allowed-tools: Bash, Read, AskUserQuestion
---

# /end - Session Close

Run this before ending your session to ensure nothing is lost.

**Note:** This project uses JSONL-only beads mode. Beads auto-save to `.beads/issues.jsonl` - just commit with your other changes (no `bd sync` needed).

## Instructions

### Step 1: Check Current State

Run these commands silently and analyze:

```bash
# Check for uncommitted changes
git status --short

# Check for unpushed commits
UNPUSHED=$(git log @{u}.. --oneline 2>/dev/null | wc -l | tr -d ' ')

# Check beads state (skip if no .beads/)
if [ -d ".beads" ]; then
  bd doctor 2>/dev/null | tail -5
  bd list --status=in_progress 2>/dev/null
fi

# Check if in a worktree
IS_WORKTREE=$(git rev-parse --git-dir 2>/dev/null | grep -q "worktrees" && echo "yes" || echo "no")
WORKTREE_PATH=$(git rev-parse --show-toplevel 2>/dev/null)
```

### Step 2: Handle Uncommitted Changes

If there are uncommitted changes:

**Show warning:**
```
WARNING: You have uncommitted changes:
<list of changed files>
```

**Ask:** "What do you want to do with uncommitted changes?"

**Options:**
1. **Commit now** - Stage and commit with a message
2. **Stash** - Save for later with `git stash push -m "WIP: <description>"`
3. **Leave as-is** - Proceed without committing (changes stay in working directory)

If "Commit now" selected:
- Run: `git add .`
- Ask user for commit message
- Run: `git commit -m "<message>"`

### Step 3: Handle Unpushed Commits (BLOCKING)

If there are unpushed commits:

**Show warning:**
```
[!!] BLOCKING: You have <N> unpushed commits.

Commits not pushed:
<list of commit messages>
```

**Ask:** "Push commits before ending session?"

**Options:**
1. **Push now** - Run `git push`
2. **Skip** - Proceed without pushing (work may be lost if branch is deleted)

**Important:** Display strong warning if user chooses to skip:
```
WARNING: Unpushed commits are at risk of being lost.
Branch: <branch-name>
```

### Step 4: Handle In-Progress Beads

If there are in_progress beads:

**Show:**
```
In-progress beads:
<list of beads with their titles>
```

**Ask:** "What do you want to do with bead <bead-id>?"

**Options:**
1. **Mark complete** - Close with `bd close <id> --reason "<summary>"`
2. **Keep in progress** - Leave for next session

### Step 5: Handle Worktree (if applicable)

If session is in a git worktree AND work is complete (bead closed or all pushed):

**Show:**
```
You're in a worktree: <worktree-path>
```

**Ask:** "Remove this worktree? (Branch will be preserved)"

**Options:**
1. **Yes, remove** - Provide cleanup commands
2. **No, keep** - Keep worktree for future sessions

If "Yes, remove" selected:
```
To clean up this worktree, run these commands after closing this session:

# From main repo:
cd <main-repo-path>
git worktree remove <worktree-path>

# Or if worktree has untracked files:
rm -rf <worktree-path>
git worktree prune
```

### Step 6: Output Session Summary

```
SESSION CLOSE

- Commits this session: <count or "0">
- Pushed: <yes/no>
- Uncommitted changes: <count> files (<action taken>)
- Worktree: <kept / cleanup commands provided / N/A>

Safe to close this session.
```

### Status Icons

- `[ok]` - No action needed
- `[!]` - Warning, should address
- `[!!]` - Critical, address before continuing

### Example Output

```
SESSION CLOSE

[ok] Uncommitted changes: 0
[ok] Pushed: yes (2 commits)
[ok] Beads: ps-40 kept in progress

You're in a worktree: /Users/user/Projects/worktrees/session-workflow
Worktree: kept for future sessions

- Commits this session: 2
- Pushed: yes
- Uncommitted changes: 0
- Worktree: kept

Safe to close this session.
```

## Notes

- If `.beads/` doesn't exist, skip beads steps gracefully
- Don't block session end for beads - user can always choose "keep in progress"
- DO block/warn strongly for unpushed commits - this is where work gets lost
- For worktree removal, just provide the command - don't execute it (session needs to close first)
- Keep interaction minimal - one prompt for changes, one for commits, one for beads, done
- Beads auto-save to `.beads/issues.jsonl` - ensure it's committed with your changes
