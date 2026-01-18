# Claude Code Configuration Templates

This directory contains **reference templates** for standardizing Claude Code workflows across repositories.

---

## What's in Here

| File | Purpose |
|------|---------|
| `CLAUDE-TEMPLATE.md` | Standard CLAUDE.md template with all sections |
| `BEADS-WORKFLOW.md` | Complete Beads workflow guide (copy of root file) |

---

## How to Use

### For New Repos

1. Copy `CLAUDE-TEMPLATE.md` to repo root as `CLAUDE.md`
2. Replace `[Repo Name]` and `[prefix]` placeholders
3. Update repo-specific sections:
   - Test commands
   - Lint commands
   - Technology stack details
4. Copy `BEADS-WORKFLOW.md` to repo root (if not present)
5. Initialize beads: `bd init`
6. Configure hooks (see template sections)

### For Existing Repos

Use these templates to **verify** your CLAUDE.md has all standard sections:
- 6 Core Principles
- Git Safety Guidelines
- Critical Thinking Guidelines
- Feature Development Workflow
- Test-Driven Development (TDD)
- Creating Plans (MANDATORY)
- Epic Workflow
- Before Clearing Context / Compacting
- Pre-commit Checks
- Claude Code Hooks
- Shell Commands (Critical)
- Frontend Development Guidelines
- PR Description Template
- 3 Example Workflows

---

## Not Used As Reference

**Important:** These templates are **documentation only**, not programmatically referenced.

- Each repo has its own `CLAUDE.md` file
- Templates live here for **easy copying** when setting up new repos
- Changes to templates don't affect existing repos

---

## Questions?

See the main project CLAUDE.md or BEADS-WORKFLOW.md for detailed workflow guidance.
