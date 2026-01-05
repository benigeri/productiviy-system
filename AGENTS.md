# Agent Development Guidelines

This document defines how AI agents should work on this codebase.

---

## Core Principles

1. **Never commit directly to `main`** - All changes go through pull requests
2. **Test-Driven Development** - Write tests before implementation
3. **Track progress with todos** - Use the beads process for visibility
4. **Small, focused PRs** - One feature/fix per PR for easy review

---

## Pull Request Workflow

### For Every Change:

1. **Create a feature branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feature/short-description
   ```

2. **Make changes** following TDD (see below)

3. **Commit with clear messages**:
   ```bash
   git commit -m "Brief description of change"
   ```

4. **Push and create PR**:
   ```bash
   git push -u origin feature/short-description
   ```
   Then create PR with summary of changes.

5. **Wait for review** - User will review diff and approve

6. **After merge**, switch back to main:
   ```bash
   git checkout main && git pull
   ```

---

## Test-Driven Development (TDD)

### The Process:

1. **Red** - Write a failing test that defines expected behavior
2. **Green** - Write minimal code to make the test pass
3. **Refactor** - Clean up while keeping tests green

### Test File Convention:
- Source: `lib/module.ts`
- Tests: `lib/module.test.ts`

### Running Tests:
```bash
deno test
```

---

## Todo Tracking (Beads Process)

### When Starting a Task:
1. Mark the todo as `in_progress`
2. Only one task should be `in_progress` at a time

### While Working:
- Keep todos updated as you discover sub-tasks
- Add new todos if scope expands

### When Finishing:
1. Ensure all tests pass
2. Create PR and push
3. Mark todo as `completed` only **after PR is merged**

---

## Pre-commit Checks

Before every commit, ensure:

```bash
deno fmt --check      # Code formatting
deno lint             # Linting rules
deno test             # All tests pass
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

### Verifying Hooks:
```bash
# In Claude Code, run:
/hooks
```

---

## Code Style

### TypeScript (Supabase Edge Functions):
- Use Deno runtime
- Prefer `const` over `let`
- Use async/await over raw promises
- Type all function parameters and returns

### Python (CLI tools):
- Follow PEP 8
- Use type hints
- Use `python-dotenv` for env vars

---

## Environment Variables

Never commit secrets. Use:
- `.env` for local development (gitignored)
- `.env.example` as a template (committed)
- Supabase secrets for production

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

## Example Workflow

```
User: "Add voice transcription support"

Agent:
1. git checkout -b feature/voice-transcription
2. TodoWrite: mark "Write tests for deepgram.ts" as in_progress
3. Write deepgram.test.ts with test cases
4. Run tests → confirm they fail (Red)
5. Implement deepgram.ts
6. Run tests → confirm they pass (Green)
7. Refactor if needed
8. git commit -m "Add Deepgram voice transcription"
9. git push -u origin feature/voice-transcription
10. Create PR with summary
11. Wait for user to review and merge
12. TodoWrite: mark task as completed
13. git checkout main && git pull
```
