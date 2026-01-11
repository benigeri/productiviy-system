# Final Implementation Plan - Claude Code Workflow Standardization

**Date:** 2026-01-10
**Type:** Cross-repo standardization project
**Status:** Ready to Execute

---

## How We'll Work Together

This is a **cross-repo standardization project** where we'll update 4 repos to use consistent Claude Code workflows, beads prefixes, and documentation.

**Workflow Per Phase:**
1. **Create branch** - `feature/standardize-workflows` in target repo
2. **Make changes** - Follow phase checklist
3. **Commit** - Clear commit message
4. **Push** - Push branch to remote
5. **Human review** - User reviews PR diff
6. **Merge** - User merges PR
7. **Mark ✅ DONE** - Update tracker in this plan
8. **Next phase** - Move to next repo

**Why phased?** Each repo is independent. If something goes wrong, we catch it early before affecting other repos.

**Resuming Sessions:** If session ends mid-phase:
- Read this plan to see current phase status in Progress Tracker
- Check which tasks are incomplete
- Continue from where we left off

---

## Progress Tracker

| Phase | Repo | Status | Tasks |
|-------|------|--------|-------|
| **Phase 1** | productiviy-system | ✅ DONE | Create templates folder |
| **Phase 2** | deep-research-archive | ✅ DONE | Beads migration + CLAUDE.md update |
| **Phase 3** | productiviy-system | ⏳ NOT STARTED | Beads migration + CLAUDE.md update |
| **Phase 4** | recruiting-docs | ⏳ NOT STARTED | Init beads + hooks + CLAUDE.md |
| **Phase 5** | product-marketing-bot | ⏳ NOT STARTED | Beads migration + hooks + CLAUDE.md |
| **Phase 6** | All repos | ⏳ NOT STARTED | Final verification & testing |

**Legend:**
- ⏳ NOT STARTED
- 🔄 IN PROGRESS
- ✅ DONE

---

## Key Decisions

### Template Location
✅ Create `claude-config-templates/` folder in productiviy-system
- Not used as reference, just documentation
- Lives in productiviy-system but separate from actual CLAUDE.md
- Easy to find when needed

### New Standard Sections
✅ Git Safety Guidelines (filtered for agentic workflow)
✅ Critical Thinking Guidelines
✅ Frontend Development Guidelines (all repos - most have UI)

### Beads Prefixes (No Dash)
- productiviy-system: `ps`
- deep-research-archive: `dra`
- product-marketing-bot: `pmb`
- recruiting-docs: `rd`

### ⚠️ CRITICAL: CLAUDE.md Update Strategy

**DO NOT delete existing repo-specific content!**

When updating CLAUDE.md:

1. **Template sections go at TOP** (Core Principles through Example Workflows)
2. **ALL original repo-specific content stays at BOTTOM**
3. **Never delete sections** - only add template sections if missing

**Correct approach:**
```bash
# 1. Extract template sections (lines 1-432 from template)
# 2. Append ALL original repo-specific sections from old CLAUDE.md
# 3. Update prefix references (e.g., productiviy-system- → ps)
# 4. Keep everything else intact
```

**What to preserve:**
- Quick Links
- Project Overview
- Detailed Development Workflows (repo-specific epic info)
- Detailed Testing sections
- Project Status
- Phase/QA Results
- Commands Reference
- Environment Variables (detailed setup instructions)
- Contributing sections
- Cost Estimates
- Support sections
- Any other repo-specific documentation

**Example structure:**
```markdown
# Repo Name - Agent Development Guidelines

## Core Principles (template)
## Git Safety Guidelines (template)
...
## Example Workflows (template)

---

## [REPO-SPECIFIC SECTIONS BELOW]

## Quick Links (original content)
## Project Overview (original content)
## Development Workflow (original content with epic details)
... (all other original sections)
```

---

## Complete Standard CLAUDE.md Template

```markdown
# [Repo Name] - Agent Development Guidelines

This document defines how AI agents should work on this codebase.

---

## Core Principles

1. **Never commit directly to `main`** - All changes go through pull requests
2. **Test-Driven Development** - Write tests before implementation
3. **Track progress with Beads** - Use `bd` commands for issue tracking across sessions
4. **Small, focused PRs** - One feature/fix per PR for easy review
5. **Verify before closing** - Always test/verify your work before marking a bead complete
6. **Never use `cd` commands** - Always use absolute paths to avoid breaking the shell session

---

## Git Safety Guidelines

**Safe Operations:**
- git status/diff/log are always safe - use freely for understanding state
- Destructive operations (reset --hard, clean -fd, force push) require explicit user request

**Commit Practices:**
- Never amend commits unless explicitly asked
- Check git status/diff before making edits (other agents may have changed files)
- For large diffs: Use `git --no-pager diff --color=never` for review

**Agentic Workflow:**
- Create feature branches as part of workflow (Feature Development steps)
- Commit and push as part of completing work
- Small, focused commits over large batches

---

## Critical Thinking Guidelines

**Problem Solving:**
- Fix root cause, not band-aids
- If unsure: read more code; if still stuck, ask user with short, clear options
- When conflicts arise: call out the issue and pick the safer path

**Multi-Agent Workflows:**
- Check git status/diff before editing (other agents may have changed changes)
- If you see unrecognized changes: assume another agent made them, keep going, focus on your changes
- If unrecognized changes cause issues: stop and ask user
- Leave breadcrumb notes in conversation thread for context

---

## Feature Development Workflow

**See `BEADS-WORKFLOW.md` for the complete guide.**

### For Every Feature or Fix:

1. **Find or create work in Beads:**
   ```bash
   bd ready                          # Check for existing work
   # OR create new work:
   bd create "Add feature X" --type feature --priority 1
   ```

2. **Create a feature branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feature/short-description
   ```

3. **Mark Bead as in-progress:**
   ```bash
   bd update <bead-id> --status in_progress
   ```

4. **Follow TDD** (see Test-Driven Development section below):
   - Write failing test (Red)
   - Write code to pass test (Green)
   - Refactor while keeping tests green

5. **Test locally** - CRITICAL: Always verify your changes work before pushing:
   - For web apps: Start dev server, open in browser, test all modified functionality
   - For APIs: Use curl/Postman to test endpoints
   - For CLI tools: Run the command with various inputs
   - For libraries: Run the test suite
   - **NEVER skip this step** - broken code wastes everyone's time

6. **Commit with clear messages:**
   ```bash
   git commit -m "Brief description of change"
   ```

7. **Push and create PR:**
   ```bash
   git push -u origin feature/short-description
   ```
   Then create PR with summary of changes.

8. **Run code review** - Use compound engineering review agents to catch issues

9. **Wait for review** - User will review diff and approve

10. **After merge**, switch back to main and close Bead:
    ```bash
    git checkout main && git pull
    bd close <bead-id> --reason "What you implemented and verified"
    bd sync
    ```

---

## Test-Driven Development (TDD)

**For EVERY new feature or fix:**

1. **Write test first (Red)**
   - Create test file: `tests/unit/my-feature.test.ts`
   - Write test that defines expected behavior
   - Run test - should fail

2. **Run test (should fail)**
   ```bash
   [test command for repo]
   ```

3. **Write implementation (Green)**
   - Create implementation: `src/lib/my-feature.ts`
   - Write minimal code to pass test

4. **Run test (should pass)**
   ```bash
   [test command for repo]
   ```

5. **Refactor while tests pass**
   - Clean up code
   - Keep tests green

6. **Run full test suite**
   ```bash
   [test command for repo]
   ```

---

## Creating Plans (MANDATORY)

**When you create a plan using plan mode or compound engineering:**

### 1. Save Plan to Repo
```bash
# Save to plans/ directory with timestamp
cat > plans/2026-01-10-feature-name.md << 'EOF'
[paste full plan here]
EOF

git add plans/2026-01-10-feature-name.md
git commit -m "Add plan for feature name"
git push
```

### 2. Create Epic with FULL Plan in Description
```bash
bd create "Feature Name" --type epic --priority 1 \
  --description "$(cat plans/2026-01-10-feature-name.md)"
```

**Why both?**
- **Plan file in git**: Versioned, never lost, easy to reference
- **Epic description**: Single source of truth in Beads, visible in `bd show <epic-id>`
- Created together = no drift between plan and tracking

### 3. Create Child Beads and Link to Epic
```bash
# Break down plan into tasks
bd create "Task 1: Setup infrastructure" --priority 1
bd create "Task 2: Implement core logic" --priority 1
bd create "Task 3: Add tests" --priority 1

# Link each task to epic (task blocks epic)
bd dep add <task1-id> <epic-id>
bd dep add <task2-id> <epic-id>
bd dep add <task3-id> <epic-id>

# Sync everything
bd sync
```

---

## Epic Workflow (Big Features with 3+ Tasks)

**Use this pattern for any feature with multiple related tasks:**

### 1. Create Plan (see above)
- Save to `plans/2026-01-10-feature-name.md`
- Create Epic with full plan in description

### 2. Break Down Into Tasks
```bash
bd create "Task 1" --priority 1
bd create "Task 2" --priority 1
bd create "Task 3" --priority 1
```

### 3. Link Tasks to Epic
```bash
bd dep add <task-id> <epic-id>  # Each task blocks the epic
```

### 4. Work Through Tasks
```bash
bd ready                          # Shows unblocked tasks
bd update <task-id> --status in_progress
# ... do the work following Feature Development Workflow ...
bd close <task-id> --reason "What you did"
bd sync
```

### 5. Track Progress
```bash
bd epic status                    # See completion status
```

### 6. Close Epic When All Tasks Done
```bash
bd ready                          # Epic appears when all tasks closed
bd close <epic-id> --reason "All features implemented and tested"
bd sync
```

---

## Before Clearing Context / Compacting

**When you run `/clear` or context gets compacted, ensure:**

```bash
# Check for work
git status                        # Uncommitted changes?
bd list --status in_progress      # Active beads?

# Sync everything
bd sync                           # Commit beads changes
git add .                         # Stage changes
git commit -m "..."               # Commit code
bd sync                           # Sync beads again (if new beads created)
git push                          # Push to remote

# Verify
git status                        # Should be clean
bd sync --status                  # Should be synced
```

**Work is not saved until pushed.**

---

## Pre-commit Checks

Before every commit, ensure:

```bash
[repo-specific test command]      # Tests pass
[repo-specific lint command]      # Linting passes
[repo-specific format command]    # Formatting correct
```

---

## Claude Code Hooks (Enforcement)

This project uses Claude Code hooks to **enforce** the workflow rules automatically.

### What's Enforced:

| Rule | Enforcement |
|------|-------------|
| No direct commits to `main` | ❌ Blocked automatically |
| Tests must pass before commit | ❌ Blocked if tests fail |
| Linting must pass | ❌ Blocked if lint fails |

### How It Works:

Hooks are configured in `.claude/settings.json` and run automatically when Claude Code executes git commands.

**Location:** `.claude/hooks/pre-commit-checks.py`

### Hook Triggers:
- `git commit` → Runs tests + lint, blocks if on main
- `git push origin main` → Blocked (use PRs instead)

### Bypassing (Emergency Only):
If you absolutely need to bypass hooks, the user can manually run git commands outside Claude Code. But this should be rare.

---

## Shell Commands (Critical)

**NEVER use `cd` in bash commands.** The shell session persists between commands, and changing directories breaks Claude Code hooks which expect to run from the project root.

### Bad:
```bash
cd supabase/functions/telegram-webhook && deno test
```

### Good:
```bash
deno test /Users/benigeri/Projects/[repo]/path/to/test.ts
```

### If the shell breaks:
The Claude Code shell session persists state. If you accidentally used `cd`, the session is corrupted and hooks will fail. Recovery options:
1. **Best**: Ask user to restart Claude Code session (clears shell state)
2. **Quick fix**: User can run `/clear` to reset the conversation

### Hook Configuration (Robustness):
The hook in `.claude/settings.json` must use `$CLAUDE_PROJECT_DIR` for the script path to work regardless of cwd:
```json
"command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-commit-checks.py\""
```
Never use relative paths like `.claude/hooks/...` - they break when cwd changes.

---

## Frontend Development Guidelines

**Avoid "AI slop" UI - Be opinionated and distinctive.**

### Do:
- **Typography:** Pick a real font; avoid Inter/Roboto/Arial/system defaults
- **Theme:** Commit to a palette; use CSS variables; bold accents over timid gradients
- **Motion:** 1-2 high-impact moments (staggered reveal beats random micro-animations)
- **Background:** Add depth (gradients/patterns), not flat defaults

### Avoid:
- Purple-on-white clichés
- Generic component grids
- Predictable layouts
- Default system fonts
- Timid design choices

**Be bold. Be distinctive. Ship interfaces that feel intentional.**

---

## PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- List of specific changes made

## Test plan
- [ ] How to verify this works

## Related
- Links to relevant issues/docs
```

---

## Example Workflows

### Example 1: Add New Feature

```
User: "Add voice transcription support"

Agent:
1. bd create "Add Deepgram voice transcription" --type feature --priority 1
   # Creates bead: [prefix]abc
2. git checkout -b feature/voice-transcription
3. bd update [prefix]abc --status in_progress
4. Write deepgram.test.ts with test cases
5. Run tests → confirm they fail (Red)
6. Implement deepgram.ts
7. Run tests → confirm they pass (Green)
8. Refactor if needed
9. **Verify**: Test the integration works (e.g., curl the API, check responses)
10. git commit -m "Add Deepgram voice transcription"
11. git push -u origin feature/voice-transcription
12. Create PR with summary
13. Wait for user to review and merge
14. git checkout main && git pull
15. bd close [prefix]abc --reason "Implemented Deepgram transcription with tests"
16. bd sync
```

### Example 2: Work on Existing Bead

```
User: "Continue work on the email workflow epic"

Agent:
1. bd ready                       # See available tasks
2. bd show [prefix]def            # Review task details
3. git checkout -b feature/email-workflow-feedback
4. bd update [prefix]def --status in_progress
5. Follow TDD to implement the feature
6. **Verify**: Test locally
7. git commit and push
8. Create PR, wait for merge
9. git checkout main && git pull
10. bd close [prefix]def --reason "Added feedback loop UI with state management"
11. bd sync
```

### Example 3: Setup Task

```
User: "Set up [service] project"

Agent:
1. bd create "Setup [service] project" --type task --priority 0
   # Creates bead: [prefix]xyz
2. bd update [prefix]xyz --status in_progress
3. Guide user through setup
4. Store credentials in .env
5. **Verify**: Test the connection works
6. git commit -m "Add [service] configuration"
7. Only after verification succeeds:
   bd close [prefix]xyz --reason "[Service] configured and verified"
   bd sync
```

---

## [REPO-SPECIFIC SECTIONS BELOW]

[Each repo adds its own sections here]
```

---

## Phase 1: Create Templates Folder (productiviy-system)

**Goal:** Set up documentation templates for future reference

### Tasks
- [ ] Create `claude-config-templates/` directory
- [ ] Create `CLAUDE-TEMPLATE.md` (full template above)
- [ ] Create `README.md` (explains what templates are for)
- [ ] Copy `BEADS-WORKFLOW.md` from productiviy-system root
- [ ] Commit and push

### Commands
```bash
cd /Users/benigeri/Projects/productiviy-system
mkdir -p claude-config-templates
# Create files (I'll do this)
git add claude-config-templates/
git commit -m "Add Claude Code configuration templates"
git push
```

### Double-Check
- [ ] Verify all 3 files created
- [ ] Verify files have correct content
- [ ] Verify committed to git
- [ ] Verify pushed to remote

**Time:** 15-20 minutes

---

## Phase 2: deep-research-archive

**Goal:** Migrate beads prefix + merge AGENT_GUIDELINES.md into CLAUDE.md

### Tasks
- [ ] Backup `.beads/` directory
- [ ] Update `config.yaml`: Set `issue-prefix: "dra"`
- [ ] Edit `issues.jsonl`: Replace `deep-research-archive-` with `dra`
- [ ] Delete `beads.db` (will regenerate)
- [ ] Run `bd list` to regenerate database
- [ ] Read `AGENT_GUIDELINES.md` content
- [ ] Merge sections into `CLAUDE.md`
- [ ] Delete `AGENT_GUIDELINES.md` file
- [ ] Add new sections to `CLAUDE.md`:
  - [ ] Git Safety Guidelines
  - [ ] Critical Thinking Guidelines
  - [ ] Frontend Development Guidelines
  - [ ] Shell Commands (Critical)
  - [ ] Before Clearing Context
  - [ ] 3 Example Workflows
- [ ] Update Core Principles to 6 items
- [ ] Update all examples: `deep-research-archive-` → `dra`
- [ ] Run `bd sync`

### Double-Check
- [ ] `bd list --status=open` shows new `dra` prefixes
- [ ] `bd show dra123` works (pick any ID)
- [ ] AGENT_GUIDELINES.md is deleted
- [ ] CLAUDE.md has all new sections
- [ ] All examples use `dra` prefix
- [ ] Hook still blocks main commits (test it)
- [ ] Changes committed and pushed

**Time:** 2-3 hours

---

## Phase 3: productiviy-system

**Goal:** Migrate beads prefix + add new CLAUDE.md sections

### Tasks
- [ ] Backup `.beads/` directory
- [ ] Update `config.yaml`: Set `issue-prefix: "ps"`, uncomment `sync-branch`
- [ ] Edit `issues.jsonl`: Replace `productiviy-system-` with `ps`
- [ ] Delete `beads.db`
- [ ] Run `bd list` to regenerate
- [ ] Add new sections to `CLAUDE.md`:
  - [ ] Git Safety Guidelines
  - [ ] Critical Thinking Guidelines (if not present)
  - [ ] Frontend Development Guidelines
- [ ] Update: "Session Close Protocol" → "Before Clearing Context"
- [ ] Update all examples: `productiviy-system-` → `ps`
- [ ] Verify 6 core principles present
- [ ] Run `bd sync`

### Double-Check
- [ ] `bd list --status=open` shows new `ps` prefixes
- [ ] `bd show ps123` works
- [ ] CLAUDE.md has all new sections
- [ ] All examples use `ps` prefix
- [ ] Hook still works
- [ ] Changes committed and pushed

**Time:** 1-2 hours

---

## Phase 4: recruiting-docs

**Goal:** Initialize beads + add hooks + standardize CLAUDE.md

### Tasks
- [ ] Run `bd init`
- [ ] Create `config.yaml`: Set `issue-prefix: "rd"`, `sync-branch: "beads-sync"`
- [ ] Create `.claude/hooks/` directory
- [ ] Create `pre-commit-checks.py` (Python hook)
- [ ] Create/update `settings.json` with hook config
- [ ] Rewrite `CLAUDE.md` with all standard sections:
  - [ ] 6 Core Principles
  - [ ] Git Safety Guidelines
  - [ ] Critical Thinking Guidelines
  - [ ] Feature Development Workflow
  - [ ] TDD (COMMENTED OUT: "Docs repo - no tests")
  - [ ] Creating Plans
  - [ ] Epic Workflow
  - [ ] Before Clearing Context
  - [ ] Pre-commit Checks
  - [ ] Hooks Documentation
  - [ ] Shell Commands (Critical)
  - [ ] Frontend Development Guidelines
  - [ ] PR Template
  - [ ] 3 Example Workflows (docs-adapted)
- [ ] Keep repo-specific sections (VitePress, commands, etc.)
- [ ] Delete `scripts/pre-commit-hook.sh`
- [ ] Run `bd sync`

### Double-Check
- [ ] `bd list` works (shows empty or initial issues)
- [ ] Hook blocks main commits (test it)
- [ ] Homepage generation works in hook
- [ ] CLAUDE.md has all standard sections
- [ ] TDD section is commented out
- [ ] Old bash hook is deleted
- [ ] Changes committed and pushed

**Time:** 3-4 hours

---

## Phase 5: product-marketing-bot

**Goal:** Migrate beads + add minimal hook + standardize CLAUDE.md

### Tasks
- [ ] Check: `bd list` (see current state)
- [ ] Update `config.yaml`: Set `issue-prefix: "pmb"`
- [ ] Migrate existing issues if any
- [ ] Create `.claude/hooks/` directory
- [ ] Create `pre-commit-checks.py` (minimal - main-blocking only)
- [ ] Create/update `settings.json` with hook config
- [ ] Rewrite `CLAUDE.md` with all standard sections:
  - [ ] 6 Core Principles
  - [ ] Git Safety Guidelines
  - [ ] Critical Thinking Guidelines
  - [ ] Feature Development Workflow
  - [ ] Detailed TDD
  - [ ] Creating Plans
  - [ ] Epic Workflow
  - [ ] Before Clearing Context
  - [ ] Pre-commit Checks
  - [ ] Hooks Documentation
  - [ ] Shell Commands (Critical)
  - [ ] Frontend Development Guidelines
  - [ ] PR Template
  - [ ] 3 Example Workflows (bot-adapted)
- [ ] Keep repo-specific sections (GitHub token, Slack, etc.)
- [ ] Run `bd sync`

### Double-Check
- [ ] `bd list` shows `pmb` prefixes
- [ ] Hook blocks main commits (test it)
- [ ] CLAUDE.md has all standard sections
- [ ] All examples use `pmb` prefix
- [ ] Changes committed and pushed

**Time:** 3-4 hours

---

## Phase 6: Final Verification

**Goal:** Test all repos work correctly with new setup

### Tasks (For Each Repo)
- [ ] **productiviy-system:**
  - [ ] `bd list --status=open` works, shows `ps` prefixes
  - [ ] Create test bead, verify prefix is `ps`
  - [ ] Test hook blocks main commit
  - [ ] Delete test bead

- [ ] **deep-research-archive:**
  - [ ] `bd list --status=open` works, shows `dra` prefixes
  - [ ] Create test bead, verify prefix is `dra`
  - [ ] Test hook blocks main commit
  - [ ] AGENT_GUIDELINES.md is gone
  - [ ] Delete test bead

- [ ] **recruiting-docs:**
  - [ ] `bd list` works
  - [ ] Create test bead, verify prefix is `rd`
  - [ ] Test hook blocks main commit
  - [ ] Test homepage generation works
  - [ ] Delete test bead

- [ ] **product-marketing-bot:**
  - [ ] `bd list` works, shows `pmb` prefixes
  - [ ] Create test bead, verify prefix is `pmb`
  - [ ] Test hook blocks main commit
  - [ ] Delete test bead

### Double-Check
- [ ] All 4 repos have beads configured
- [ ] All 4 repos have short prefixes
- [ ] All 4 repos have hooks working
- [ ] All 4 repos have standardized CLAUDE.md
- [ ] Templates folder exists in productiviy-system

**Time:** 30-45 minutes

---

## Summary

**Total Phases:** 6
**Total Time:** 9-13 hours
**Repos Affected:** 4

**Deliverables:**
- ✅ Templates folder in productiviy-system
- ✅ 4 repos with standardized CLAUDE.md
- ✅ 4 repos with short beads prefixes
- ✅ All repos with working hooks
- ✅ Cross-repo workflow consistency

---

## Ready to Start Phase 1?

Say **"start"** and I'll begin Phase 1: Creating the templates folder in productiviy-system.

