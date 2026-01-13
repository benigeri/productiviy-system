# /start - Session Kickoff

Begin every work session with this command to establish context and choose your workflow.

## Instructions

### Step 1: Show Current State

Run these commands and display the results:

```bash
# Git state
git status --short --branch

# Check for unpushed commits
UNPUSHED=$(git log @{u}.. --oneline 2>/dev/null | wc -l | tr -d ' ')

# Check if in worktree
IS_WORKTREE=$(git rev-parse --git-dir 2>/dev/null | grep -q "worktrees" && echo "yes" || echo "no")

# Beads health (skip if no .beads/ directory)
if [ -d ".beads" ]; then
  bd doctor 2>/dev/null | tail -5
  bd list --status=in_progress 2>/dev/null
fi
```

Present a clean summary:
```
Current State:
- Branch: <branch-name> (<clean/dirty>) <(in worktree)?>
- Unpushed commits: <count> <-- warn if > 0
- Beads: <health status or "not configured">
- Active work: <list of in_progress beads or "none">
```

**Warnings to display:**
- If unpushed commits > 0: `[!] You have <N> unpushed commits - consider pushing`
- If multiple in_progress beads: `[!] Multiple beads in progress - finish one before starting another`

### Step 2: Check for SESSION_CONTEXT.md

If `SESSION_CONTEXT.md` exists in current directory:

```bash
if [ -f "SESSION_CONTEXT.md" ]; then
  cat SESSION_CONTEXT.md
fi
```

Display:
```
Continuing from previous session setup...
<contents of SESSION_CONTEXT.md>
```

Then ask: "Continue with this context?" (Yes/No)
- If Yes: Skip to Step 5 with context loaded
- If No: Proceed to Step 3

### Step 3: Ask What You're Doing

Use AskUserQuestion with these options:

**Question:** "What are you working on this session?"

**Options:**
1. **Resume existing work** - Continue an in_progress bead
2. **Start new feature** - Create new branch/bead
3. **Start new feature (worktree)** - Isolated worktree for parallel work
4. **Quick fix** - Small change on current branch, no ceremony

### Step 4: Handle Each Path

#### If "Resume existing work":
- Show list of in_progress beads with `bd list --status=in_progress`
- Ask which one to continue
- Display bead details with `bd show <bead-id>`
- Confirm the context and continue

#### If "Start new feature":
- Ask for feature description
- Create feature branch from main: `git checkout main && git pull && git checkout -b feature/<bead-id>-<kebab-case-name>`
- Create bead: `bd create "<description>" --type feature --priority 1`
- Mark in progress: `bd update <bead-id> --status in_progress`

#### If "Start new feature (worktree)":
1. Ask for feature name (kebab-case, e.g., `session-workflow`)
2. Ask for feature description
3. Create worktree and branch:
   ```bash
   # Get repo root and parent directory
   REPO_ROOT=$(git rev-parse --show-toplevel)
   REPO_NAME=$(basename "$REPO_ROOT")
   WORKTREE_DIR="$(dirname "$REPO_ROOT")/worktrees/<feature-name>"

   # Create worktree with new branch
   git fetch origin main
   git worktree add "$WORKTREE_DIR" -b feature/<feature-name> origin/main
   ```
4. Create bead: `bd create "<description>" --type feature --priority 1`
5. Mark in progress: `bd update <bead-id> --status in_progress`
6. Write SESSION_CONTEXT.md in worktree:
   ```bash
   cat > "$WORKTREE_DIR/SESSION_CONTEXT.md" << 'EOF'
   # Session Context

   **Feature:** <feature-name>
   **Bead(s):** <bead-id>
   **Created:** <date>

   ## Requirements
   <feature description>

   ## Notes
   <any additional context>
   EOF
   ```
7. Output instructions:
   ```
   Worktree created: <worktree-path>
   Bead: <bead-id>
   SESSION_CONTEXT.md written

   To start working, open a new terminal and run:
   cd <worktree-path> && claude --dangerously-skip-permissions
   ```

#### If "Quick fix":
- Stay on current branch (or create fix branch if on main)
- Optionally create a task bead for tracking
- Skip worktree setup

### Step 5: Output Session Summary

```
Session started:
- Branch: <branch-name>
- Bead: <bead-id> (<status>) or "none"
- Worktree: <path> or "N/A"

Ready to work!
```

### Status Icons

- `[ok]` - No action needed
- `[!]` - Warning, should address
- `[!!]` - Critical, address before continuing

### Example Output

```
SESSION START

Current State:
  Branch: feature/ps-40-session-workflow (in worktree)
  [ok] Uncommitted changes: 0
  [!]  Unpushed commits: 2
  [ok] In-progress beads: 1
       - ps-40: Session workflow improvements

Continuing from previous session setup...
(SESSION_CONTEXT.md contents displayed)

Session started:
- Branch: feature/ps-40-session-workflow
- Bead: ps-40 (in_progress)
- Worktree: /Users/user/Projects/worktrees/session-workflow

Ready to work!
```

## Notes

- If `.beads/` directory doesn't exist, skip all beads commands gracefully
- If user is already on a feature branch with in_progress bead, offer to just continue
- Keep the interaction fast - don't over-prompt
- Branch naming convention: `feature/{bead-id}-{kebab-case-description}` or `feature/{feature-name}` for worktrees
- Worktree location: `../worktrees/<feature-name>/` (sibling to repo)
- Multiple related beads can share the same worktree - list all in SESSION_CONTEXT.md
