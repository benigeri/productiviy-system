---
description: Begin work session with context and workflow selection
allowed-tools: Bash, Read, Write, AskUserQuestion, TodoWrite
argument-hint: [resume|new|worktree|quick]
---

# /start - Session Kickoff

Begin every work session with this command to establish context and choose your workflow.

## Quick Start (Argument Shortcuts)

If `$ARGUMENTS` is provided, skip the interactive prompt:
- `resume` → Jump directly to "Resume existing work" path
- `new` → Jump directly to "Start new feature" path
- `worktree` → Jump directly to "Start new feature (worktree)" path
- `quick` → Jump directly to "Quick fix" path

If no argument or unrecognized argument, proceed with interactive flow.

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

**Validate bead exists before continuing:**

```bash
# Extract bead ID(s) from SESSION_CONTEXT.md
BEAD_ID=$(grep "Bead(s):" SESSION_CONTEXT.md | sed 's/.*: //' | tr -d ' ')

# Validate bead exists
if [ -n "$BEAD_ID" ] && [ -d ".beads" ]; then
  if ! bd show "$BEAD_ID" &>/dev/null; then
    # Bead not found - will need to handle
    echo "BEAD_NOT_FOUND"
  fi
fi
```

**If bead exists:** Display contents and ask "Continue with this context?" (Yes/No)
- If Yes: Skip to Step 5 with context loaded
- If No: Proceed to Step 3

**If bead NOT found:** Display warning and offer options:
```
[!] Bead <bead-id> from SESSION_CONTEXT.md not found in .beads/

This can happen when a worktree was created from an older branch.
```

Use AskUserQuestion with options:
1. **Create bead now** - Create the missing bead with info from SESSION_CONTEXT.md
2. **Continue without tracking** - Proceed but skip bead commands
3. **Start fresh** - Ignore SESSION_CONTEXT.md, go to Step 3

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
3. **Commit any pending beads changes first:**
   ```bash
   # Ensure .beads/ changes are committed so worktree gets them
   if [ -d ".beads" ] && [ -n "$(git status --porcelain .beads/)" ]; then
     git add .beads/
     git commit -m "Sync beads before worktree creation"
   fi
   ```
4. **Create worktree from LOCAL main (not origin/main):**
   ```bash
   # Get repo root and parent directory
   REPO_ROOT=$(git rev-parse --show-toplevel)
   REPO_NAME=$(basename "$REPO_ROOT")
   WORKTREE_DIR="$(dirname "$REPO_ROOT")/worktrees/<feature-name>"

   # Update local main, then create worktree from it
   # This ensures worktree has latest .beads/ from local commits
   git checkout main && git pull
   git worktree add "$WORKTREE_DIR" -b feature/<feature-name> main

   # Copy .env files to worktree
   cp "$REPO_ROOT"/.env* "$WORKTREE_DIR/" 2>/dev/null && echo ".env files copied" || true
   ```
5. Create bead: `bd create "<description>" --type feature --priority 1`
6. Mark in progress: `bd update <bead-id> --status in_progress`
7. Write SESSION_CONTEXT.md in worktree:
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
8. **Add to agent-deck and start session:**
   ```bash
   agent-deck add "$WORKTREE_DIR" -t "<feature-name>" -c "claude --dangerously-skip-permissions"
   agent-deck session start "<feature-name>"
   ```

9. Output instructions:
   ```
   Worktree created: <worktree-path>
   Bead: <bead-id>
   SESSION_CONTEXT.md written
   Agent-deck session: <feature-name>

   Session is now running in agent-deck. To attach:
   agent-deck session attach <feature-name>
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
