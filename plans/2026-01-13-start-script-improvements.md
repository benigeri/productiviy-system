# /start Script Improvements Plan

Comprehensive plan based on:
1. Session log analysis (dra-37 error)
2. JSONL-only beads mode issues
3. Command development best practices from `plugin-dev` skill

---

## Issue 1: Bead Not Found in Worktree

**Error observed:**
```
The bead dra-37 mentioned in SESSION_CONTEXT.md doesn't exist in the current beads list.
```

**Root cause:** Worktree created from `origin/main` has older `.beads/issues.jsonl` than local main. Bead created after worktree setup doesn't exist in worktree.

**Timeline:**
1. `/start` creates worktree from `origin/main`
2. `/start` creates bead in main repo
3. `/start` writes SESSION_CONTEXT.md referencing bead
4. User opens worktree → bead not found

**Fixes:**
| Fix | Description | Priority |
|-----|-------------|----------|
| Validate bead existence | Check bead exists before using SESSION_CONTEXT.md | P0 |
| Use local main | `git worktree add ... main` not `origin/main` | P0 |
| Create bead in worktree | Run `bd create` from worktree context | P1 |
| Copy beads to worktree | `cp .beads/issues.jsonl $WORKTREE/.beads/` | P2 |

---

## Issue 2: `bd sync` Doesn't Work in JSONL-Only Mode

**Problem:** We always use JSONL-only mode (`no-db: true`), but:
- `bd prime` outputs `bd sync` instructions
- `bd sync` fails: "this project uses JSONL-only mode"
- Even `bd sync --flush-only` fails (nothing to flush from)

**Root cause:** `bd prime` doesn't detect JSONL-only mode and outputs unusable instructions.

**Current `bd prime` output:**
```
# SESSION CLOSE PROTOCOL
[ ] bd sync                 (commit beads changes)
```

**What it should output for JSONL-only:**
```
# SESSION CLOSE PROTOCOL
[ ] git add .beads/
[ ] git commit (include .beads/ with your changes)
```

**Fixes:**
| Fix | Description | Priority |
|-----|-------------|----------|
| Update bd prime | Detect `no-db: true` and skip `bd sync` instructions | P0 (beads CLI) |
| Update /end command | Don't reference `bd sync`, just commit .beads/ | P0 |
| Update CLAUDE.md | Remove any `bd sync` references | P1 |

---

## Issue 3: Command Structure Missing Best Practices

Based on [plugin-dev command-development skill](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/plugin-dev):

### Missing YAML Frontmatter

**Current:** No frontmatter
**Should have:**
```yaml
---
description: Begin work session with context and workflow selection
allowed-tools: Bash, Read, Write, AskUserQuestion
---
```

### Missing Argument Support

**Current:** No argument handling
**Could support:**
```yaml
---
argument-hint: [workflow-type]
---
```

Usage: `/start resume` or `/start worktree` to skip prompts

### No Bead Validation

**Current:** Reads SESSION_CONTEXT.md blindly
**Should:** Validate bead exists before continuing

```markdown
### Step 2: Check for SESSION_CONTEXT.md

If `SESSION_CONTEXT.md` exists:
1. Read contents
2. Extract bead ID: `grep "Bead(s):" SESSION_CONTEXT.md`
3. **Validate bead exists:** `bd show <bead-id>`
4. If not found → offer options:
   - Create the bead now
   - Continue without tracking
   - Ignore SESSION_CONTEXT.md
```

---

## Implementation Plan

### Phase 1: Critical Fixes (P0)

1. **Fix worktree creation source**
   ```bash
   # Before
   git worktree add "$WORKTREE_DIR" -b feature/<name> origin/main

   # After
   git checkout main && git pull
   git worktree add "$WORKTREE_DIR" -b feature/<name> main
   ```

2. **Add bead validation in /start**
   ```markdown
   ### Step 2: Check for SESSION_CONTEXT.md

   If exists, validate bead:
   - Extract bead ID from file
   - Run `bd show <bead-id>` to verify exists
   - If not found, ask user what to do
   ```

3. **Update /end to not use bd sync**
   - Replace `bd sync` with `git add .beads/ && git commit`
   - JSONL-only mode auto-saves, just needs git commit

### Phase 2: Best Practices (P1)

4. **Add frontmatter to commands**
   ```yaml
   ---
   description: Begin work session with context and workflow selection
   allowed-tools: Bash, Read, Write, AskUserQuestion
   ---
   ```

5. **Add argument support**
   - `/start` - interactive (current behavior)
   - `/start resume` - skip to resume existing work
   - `/start new` - skip to new feature
   - `/start worktree` - skip to worktree creation

6. **Create bead in worktree context**
   - After worktree created, tell user to run `bd create` in worktree
   - Or output instructions to copy bead creation

### Phase 3: Cleanup (P2)

7. **Update CLAUDE.md and templates**
   - Remove all `bd sync` references
   - Document JSONL-only workflow: just commit `.beads/`

8. **File beads CLI bug**
   - `bd prime` should detect `no-db: true`
   - Output git-based workflow instead of `bd sync`

---

## Updated /start Command

```yaml
---
description: Begin work session with context and workflow selection
allowed-tools: Bash, Read, Write, AskUserQuestion
argument-hint: [resume|new|worktree|quick]
---

# /start - Session Kickoff

## Quick Start (if argument provided)

If `$ARGUMENTS` is provided:
- `resume` → Skip to "Resume existing work" path
- `new` → Skip to "Start new feature" path
- `worktree` → Skip to "Start new feature (worktree)" path
- `quick` → Skip to "Quick fix" path

Otherwise, proceed with interactive flow...
```

### Key Changes to Worktree Flow

```markdown
#### If "Start new feature (worktree)":

1. Ask for feature name and description
2. **Commit any pending beads changes:**
   ```bash
   if [ -n "$(git status --porcelain .beads/)" ]; then
     git add .beads/
     git commit -m "Sync beads before worktree"
   fi
   ```
3. **Create worktree from LOCAL main (not origin):**
   ```bash
   git checkout main && git pull
   git worktree add "$WORKTREE_DIR" -b feature/<name> main
   ```
4. **Create bead in worktree:**
   ```bash
   cd "$WORKTREE_DIR"
   bd create "<description>" --type feature --priority 1
   bd update <bead-id> --status in_progress
   ```
5. Write SESSION_CONTEXT.md in worktree
6. Output instructions to open new terminal in worktree
```

### Key Changes to SESSION_CONTEXT.md Handling

```markdown
### Step 2: Check for SESSION_CONTEXT.md

If exists:
1. Read contents
2. Extract bead ID
3. **Validate bead exists:**
   ```bash
   BEAD_ID=$(grep "Bead(s):" SESSION_CONTEXT.md | sed 's/.*: //')
   if ! bd show "$BEAD_ID" &>/dev/null; then
     # Bead not found - ask user
   fi
   ```
4. If valid, ask "Continue with this context?"
5. If not valid, offer:
   - Create bead now
   - Continue without tracking
   - Start fresh (ignore SESSION_CONTEXT.md)
```

---

## Testing Checklist

After implementation:
- [ ] Create worktree → bead exists in worktree's .beads/
- [ ] Run `/start` in worktree → SESSION_CONTEXT.md bead found
- [ ] Missing bead → graceful error with recovery options
- [ ] `/start resume` skips to resume flow
- [ ] `/end` works without `bd sync` errors
- [ ] JSONL-only mode: changes saved by committing .beads/

---

## Summary

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Bead not found in worktree | Worktree from `origin/main` has old beads | Use local `main`, validate beads |
| `bd sync` errors | JSONL-only mode incompatible | Remove `bd sync`, just git commit |
| No argument support | Missing frontmatter | Add YAML frontmatter with args |
| No bead validation | Blind trust of SESSION_CONTEXT.md | Validate before using |
