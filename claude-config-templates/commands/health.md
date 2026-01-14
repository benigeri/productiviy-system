# /health - Repository Health Check

Run anytime to audit git and beads state. Identifies drift, stale branches, and incomplete work.

## Instructions

### Step 1: Gather State

Run these commands silently:

```bash
# Git basics
BRANCH=$(git branch --show-current)
UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')
UNPUSHED=$(git log @{u}.. --oneline 2>/dev/null | wc -l | tr -d ' ')

# Remote branches (after pruning stale refs)
git fetch --prune 2>/dev/null
REMOTE_BRANCHES=$(git branch -r | grep -v HEAD | wc -l | tr -d ' ')

# Check if in worktree
IS_WORKTREE=$(git rev-parse --git-dir 2>/dev/null | grep -q "worktrees" && echo "yes" || echo "no")

# Count active worktrees
WORKTREE_COUNT=$(git worktree list | wc -l | tr -d ' ')

# Beads state (if configured)
if [ -d ".beads" ]; then
  IN_PROGRESS_BEADS=$(bd list --status=in_progress 2>/dev/null)
fi
```

### Step 2: Check for Stale Beads

If beads are configured, cross-reference in_progress beads with merged PRs:

```bash
# Get list of merged PRs in last 14 days
gh pr list --state merged --limit 50 --json number,title,mergedAt,headRefName 2>/dev/null

# For each in_progress bead, check if a matching PR was merged
# Match by: branch name contains bead ID (e.g., feature/ps-40-description)
```

### Step 3: Output Health Report

```
HEALTH CHECK

Git State:
  Branch: <branch-name> <(in worktree)?>
  <status icon> Uncommitted changes: <count>
  <status icon> Unpushed commits: <count>
  <status icon> Remote branches: <count> (recommend < 5 active)
  <status icon> Worktrees: <count> active

Beads:
  <status icon> In-progress: <count>
  <list each in_progress bead on its own line>

  <if stale beads found>
  Potentially stale (PR merged but bead still open):
    - <bead-id>: PR #<number> merged <time> ago - consider closing
  </if>

Recommended Actions:
  <list actionable items based on findings>
```

### Status Icons

- `[ok]` - No action needed
- `[!]` - Warning, should address
- `[!!]` - Critical, address before continuing

### Example Output

```
HEALTH CHECK

Git State:
  Branch: main
  [ok] Uncommitted changes: 0
  [!]  Unpushed commits: 3
  [!]  Remote branches: 12 (recommend < 5 active)
  [ok] Worktrees: 2 active

Beads:
  [!]  In-progress: 2
       - ps-36: Braintrust integration
       - ps-40: Session workflow improvements

  Potentially stale (PR merged but bead still open):
    - ps-35: PR #87 merged 2d ago - consider closing

Recommended Actions:
  - Run `git push` to push 3 commits
  - Run `git branch -r | wc -l` to review branches, delete merged ones
  - Run `bd close ps-35 --reason "..."` if work is complete
```

## Notes

- Always run `git fetch --prune` first to clean stale remote refs
- PR matching uses branch naming convention: `feature/{bead-id}-{description}`
- If `gh` CLI not available, skip the PR cross-reference check
- Keep output scannable - use consistent formatting
