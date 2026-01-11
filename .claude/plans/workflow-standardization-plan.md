# Workflow Standardization & Mode System Plan

**Created:** 2026-01-10 18:19 PST
**Status:** Draft - Awaiting Approval
**Scope:** Multi-repo standardization of Claude Code workflows, hooks, and task tracking

---

## Executive Summary

This plan standardizes workflow across 7 repositories by introducing:
1. **Mode System** - Explicit production/experiment/archive modes per repo
2. **Plugin Architecture** - Shared configs via `.claude-plugin/` directory
3. **Beads Workflow** - Consistent task tracking across active repos
4. **Plan Management** - Timestamped plans with archiving capability
5. **Hook Standardization** - Consistent pre-commit enforcement

**Impact:** Reduces confusion, scales best practices, makes workflow explicit.

---

## Current State Analysis

### Repository Inventory

| Repo | Beads | Hooks | CLAUDE.md | Purpose | Proposed Mode |
|------|-------|-------|-----------|---------|---------------|
| productiviy-system | ✅ Heavy | ✅ Full | ✅ Complete | Active dev | **Production** |
| product-marketing-bot | ✅ Light | ❌ None | ✅ Minimal | Archived | **Archive** |
| deep-research-archive | ❌ None | ✅ Basic | ✅ Complete | Active dev | **Production** |
| recruiting-docs | ❌ None | ✅ Bash | ✅ Complete | Active docs | **Production** |
| product-docs | ❌ None | ❌ None | ✅ Complete | Reference | **Production** |
| temp-docs | ❌ None | ✅ Basic | ✅ Minimal | Testing | **Experiment** |
| Experiments | ❌ None | ❌ None | ❌ None | Ad-hoc | **Experiment** |

### Key Problems Identified

1. **No Explicit Modes** - Claude doesn't know if we're in production or experiment context
2. **Hook Inconsistency** - Only productiviy-system has full enforcement
3. **Beads Gaps** - Only 2/7 repos use Beads; CLAUDE.md conflicts with actual usage
4. **No Plan Management** - Plans not tracked, no timestamps, no archiving
5. **Config Duplication** - Each repo reinvents hooks, settings, workflows

---

## Mode System Design

### Three Modes with Explicit Indicators

#### 1. Production Mode
**Purpose:** High-quality software/documentation with full tracking and enforcement

**Characteristics:**
- ✅ Beads required for all work
- ✅ Pre-commit hooks block bad commits
- ✅ Tests must pass before commit
- ✅ PR workflow enforced
- ✅ Session start must identify active Bead
- ✅ Session close must update Bead status

**Visual Indicator:**
```
🔒 PRODUCTION MODE | Active Bead: productiviy-system-2m4
```

**When to Use:**
- Active development repos (productiviy-system, deep-research-archive)
- Production documentation (product-docs, recruiting-docs)
- Any work that ships to users or affects others

#### 2. Experiment Mode
**Purpose:** Fast iteration, prototyping, learning without overhead

**Characteristics:**
- ❌ No Beads required (optional)
- ⚠️ Lightweight hooks (linting only, no test blocking)
- ✅ Can commit to main (dangerous but allowed)
- ✅ No session protocol required
- ✅ TodoWrite optional for tracking

**Visual Indicator:**
```
🧪 EXPERIMENT MODE | No tracking required
```

**When to Use:**
- Exploratory work (Experiments repo)
- Temporary testing (temp-docs)
- Personal learning
- Prototypes that won't be merged

#### 3. Archive Mode
**Purpose:** Read-only or completed projects with minimal maintenance

**Characteristics:**
- ❌ No new Beads created
- ❌ Hooks disabled or minimal
- ✅ Can view/reference existing issues
- ✅ PRs allowed for critical fixes only
- ⚠️ Session protocol simplified

**Visual Indicator:**
```
📦 ARCHIVE MODE | Read-only, minimal changes expected
```

**When to Use:**
- Completed projects (product-marketing-bot)
- Deprecated repos
- Reference documentation only

### Mode Configuration

**Location:** `.claude/mode.yaml` (new file per repo)

```yaml
# Mode configuration for this repository
mode: production  # production | experiment | archive

# Mode-specific settings
production:
  beads_required: true
  hooks_enforced: true
  session_protocol: strict

experiment:
  beads_required: false
  hooks_enforced: lightweight  # lint only
  session_protocol: none
  allow_main_commits: true  # Dangerous but allowed

archive:
  beads_required: false
  hooks_enforced: false
  session_protocol: simplified
  warn_on_changes: true
```

**Session Start Hook Integration:**
```python
# Read mode from .claude/mode.yaml
# Display indicator at session start
# Apply appropriate rules
```

---

## Plugin Architecture

### Shared Configuration via `.claude-plugin/`

**Goal:** DRY - Don't repeat yourself. Share configs across repos.

**Structure:**
```
~/Projects/.claude-plugin/
├── README.md                    # Plugin documentation
├── hooks/
│   ├── pre-commit-checks.py     # Standardized pre-commit
│   ├── notification-hook.py     # Push notifications
│   └── session-start.py         # Mode detection + Beads check
├── templates/
│   ├── CLAUDE.md.template       # Base CLAUDE.md template
│   ├── mode.yaml.template       # Mode configuration template
│   └── plan.md.template         # Plan file template
├── settings/
│   ├── production.json          # Production mode settings
│   ├── experiment.json          # Experiment mode settings
│   └── archive.json             # Archive mode settings
└── bin/
    └── install-plugin.sh        # Install script for new repos
```

**How It Works:**

1. **Repo-specific `.claude/settings.json` inherits from plugin:**
   ```json
   {
     "extends": "~/.claude-plugin/settings/production.json",
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             {
               "type": "command",
               "command": "python3 ~/.claude-plugin/hooks/pre-commit-checks.py"
             }
           ]
         }
       ]
     }
   }
   ```

2. **Mode-specific behavior loaded from plugin:**
   - Production: Full hooks from `~/.claude-plugin/settings/production.json`
   - Experiment: Lightweight hooks from `~/.claude-plugin/settings/experiment.json`
   - Archive: Minimal hooks from `~/.claude-plugin/settings/archive.json`

3. **Repos can override:**
   - Add repo-specific hooks
   - Customize settings
   - But inherit common patterns

**Benefits:**
- ✅ Update hooks once, apply everywhere
- ✅ New repos bootstrap instantly
- ✅ Consistency enforced by default
- ✅ Still allows customization per repo

---

## Beads Workflow Standardization

### Production Mode Beads Integration

**Session Start Protocol (Enforced by Hook):**

```markdown
1. Check mode: cat .claude/mode.yaml
2. If mode == production:
   a. Run: bd list --status=in_progress
   b. If none active: bd ready → pick one → bd update <id> --status=in_progress
   c. If active: confirm context
3. Display: 🔒 PRODUCTION MODE | Active Bead: <bead-id>
4. Set environment: export ACTIVE_BEAD_ID=<bead-id>
```

**During Work:**
- All TodoWrite items MUST reference Bead ID
- Example: "beads-ohj: Implement draft feedback loop"
- Compound engineering plan mode allowed but must state Bead context upfront
- Work agents track progress but Bead is source of truth

**Session Close Protocol (Enforced by Checklist):**

```markdown
🚨 SESSION CLOSE CHECKLIST 🚨

[ ] 1. Identify active Bead: bd list --status=in_progress
[ ] 2. Decide Bead fate:
       ✅ Done? → bd close <id> [--reason "completed <feature>"]
       🔄 Still working? → Keep in_progress, add comment
       🆕 Discovered new work? → bd create for each item
[ ] 3. bd sync                 (commit beads changes)
[ ] 4. git status              (check code changes)
[ ] 5. git add <files>         (stage code)
[ ] 6. git commit -m "..."     (commit code, reference Bead ID)
[ ] 7. bd sync                 (commit any new beads from step 6)
[ ] 8. git push                (push to remote)

WORK IS NOT DONE UNTIL PUSHED.
```

**Integration with Compound Engineering:**

Compound engineering workflows (plan mode, work mode) are **compatible** if:
- Bead context is stated upfront: "Planning for beads-XXX"
- Plan exploration is ephemeral (doesn't persist)
- After planning, create/update Beads for discovered work
- TodoWrite shows progress but Beads are authoritative

**CLAUDE.md Template for Production Mode:**

```markdown
## Task Management

This repo uses **PRODUCTION MODE** with full Beads tracking.

### Strategic Planning (Beads)
- All work tracked as Beads issues (`bd create`, `bd ready`, `bd close`)
- Persists across sessions, syncs with git
- Use for: features, bugs, refactorings, anything multi-session

### Tactical Execution (TodoWrite)
- Break down current Bead issue into execution steps
- Show real-time progress to user
- Lives only in current session (intentionally ephemeral)
- MUST reference Bead ID in first todo

### Workflow
1. Session Start: Identify active Bead (enforced by hook)
2. Work: Use TodoWrite to track progress within Bead
3. Session Close: Update Bead status, sync, push (enforced by checklist)

### Agent Workflows
- ✅ Compound engineering plan mode: Allowed, state Bead context upfront
- ✅ Work agents: Use them, but Beads remain source of truth
- ✅ Review agents: Always OK after implementation
```

### Experiment Mode (No Beads)

**Session Start:**
```markdown
🧪 EXPERIMENT MODE | No tracking required
```

**During Work:**
- TodoWrite optional for organizing thoughts
- No Bead required
- Fast iteration prioritized

**Session Close:**
- No protocol required
- Just push if you want to keep it

---

## Plan Management System

### Problems with Current Plans

1. **No timestamps** - Can't tell when plan was created/updated
2. **No archiving** - Old plans accumulate, unclear which is current
3. **No version tracking** - Changes to plans not tracked
4. **Location inconsistent** - Only productiviy-system has `.claude/plans/`

### New Plan Management Structure

**Location:** `.claude/plans/` (standardized across all repos)

**Directory Structure:**
```
.claude/plans/
├── active/                           # Current plans being executed
│   ├── workflow-standardization.md  # This plan
│   └── email-workflow-v2.md         # Another active plan
├── archived/                         # Completed or obsolete plans
│   ├── 2025-12-15-initial-setup.md  # Archived with date prefix
│   └── 2026-01-05-beads-migration.md
└── templates/                        # Plan templates
    ├── feature-plan.md               # Template for feature planning
    ├── refactor-plan.md              # Template for refactorings
    └── bug-investigation.md          # Template for bug hunts
```

### Plan File Format (Standardized)

**Template:** `.claude/plans/templates/feature-plan.md`

```markdown
# <Plan Title>

**Created:** YYYY-MM-DD HH:MM TZ
**Last Updated:** YYYY-MM-DD HH:MM TZ
**Status:** Draft | In Progress | Completed | Archived
**Related Beads:** beads-xxx, beads-yyy
**Mode:** Production | Experiment

---

## Summary
[One paragraph describing what this plan accomplishes]

---

## Goals
- [ ] Goal 1
- [ ] Goal 2

---

## Implementation Steps

### Phase 1: <Name>
**Estimated Effort:** X hours/days
**Dependencies:** None | Beads-xxx

1. Step 1
2. Step 2

### Phase 2: <Name>
[Continue...]

---

## Update Log

### 2026-01-10 18:00
- Initial draft created
- Added sections X, Y, Z

### 2026-01-11 10:00
- Updated Phase 2 based on feedback
- Added dependency on beads-xxx
```

### Plan Lifecycle Commands

**Create New Plan:**
```bash
# Script: ~/.claude-plugin/bin/create-plan.sh
bd create-plan "Feature: Email Draft Feedback Loop" --template feature

# Creates:
# - .claude/plans/active/email-draft-feedback.md
# - Auto-fills timestamps
# - Prompts for related Beads
```

**Update Plan:**
```bash
# Automatic via git pre-commit hook:
# - Detects changes to .claude/plans/active/*.md
# - Updates "Last Updated" timestamp
# - Appends entry to Update Log
```

**Archive Plan:**
```bash
bd archive-plan email-draft-feedback

# Moves:
# - .claude/plans/active/email-draft-feedback.md
# → .claude/plans/archived/2026-01-15-email-draft-feedback.md
# - Updates status to "Archived"
# - Adds "Archived On" timestamp
```

**List Plans:**
```bash
bd list-plans

# Output:
# ACTIVE PLANS:
#   - workflow-standardization.md (Updated: 2026-01-10 18:19)
#   - email-workflow-v2.md (Updated: 2026-01-09 14:22)
#
# ARCHIVED PLANS: (3 total)
#   Use: bd list-plans --archived
```

### Git Integration

**Commit plans separately:**
```bash
# Good workflow:
git add .claude/plans/active/new-plan.md
git commit -m "Add plan: New feature planning"

# Plans tracked in git history
# Can diff plans to see evolution
```

**Plan diffs in PRs:**
- If PR includes code + plan updates, show plan diff in PR description
- Makes it clear what was planned vs what was implemented

---

## Hook Standardization

### Problems with Current Hooks

1. **Only productiviy-system has full hooks** - Others miss enforcement
2. **Hook scripts differ** - 3 different Python implementations
3. **No mode awareness** - Hooks don't adapt to production/experiment mode
4. **No session hooks** - No enforcement of Beads workflow at session start/end

### Standardized Hook Suite

**Location:** `~/.claude-plugin/hooks/` (shared across repos)

#### 1. Pre-Commit Hook (`pre-commit-checks.py`)

**Unified implementation supporting:**
- Deno (deno test, deno lint, deno fmt)
- npm (npm test, npm run lint)
- Python (pytest, pylint, black)
- Make (make test, make lint)

**Mode Awareness:**
```python
def should_enforce_tests():
    mode = read_mode_from_config()  # Reads .claude/mode.yaml
    if mode == "production":
        return True  # Block on test failures
    elif mode == "experiment":
        return False  # Warn but allow
    elif mode == "archive":
        return False  # No enforcement
```

**Features:**
- ✅ Auto-detects test framework
- ✅ Blocks commits to main (production mode only)
- ✅ Runs tests (blocks in production, warns in experiment)
- ✅ Runs linting (blocks in production, warns in experiment)
- ✅ Uses `$CLAUDE_PROJECT_DIR` for robustness

#### 2. Session Start Hook (`session-start.py`)

**Purpose:** Enforce mode and Beads workflow at session start

**Behavior:**
```python
1. Read .claude/mode.yaml
2. Display mode indicator
3. If mode == "production":
   a. Check for active Bead (bd list --status=in_progress)
   b. If none: Remind to run `bd ready` and pick one
   c. If multiple: Error (only one allowed)
   d. Set ACTIVE_BEAD_ID environment variable
4. If mode == "experiment":
   a. Display: 🧪 EXPERIMENT MODE
   b. No Bead check
5. If mode == "archive":
   a. Display: 📦 ARCHIVE MODE
   b. Warn if attempting new work
```

**Integration:**
```json
// In .claude/settings.json:
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "python3 ~/.claude-plugin/hooks/session-start.py"
      }
    ]
  }
}
```

#### 3. Notification Hook (`notification-hook.py`)

**Current:** Only in productiviy-system
**Future:** Optional in all repos (via mode config)

**Mode Behavior:**
- Production: Enable notifications for idle/permission/stop
- Experiment: Disable (fast iteration, don't need alerts)
- Archive: Disable

#### 4. Plan Update Hook (`plan-update.py`)

**Purpose:** Auto-update plan timestamps when modified

**Triggers:** When `.claude/plans/active/*.md` files change

**Behavior:**
```python
1. Detect plan file modification
2. Update "Last Updated: YYYY-MM-DD HH:MM TZ"
3. Append entry to Update Log section:
   ### YYYY-MM-DD HH:MM
   - [Auto-updated by git hook]
```

**Integration:** Pre-commit hook checks plan files

---

## Implementation Phases

### Phase 1: Plugin Foundation (2-3 hours)

**Goal:** Create shared plugin infrastructure

**Tasks:**
1. Create `~/.claude-plugin/` directory structure
2. Write `~/.claude-plugin/hooks/pre-commit-checks.py` (unified)
3. Write `~/.claude-plugin/hooks/session-start.py`
4. Write `~/.claude-plugin/hooks/plan-update.py`
5. Create templates:
   - `mode.yaml.template`
   - `CLAUDE.md.template`
   - `plan.md.template`
6. Write `~/.claude-plugin/bin/install-plugin.sh`

**Verification:**
- Plugin directory exists
- All hook scripts executable
- Templates readable

**No code changes to repos yet** - just foundation.

---

### Phase 2: Mode System Rollout (3-4 hours)

**Goal:** Add mode configuration to all repos

**Tasks:**
1. For each repo, create `.claude/mode.yaml`:
   - productiviy-system: `mode: production`
   - deep-research-archive: `mode: production`
   - recruiting-docs: `mode: production`
   - product-docs: `mode: production`
   - product-marketing-bot: `mode: archive`
   - temp-docs: `mode: experiment`
   - Experiments: `mode: experiment`

2. Update each `.claude/settings.json` to use plugin hooks:
   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "type": "command",
           "command": "python3 ~/.claude-plugin/hooks/session-start.py"
         }
       ],
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             {
               "type": "command",
               "command": "python3 ~/.claude-plugin/hooks/pre-commit-checks.py"
             }
           ]
         }
       ]
     }
   }
   ```

3. Test mode detection in each repo:
   - Start Claude Code session
   - Verify mode indicator displays
   - Verify hooks behave according to mode

**Verification:**
- All repos show correct mode indicator at session start
- Production repos enforce Beads workflow
- Experiment repos allow fast iteration

---

### Phase 3: Beads Standardization (2-3 hours)

**Goal:** Ensure Beads consistency across production repos

**Tasks:**
1. Install Beads in repos missing it:
   - deep-research-archive: `bd init`
   - recruiting-docs: `bd init` (or decide not needed)
   - product-docs: `bd init` (or decide not needed)

2. Configure sync branch consistently:
   - productiviy-system: Set `sync-branch: "beads-sync"`
   - product-marketing-bot: Already set to `beads-sync`
   - Others: Set `sync-branch: "beads-sync"`

3. Update CLAUDE.md in each production repo:
   - Add "Task Management" section (from template)
   - Document Beads workflow
   - Include session start/close protocols

4. Migrate existing issues if needed:
   - productiviy-system: Already using Beads ✅
   - product-marketing-bot: Already using Beads ✅
   - Others: Create initial issues if active work exists

**Verification:**
- `bd stats` works in all production repos
- `bd sync` commits to correct branch
- Session start hook finds active Beads

**Decision Points:**
- Do we need Beads in recruiting-docs and product-docs?
  - These are mostly documentation repos
  - May be overkill for simple doc updates
  - **Recommendation:** Skip for now, add if needed later

---

### Phase 4: Plan Management (1-2 hours)

**Goal:** Implement timestamped plan tracking

**Tasks:**
1. Create `.claude/plans/` directories in all repos:
   ```bash
   mkdir -p .claude/plans/{active,archived,templates}
   ```

2. Copy plan templates:
   ```bash
   cp ~/.claude-plugin/templates/plan.md.template .claude/plans/templates/feature-plan.md
   # Repeat for other templates
   ```

3. Move existing plans to new structure:
   - productiviy-system: Move `.claude/plans/weekly-cadence-skill.md` → `active/`
   - Add timestamps to existing plans

4. Install plan management scripts:
   ```bash
   ~/.claude-plugin/bin/create-plan.sh
   ~/.claude-plugin/bin/archive-plan.sh
   ~/.claude-plugin/bin/list-plans.sh
   ```

5. Enable plan-update hook in `.claude/settings.json`

**Verification:**
- Plans have correct timestamps
- Archive mechanism works
- Update Log auto-appends on changes

---

### Phase 5: CLAUDE.md Standardization (3-4 hours)

**Goal:** Consistent CLAUDE.md across repos with mode-specific guidance

**Tasks:**
1. Create base template from productiviy-system CLAUDE.md:
   - Extract common sections (git workflow, PR process, code style)
   - Save as `~/.claude-plugin/templates/CLAUDE.md.template`

2. For each repo, update CLAUDE.md:
   - Add mode declaration at top
   - Add/update "Task Management" section (mode-specific)
   - Add/update "Hooks" section referencing plugin
   - Keep repo-specific sections (code style, frameworks, etc.)

3. Production repos (productiviy-system, deep-research-archive):
   - Full Beads workflow section
   - Session start/close protocols
   - Compound engineering integration notes

4. Experiment repos (temp-docs, Experiments):
   - Minimal/no task tracking section
   - Emphasis on fast iteration
   - "No rules" philosophy documented

5. Archive repos (product-marketing-bot):
   - Read-only notice
   - Link to active fork if relevant
   - Historical context

**Verification:**
- Each CLAUDE.md accurately reflects repo mode
- Task tracking guidance matches mode
- No contradictions (e.g., Archive mode claiming to use Beads)

---

### Phase 6: Hook Migration & Testing (2-3 hours)

**Goal:** All repos use plugin hooks consistently

**Tasks:**
1. For repos with existing hooks, migrate to plugin:
   - productiviy-system: Update `.claude/settings.json` to reference plugin
   - deep-research-archive: Add hooks via plugin
   - recruiting-docs: Migrate Bash script logic to plugin (or keep custom)
   - temp-docs: Add hooks via plugin

2. Test hooks in each repo:
   - Attempt commit to main (should block in production mode)
   - Attempt commit with failing tests (should block in production mode)
   - Verify experiment mode allows everything
   - Verify archive mode warns but allows

3. Document hook customization:
   - How to add repo-specific hooks
   - How to override plugin defaults
   - Examples of custom hooks

**Verification:**
- All production repos block bad commits
- All experiment repos allow fast iteration
- Archive repos warn on changes

---

### Phase 7: Documentation & Rollout (1-2 hours)

**Goal:** Document the system for future use

**Tasks:**
1. Write `~/.claude-plugin/README.md`:
   - Overview of plugin system
   - Mode descriptions
   - Installation instructions
   - Customization guide

2. Create onboarding doc:
   - How to set up a new repo with the plugin
   - How to choose a mode
   - How to install Beads if needed

3. Add to each repo's README:
   - Badge showing mode (🔒 Production | 🧪 Experiment | 📦 Archive)
   - Link to plugin documentation

4. Record demo video (optional):
   - Show mode system in action
   - Show session start/close with Beads
   - Show plan management

**Verification:**
- Plugin README is comprehensive
- New team member can set up a repo from docs

---

## Success Criteria

### Must Have
- ✅ Mode indicator displays at every session start
- ✅ Production repos enforce Beads workflow
- ✅ Experiment repos allow fast iteration without overhead
- ✅ All repos use shared plugin hooks (no duplication)
- ✅ Plans have timestamps and can be archived
- ✅ CLAUDE.md matches actual repo behavior

### Nice to Have
- ✅ Plan management CLI (`bd create-plan`, `bd archive-plan`)
- ✅ Notification hooks in production mode
- ✅ Auto-update plan timestamps on modification
- ✅ Cross-repo Beads dependencies (experimental feature)

### Out of Scope (Future Work)
- ❌ Multi-repo Beads coordination (defer to Beads roadmap)
- ❌ Visual dashboard for all repos (separate project)
- ❌ GitHub integration for Beads (separate project)

---

## Risks & Mitigations

### Risk 1: Plugin Path Issues
**Risk:** `~/.claude-plugin/` might not work in all environments
**Mitigation:** Use `$HOME/.claude-plugin/` explicitly, test on fresh machine

### Risk 2: Hook Performance
**Risk:** Session start hook adds latency
**Mitigation:** Keep hook under 1 second, use caching, make it non-blocking for warnings

### Risk 3: Mode Confusion
**Risk:** Users forget which mode they're in
**Mitigation:** Always display mode indicator, make it impossible to miss

### Risk 4: Breaking Existing Workflows
**Risk:** Changes disrupt current productiviy-system workflow
**Mitigation:** Phase 1-2 are additive only, test thoroughly before Phase 3

### Risk 5: Beads Overhead in Simple Repos
**Risk:** Forcing Beads on docs repos is overkill
**Mitigation:** Only require Beads in active development repos, docs repos can skip

---

## Questions for User

Before implementation, please clarify:

1. **Plugin Location:**
   - Is `~/.claude-plugin/` the right location?
   - Or prefer per-repo `.claude/plugin/` with symlinks?

2. **Beads for Documentation Repos:**
   - Should recruiting-docs and product-docs use Beads?
   - Or is git commit history sufficient for those?

3. **Archive Mode Strictness:**
   - Should archive repos block all changes?
   - Or just warn and allow for critical fixes?

4. **Notification Preferences:**
   - Keep ntfy.sh notifications productiviy-system only?
   - Or roll out to all production repos?

5. **Experiment → Production Migration:**
   - If work in experiment mode proves valuable, how to migrate to production?
   - Should there be a `bd promote-experiment` command?

6. **Custom Hooks Per Repo:**
   - Some repos (recruiting-docs) have custom Bash scripts
   - Keep custom + add plugin? Or migrate to plugin entirely?

---

## Next Steps

1. **User reviews this plan** and answers questions above
2. **User approves** or requests changes
3. **We implement Phase 1** (plugin foundation)
4. **We test Phase 1** in a single repo (productiviy-system)
5. **We iterate** based on learnings
6. **We roll out** to remaining repos phase by phase

---

## Update Log

### 2026-01-10 18:19 PST
- Initial draft created by Claude
- Comprehensive research from 7 repos
- Addressed user's experiment mode requirement
- Designed plugin architecture for DRY
- Incorporated plan management with timestamps

