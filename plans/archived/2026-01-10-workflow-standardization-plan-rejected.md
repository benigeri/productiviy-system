# Workflow Standardization Plan

**Created:** 2026-01-10 18:30 PST
**Updated:** 2026-01-10 19:45 PST
**Status:** Draft - Ready for Review
**Related Epic:** (will be created after approval)

---

## Executive Summary

Standardize workflow across all repos by:
1. **One Unified Hook** - Share pre-commit checks across repos (DRY)
2. **Plan Management** - Plans in `plans/` at repo root, committed to GitHub
3. **Epic → Plan → Beads Hierarchy** - Clear structure for complex work
4. **Auto-Linking** - Plans automatically link to Epics and Beads
5. **BD Sync Integration** - Verification happens at sync + push, not "session close"

**Key Insight:** You don't "close sessions," so enforcement happens at natural checkpoints (bd sync, git push).

---

## Core Structure

### The Hierarchy

```
Epic (Bead with type=epic)
  ├─→ Plan (Document in plans/active/)
  └─→ Child Beads (Tasks/features/bugs)

Example:
beads-001 [epic]: Email Workflow Overhaul
  ├─→ plans/active/email-workflow-v2.md
  ├─→ beads-abc [task]: Draft feedback loop
  ├─→ beads-def [task]: Preview before send
  └─→ beads-ghi [task]: Template system
```

**Rules:**
- ✅ Plans ALWAYS map to Epics (1:1 relationship)
- ✅ Plans reference their Epic Bead ID
- ✅ Plans reference all child Beads
- ✅ Child Beads reference the Plan file
- ✅ Child Beads are dependencies of the Epic (via `bd dep add`)

### When to Use This Structure

**Use Epic + Plan when:**
- Multi-step feature (3+ tasks)
- Requires architectural decisions
- Needs a design document
- Using compound engineering plan mode

**Don't use for:**
- One-off bug fixes (just create a Bead)
- Simple doc updates (just create a Bead)
- Quick refactorings (just create a Bead)

---

## Repository Structure

### Plans Location: `plans/` at Repo Root

**NOT in `.claude/plans/`** - Plans are committed to GitHub, visible, part of the project.

```
plans/
├── active/                          # Current work
│   ├── email-workflow-v2.md
│   ├── calendar-integration.md
│   └── performance-improvements.md
├── archived/                        # Completed work
│   ├── 2026-01-10-initial-setup.md
│   └── 2026-01-11-auth-migration.md
└── templates/                       # Optional templates
    └── feature-plan.md
```

**Multiple active plans:** ✅ Allowed - you can work on multiple things

### Plan File Format

```markdown
# <Feature Name>

**Created:** YYYY-MM-DD HH:MM TZ
**Updated:** YYYY-MM-DD HH:MM TZ
**Status:** Planning | In Progress | Completed
**Related Epic:** beads-001
**Related Beads:** beads-abc, beads-def, beads-ghi

---

## Summary
[One paragraph describing what this accomplishes]

---

## Implementation Approach

### Phase 1: <Name>
1. Step
2. Step

### Phase 2: <Name>
[Continue...]

---

## Bead Status
- beads-abc: ✅ Closed
- beads-def: 🔄 In Progress
- beads-ghi: 📋 Open

---

## Update Log

### YYYY-MM-DD HH:MM
- What changed
```

**Key sections:**
- **Related Epic:** Links to Epic Bead (e.g., beads-001)
- **Related Beads:** Lists all child Beads
- **Bead Status:** Shows progress (updated manually or by bd verify-plan)
- **Update Log:** Auto-appended by plan-update hook

---

## Workflow

### 1. Starting a New Feature (Planning Phase)

**You do this:**
```bash
# Use compound engineering plan mode or Claude plan mode
# Tell Claude: "Create a plan for <feature>"
```

**Claude does this automatically:**
```bash
# 1. Create Epic Bead
bd create "Email Workflow Overhaul" --type epic --priority 1
# → Creates beads-001

# 2. Create plan file
# Creates plans/active/email-workflow-v2.md with:
#   Related Epic: beads-001
#   Related Beads: (empty initially)

# 3. Link Epic to Plan
bd update beads-001 --description "Email Workflow Overhaul (Plan: plans/active/email-workflow-v2.md)"

# 4. Write implementation approach in plan
```

**Result:**
- ✅ Epic Bead exists (beads-001)
- ✅ Plan file exists (plans/active/email-workflow-v2.md)
- ✅ Bidirectional link (Epic ↔ Plan)
- ✅ Plan committed to git

### 2. Starting Implementation (Execution Phase)

**You do this:**
```bash
# Tell Claude: "Start implementing email workflow plan"
```

**Claude does this automatically:**
```bash
# 1. Read plan file
cat plans/active/email-workflow-v2.md

# 2. Create child Beads from plan sections
bd create "Add feedback textarea" --type task --priority 1
# → Creates beads-abc

bd create "Add regenerate button" --type task --priority 1
# → Creates beads-def

bd create "Wire up state management" --type task --priority 1
# → Creates beads-ghi

# 3. Link each Bead to Epic
bd dep add beads-abc beads-001  # abc depends on (is child of) 001
bd dep add beads-def beads-001
bd dep add beads-ghi beads-001

# 4. Link each Bead to Plan
bd update beads-abc --description "Add feedback textarea (Plan: plans/active/email-workflow-v2.md)"
bd update beads-def --description "Add regenerate button (Plan: plans/active/email-workflow-v2.md)"
bd update beads-ghi --description "Wire up state management (Plan: plans/active/email-workflow-v2.md)"

# 5. Update plan with Bead IDs
# Edits plans/active/email-workflow-v2.md:
#   Related Beads: beads-abc, beads-def, beads-ghi

# 6. Commit plan changes
git add plans/active/email-workflow-v2.md
git commit -m "Link Beads to email workflow plan"

# 7. Sync Beads
bd sync

# 8. Start work on first Bead
bd update beads-abc --status in_progress
```

**Result:**
- ✅ All work items have Beads
- ✅ All Beads link to Plan
- ✅ All Beads are children of Epic
- ✅ Plan references all Beads
- ✅ Everything synced and committed

### 3. During Implementation

**You work normally:**
```bash
# Work on Beads one at a time
bd update beads-abc --status in_progress
# ... do the work ...
bd close beads-abc

# Sync regularly
bd sync  # This also verifies plan links

# Git workflow as usual
git add/commit/push
```

**Pre-push hook automatically:**
```bash
# Runs bd sync
# Verifies plan-Bead links
# Warns if anything out of sync
# (Doesn't block - just informs)
```

### 4. Finishing a Plan (Completion Phase)

**When all Beads closed:**
```bash
# Check status
bd plan-status

# Output:
Active Plans:
  email-workflow-v2.md
    Epic: beads-001 (Email Workflow Overhaul)
    Beads: 3 total, 3 closed ✅
    → Ready to archive!

# Finish the plan
bd finish-plan email-workflow-v2

# This does:
# 1. Verifies all Beads closed
# 2. Updates plan status to "Completed"
# 3. Adds completion timestamp
# 4. Moves: plans/active/email-workflow-v2.md
#       → plans/archived/2026-01-11-email-workflow-v2.md
# 5. Commits archived plan
# 6. Closes Epic (bd close beads-001)
# 7. Syncs everything
```

**Result:**
- ✅ Plan archived with date prefix
- ✅ Epic closed
- ✅ All changes committed
- ✅ Clean state for next work

---

## Commands & Tools

### New Beads Commands

**1. `bd finish-plan <plan-name>`**

Completes and archives a plan.

```bash
bd finish-plan email-workflow-v2

# Checks:
# - All related Beads closed?
# - Epic ready to close?

# If yes:
# - Updates plan status
# - Archives to plans/archived/YYYY-MM-DD-<name>.md
# - Closes Epic Bead
# - Commits changes

# If no:
# - Shows which Beads still open
# - Exits without changes
```

**2. `bd verify-plan <plan-file>`**

Verifies plan-Bead-Epic links.

```bash
bd verify-plan plans/active/email-workflow-v2.md

# Checks:
# ✅ Plan references Epic
# ✅ Epic references Plan
# ✅ Plan lists all child Beads
# ✅ Each Bead references Plan
# ✅ Each Bead is child of Epic

# Auto-fixes simple issues:
# - Adds missing plan references to Beads
# - Updates Epic description if missing plan link

# Warns about complex issues:
# - Beads listed in plan but don't exist
# - Beads exist but not listed in plan
```

**3. `bd plan-status`**

Shows status of all active plans.

```bash
bd plan-status

# Output:
Active Plans (3):

1. email-workflow-v2.md
   Epic: beads-001 (Email Workflow Overhaul)
   Beads: 3 total, 2 closed, 1 in_progress
   Status: In Progress 🔄

2. calendar-integration.md
   Epic: beads-002 (Calendar Integration)
   Beads: 5 total, 0 closed, 0 in_progress
   Status: Not Started 📋

3. performance-improvements.md
   Epic: beads-003 (Performance Work)
   Beads: 2 total, 2 closed
   Status: Ready to Archive ✅
```

**4. `bd link-bead <bead-id> <plan-file>` (Manual fallback)**

Manually link a Bead to a plan if auto-linking fails.

```bash
bd link-bead beads-xyz plans/active/email-workflow-v2.md

# Updates:
# - Bead description to reference plan
# - Plan file to include Bead ID
# - Epic dependency (bd dep add beads-xyz <epic-id>)
```

---

## Hook System

### Current Hooks Across Repos

**You have 3 different Python hooks + 1 Bash hook:**

| Repo | Hook Type | Test Support | Unique Features |
|------|-----------|--------------|-----------------|
| productiviy-system | Python | Deno | Hardcoded paths to supabase/ |
| deep-research-archive | Python | npm | Uses $CLAUDE_PROJECT_DIR |
| temp-docs | Python | npm, pytest, make | Most flexible (multi-language) |
| recruiting-docs | Bash | None | Runs `npm run generate-homepage` |

**Problem:** Duplicated logic, inconsistent behavior

### Solution: One Shared Hook

**Location:** `~/.claude-plugin/hooks/pre-commit-checks.py`

**Based on:** temp-docs version (most flexible)

**Features:**
- ✅ Auto-detects test framework (npm, pytest, make, deno)
- ✅ Blocks commits to main
- ✅ Runs tests before commit
- ✅ Runs linting before commit
- ✅ Uses `$CLAUDE_PROJECT_DIR` for robustness
- ✅ BD sync verification before push
- ✅ Plan-Bead link verification before push

**New pre-push additions:**
```python
def check_push_readiness():
    """Before pushing, ensure beads synced and plans verified"""
    # Run bd sync
    subprocess.run(["bd", "sync"], cwd=os.environ["CLAUDE_PROJECT_DIR"])

    # Verify all active plans
    if os.path.exists("plans/active"):
        for plan in glob("plans/active/*.md"):
            verify_plan_links(plan)
```

### Recruiting Docs Special Case

**Keep BOTH hooks:**
- Shared hook (for tests/lint/main protection)
- Custom Bash hook (for homepage generation)

**Implementation:**
```json
// recruiting-docs/.claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude-plugin/hooks/pre-commit-checks.py",
            "timeout": 120
          },
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/scripts/pre-commit-hook.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Both hooks run in sequence. Works perfectly.

---

## Plugin Architecture

### Directory Structure

```
~/.claude-plugin/
├── README.md                       # Plugin documentation
├── hooks/
│   ├── pre-commit-checks.py        # Unified pre-commit hook
│   └── plan-update.py              # Auto-update plan timestamps
├── templates/
│   ├── plan.md.template            # Plan file template
│   └── CLAUDE.md.section           # Task management section for CLAUDE.md
└── bin/
    ├── install-plugin.sh           # Install to new repo
    └── bd-extensions/              # Custom bd commands
        ├── bd-finish-plan
        ├── bd-verify-plan
        ├── bd-plan-status
        └── bd-link-bead
```

### Why Plugin?

**DRY Principle:**
- Update hook once, applies to all repos
- Update templates once, reuse everywhere
- New repos bootstrap instantly

**Still allows customization:**
- Repos can add repo-specific hooks
- Repos can override plugin settings
- recruiting-docs keeps custom hook

---

## Implementation Phases

### Phase 1: Plugin Foundation (2 hours)

**Tasks:**
1. Create `~/.claude-plugin/` directory structure
2. Write unified `pre-commit-checks.py` (based on temp-docs)
3. Add bd sync + plan verification to pre-push logic
4. Write `plan-update.py` hook (auto-update timestamps)
5. Create plan template
6. Write installation script

**Verification:**
```bash
ls ~/.claude-plugin/hooks/
# Should show: pre-commit-checks.py, plan-update.py

python3 ~/.claude-plugin/hooks/pre-commit-checks.py --help
# Should show usage
```

**No changes to repos yet** - just foundation.

---

### Phase 2: BD Command Extensions (3 hours)

**Tasks:**
1. Write `bd finish-plan` script
   - Check all Beads closed
   - Archive plan with date prefix
   - Close Epic Bead
   - Commit changes

2. Write `bd verify-plan` script
   - Check Epic ↔ Plan link
   - Check Plan → Beads links
   - Check Beads → Plan links
   - Check Beads → Epic dependencies
   - Auto-fix simple issues
   - Warn about complex issues

3. Write `bd plan-status` script
   - List all active plans
   - Show Epic and Bead status
   - Highlight plans ready to archive

4. Write `bd link-bead` script (manual fallback)
   - Link existing Bead to plan
   - Update Epic dependencies

5. Install scripts to `~/.claude-plugin/bin/bd-extensions/`
6. Add to PATH or symlink to `~/.local/bin/`

**Verification:**
```bash
bd finish-plan --help
bd verify-plan --help
bd plan-status --help
bd link-bead --help
```

---

### Phase 3: Migrate productiviy-system (2 hours)

**This repo is the pilot.**

**Tasks:**
1. Create `plans/` directory structure:
   ```bash
   mkdir -p plans/{active,archived,templates}
   ```

2. Move existing `.claude/plans/weekly-cadence-skill.md`:
   ```bash
   mv .claude/plans/weekly-cadence-skill.md plans/active/
   ```

3. Add timestamps and Epic link to existing plan

4. Update `.claude/settings.json` to use plugin hook:
   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             {
               "type": "command",
               "command": "python3 ~/.claude-plugin/hooks/pre-commit-checks.py",
               "timeout": 120
             }
           ]
         }
       ]
     }
   }
   ```

5. Test workflow:
   - Create new Epic: `bd create "Test Feature" --type epic`
   - Use plan mode to create plan
   - Verify auto-linking works
   - Create child Beads
   - Verify links with `bd verify-plan`
   - Close Beads
   - Finish plan with `bd finish-plan`

6. Update CLAUDE.md with new workflow section

**Verification:**
- Plan file in `plans/active/`
- Epic + Plan + Beads all linked
- `bd verify-plan` shows all green
- `bd finish-plan` successfully archives

---

### Phase 4: Rollout to Other Repos (3 hours)

**For each repo (except recruiting-docs):**

1. Create `plans/` directory
2. Update `.claude/settings.json` to use plugin hook
3. Initialize Beads if not present:
   ```bash
   bd init  # If .beads/ doesn't exist
   ```
4. Update CLAUDE.md with workflow section
5. Test basic workflow

**For recruiting-docs specifically:**
1. Create `plans/` directory
2. Update `.claude/settings.json` with BOTH hooks (shared + custom)
3. Test that both hooks work together
4. Update CLAUDE.md

**Repos to update:**
- productiviy-system ✅ (done in Phase 3)
- deep-research-archive
- recruiting-docs (special case)
- product-marketing-bot (archive mode - minimal changes)
- product-docs
- temp-docs
- Experiments (skip - truly experimental)

---

### Phase 5: Documentation (1 hour)

**Tasks:**
1. Write `~/.claude-plugin/README.md`
   - Plugin overview
   - Installation instructions
   - Workflow guide
   - Troubleshooting

2. Update each repo's CLAUDE.md with standardized section:
   ```markdown
   ## Task Management

   This repo uses the Epic → Plan → Beads workflow.

   [Standard section from template]
   ```

3. Create examples in productiviy-system:
   - Example plan file
   - Example Epic with children
   - Example verification output

4. Record short demo video (optional):
   - Creating a plan
   - Auto-linking Beads
   - Finishing a plan

---

## Success Criteria

### Must Have
- ✅ One shared hook used by all repos (except recruiting-docs custom)
- ✅ Plans in `plans/` at repo root, committed to git
- ✅ Epic → Plan → Beads hierarchy enforced
- ✅ Auto-linking works: Claude creates Beads from plans automatically
- ✅ `bd finish-plan` successfully archives completed plans
- ✅ `bd verify-plan` detects and fixes broken links
- ✅ Pre-push hook runs bd sync and verification
- ✅ No more "session close" - verification at natural checkpoints

### Nice to Have
- ✅ `bd plan-status` shows visual dashboard of active work
- ✅ Plan timestamps auto-update on modification
- ✅ Templates for common plan types
- ✅ Cross-repo plugin updates (update once, apply everywhere)

### Out of Scope (Future)
- ❌ Multi-repo Beads coordination (Beads has experimental support, defer)
- ❌ Visual plan dashboard (separate project)
- ❌ GitHub integration (separate project)
- ❌ Mode system (production/experiment/archive) - too complex, not needed

---

## Questions Answered

### Q: What does "session close" mean?
**A:** It doesn't - you don't close sessions. Verification happens at `bd sync` and `git push` instead.

### Q: Is "finish plan" an actual command?
**A:** Yes - `bd finish-plan <name>` archives the plan, closes the Epic, syncs everything.

### Q: How do multiple plans work?
**A:** Multiple active plans allowed. Each maps to an Epic, which has child Beads. `bd plan-status` shows all active work.

### Q: Epics or no epics?
**A:** Always use Epics for plans. By definition, plans create multiple Beads, so Epic structure makes sense.

### Q: Always create plan files?
**A:** Yes - whenever using plan mode, save to `plans/active/<name>.md`.

### Q: Where do future/backlog plans go?
**A:** Leave in `plans/active/` even if not started. No separate backlog directory (too complex).

### Q: How does auto-linking work?
**A:** When Claude creates Beads from a plan, it automatically:
1. Links Bead → Plan (in Bead description)
2. Links Bead → Epic (via bd dep add)
3. Updates Plan with Bead ID
4. Commits everything

### Q: What about recruiting-docs custom hook?
**A:** Keep it! Add shared hook alongside custom hook. Both run in sequence.

---

## Risks & Mitigations

### Risk 1: Plugin Path Issues
**Risk:** `~/.claude-plugin/` might not be accessible in all environments
**Mitigation:** Use `$HOME/.claude-plugin/` explicitly, test on fresh machine

### Risk 2: Auto-Linking Failures
**Risk:** Claude might forget to link Beads properly
**Mitigation:** `bd verify-plan` catches broken links, `bd link-bead` fixes manually

### Risk 3: Multiple Active Plans Confusion
**Risk:** Hard to track which plan you're working on
**Mitigation:** `bd plan-status` shows clear overview, Bead descriptions reference plan

### Risk 4: Breaking Existing productiviy-system Workflow
**Risk:** Changes disrupt current work
**Mitigation:** Phase 3 is careful migration, test thoroughly before other repos

### Risk 5: Plan Files Accumulate in active/
**Risk:** Lots of plans in active/ directory, unclear which are current
**Mitigation:** `bd plan-status` highlights ready-to-archive plans, regular cleanup

---

## Next Steps

1. **Review this plan** - You approve or request changes
2. **Create Epic for this work** - Turn this plan into actual Beads
3. **Implement Phase 1** - Plugin foundation
4. **Test in productiviy-system** - Phase 3 pilot
5. **Iterate based on learnings**
6. **Roll out to other repos** - Phases 4-5

---

## Update Log

### 2026-01-10 18:30 PST
- Initial draft created

### 2026-01-10 19:45 PST
- Removed "session close" concept (doesn't match workflow)
- Added Epic → Plan → Beads hierarchy (always use Epics)
- Added auto-linking workflow (Claude does this automatically)
- Added bd finish-plan, bd verify-plan, bd plan-status commands
- Moved plans to `plans/` at repo root (not .claude/plans/)
- Simplified to focus on natural checkpoints (bd sync, git push)
- Clarified recruiting-docs keeps custom hook + adds shared hook
- Multiple active plans allowed (no backlog directory)
- Always create plan files when using plan mode
