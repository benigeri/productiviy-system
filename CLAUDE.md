# Agent Development Guidelines

This document defines how AI agents should work on this codebase.

---

## Core Principles

1. **Never commit directly to `main`** - All changes go through pull requests
2. **Test-Driven Development** - Write tests before implementation
3. **Track progress with todos** - Use the beads process for visibility
4. **Small, focused PRs** - One feature/fix per PR for easy review
5. **Verify before closing** - Always test/verify your work before marking a bead complete
6. **Never use `cd` commands** - Always use absolute paths to avoid breaking the shell session

---

## Pull Request Workflow

### For Every Change:

1. **Create a feature branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feature/short-description
   ```

2. **Make changes** following TDD (see below)

3. **Test locally** - CRITICAL: Always verify your changes work before pushing:
   - For web apps: Start dev server, open in browser, test all modified functionality
   - For APIs: Use curl/Postman to test endpoints
   - For CLI tools: Run the command with various inputs
   - For libraries: Run the test suite
   - **NEVER skip this step** - broken code wastes everyone's time

4. **Commit with clear messages**:
   ```bash
   git commit -m "Brief description of change"
   ```

5. **Push and create PR**:
   ```bash
   git push -u origin feature/short-description
   ```
   Then create PR with summary of changes.

6. **Run code review** - Use compound engineering review agents to catch issues

7. **Wait for review** - User will review diff and approve

8. **After merge**, switch back to main:
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
1. **Verify your work** - Test that changes actually work:
   - For code: run tests, verify functionality
   - For config/credentials: test the connection/integration
   - For setup tasks: confirm the service responds correctly
2. Ensure all tests pass
3. Create PR and push
4. Mark todo as `completed` only **after PR is merged AND work is verified**

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

## Shell Commands (Critical)

**NEVER use `cd` in bash commands.** The shell session persists between commands, and changing directories breaks Claude Code hooks which expect to run from the project root.

### Bad:
```bash
cd supabase/functions/telegram-webhook && deno test
```

### Good:
```bash
deno test /Users/benigeri/Projects/productiviy-system/supabase/functions/telegram-webhook/lib/telegram.test.ts
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

## Code Style

### TypeScript (Supabase Edge Functions):
- Use Deno runtime
- Prefer `const` over `let`
- Use async/await over raw promises
- Type all function parameters and returns

### Supabase Edge Function Testability:

**1. Don't import edge-runtime types** - They break tests:
```typescript
// BAD - breaks test imports
import "@supabase/functions-js/edge-runtime.d.ts";

// GOOD - skip the import, Deno.serve works without it
// (just add a comment explaining why)
```

**2. Wrap Deno.serve in main check** - Prevents server starting during tests:
```typescript
// BAD - server starts when tests import this file
Deno.serve((req) => handleRequest(req));

// GOOD - only runs when executed directly
if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
```

**3. Use dependency injection** - Makes external calls mockable:
```typescript
// BAD - can't test without hitting real APIs
export async function processMessage(text: string) {
  const result = await fetch("https://api.example.com/...");
  return result;
}

// GOOD - inject dependencies for testability
export interface Deps {
  fetchApi: (url: string) => Promise<Response>;
}

export async function processMessage(text: string, deps: Deps) {
  const result = await deps.fetchApi("https://api.example.com/...");
  return result;
}
```

**4. Run tests from the function directory** - deno.json imports are relative:
```bash
# BAD - imports won't resolve from project root
deno test supabase/functions/telegram-webhook/

# GOOD - run from function directory where deno.json lives
cd /path/to/project/supabase/functions/telegram-webhook && deno test
```

### Deno Lint Rules:

**`require-await`** - Don't use `async` without `await`:
```typescript
// BAD - lint error: async without await
const mockFetch = async () => "result";

// GOOD - use Promise.resolve for sync mock returns
const mockFetch = () => Promise.resolve("result");

// GOOD - if you actually await something
const mockFetch = async () => {
  await someAsyncOp();
  return "result";
};
```

### Python (CLI tools):
- Follow PEP 8
- Use type hints
- Use `python-dotenv` for env vars

---

## UI Development Guidelines

Opinionated constraints for building better interfaces with agents.

### Stack
- **MUST** use Tailwind CSS defaults (spacing, radius, shadows) before custom values
- **MUST** use motion/react (formerly framer-motion) when JavaScript animation is required
- **SHOULD** use tw-animate-css for entrance and micro-animations in Tailwind CSS
- **MUST** use cn utility (clsx + tailwind-merge) for class logic
- **IMPORTANT**: shadcn/ui requires Tailwind v3, NOT v4. Always use Tailwind v3 when using shadcn components.

### Components
- **MUST** use accessible component primitives for anything with keyboard or focus behavior (Base UI, React Aria, Radix)
- **MUST** use the project's existing component primitives first
- **NEVER** mix primitive systems within the same interaction surface
- **SHOULD** prefer Base UI for new primitives if compatible with the stack
- **MUST** add an aria-label to icon-only buttons
- **NEVER** rebuild keyboard or focus behavior by hand unless explicitly requested

### Interaction
- **MUST** use an AlertDialog for destructive or irreversible actions
- **SHOULD** use structural skeletons for loading states
- **NEVER** use h-screen, use h-dvh
- **MUST** respect safe-area-inset for fixed elements
- **MUST** show errors next to where the action happens
- **NEVER** block paste in input or textarea elements

### Animation
- **NEVER** add animation unless it is explicitly requested
- **MUST** animate only compositor props (transform, opacity)
- **NEVER** animate layout properties (width, height, top, left, margin, padding)
- **SHOULD** avoid animating paint properties (background, color) except for small, local UI (text, icons)
- **SHOULD** use ease-out on entrance
- **NEVER** exceed 200ms for interaction feedback
- **MUST** pause looping animations when off-screen
- **MUST** respect prefers-reduced-motion
- **NEVER** introduce custom easing curves unless explicitly requested
- **SHOULD** avoid animating large images or full-screen surfaces

### Typography
- **MUST** use text-balance for headings and text-pretty for body/paragraphs
- **MUST** use tabular-nums for data
- **SHOULD** use truncate or line-clamp for dense UI
- **NEVER** modify letter-spacing (tracking-) unless explicitly requested

### Layout
- **MUST** use a fixed z-index scale (no arbitrary z-x)
- **SHOULD** use size-x for square elements instead of w-x + h-x

### Performance
- **NEVER** animate large blur() or backdrop-filter surfaces
- **NEVER** apply will-change outside an active animation
- **NEVER** use useEffect for anything that can be expressed as render logic

### Design
- **NEVER** use gradients unless explicitly requested
- **NEVER** use purple or multicolor gradients
- **NEVER** use glow effects as primary affordances
- **SHOULD** use Tailwind CSS default shadow scale unless explicitly requested
- **MUST** give empty states one clear next action
- **SHOULD** limit accent color usage to one per view
- **SHOULD** use existing theme or Tailwind CSS color tokens before introducing new ones

---

## Environment Variables

Never commit secrets. Use:
- `.env` for local development (gitignored)
- `.env.example` as a template (committed)
- Supabase secrets for production

---

## Supabase Edge Functions

### Deployment

Functions auto-deploy on push to main via GitHub Actions (see `.github/workflows/deploy-functions.yml`).

To manually deploy:
```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN supabase functions deploy telegram-webhook --project-ref aadqqdsclktlyeuweqrv
```

### Debugging

**Check function status:**
```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN supabase functions list --project-ref aadqqdsclktlyeuweqrv
```

**Check deployment version and timestamp:**
```bash
curl -s 'https://api.supabase.com/v1/projects/aadqqdsclktlyeuweqrv/functions/telegram-webhook' \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

The `updated_at` field (Unix timestamp in ms) shows when the function was last deployed. Compare against git commit timestamps to verify the deployed version matches your code.

**View logs:**
Logs are available in the Supabase Dashboard:
https://supabase.com/dashboard/project/aadqqdsclktlyeuweqrv/functions/telegram-webhook/logs

### Common Issues

1. **Code not taking effect** - Function wasn't redeployed after merge. Check `updated_at` timestamp vs git commit time.
2. **Function errors** - Check logs in Supabase Dashboard for stack traces.

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
8. **Verify**: Test the integration works (e.g., curl the API, check responses)
9. git commit -m "Add Deepgram voice transcription"
10. git push -u origin feature/voice-transcription
11. Create PR with summary
12. Wait for user to review and merge
13. TodoWrite: mark task as completed
14. git checkout main && git pull
```

### Setup Task Example:

```
User: "Set up Supabase project"

Agent:
1. Guide user through Supabase dashboard setup
2. Store credentials in .env
3. **Verify**: Test the connection works (curl the API endpoint)
4. Only after verification succeeds → close the bead
```
