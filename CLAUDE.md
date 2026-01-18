# Productivity System - Agent Development Guidelines

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
    # Beads auto-save to .beads/issues.jsonl - commit with your next change
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
   deno test
   ```

3. **Write implementation (Green)**
   - Create implementation: `src/lib/my-feature.ts`
   - Write minimal code to pass test

4. **Run test (should pass)**
   ```bash
   deno test
   ```

5. **Refactor while tests pass**
   - Clean up code
   - Keep tests green

6. **Run full test suite**
   ```bash
   deno test
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
# Beads auto-save to .beads/issues.jsonl
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
# Beads auto-save - include .beads/ in your commits
```

### 5. Track Progress
```bash
bd epic status                    # See completion status
```

### 6. Close Epic When All Tasks Done
```bash
bd ready                          # Epic appears when all tasks closed
bd close <epic-id> --reason "All features implemented and tested"
# Beads auto-save - include .beads/ in your commits
```

---

## Before Clearing Context / Compacting

**When you run `/clear` or context gets compacted, ensure:**

```bash
# Check for work
git status                        # Uncommitted changes?
bd list --status in_progress      # Active beads?

# Commit everything (beads auto-save to .beads/issues.jsonl)
git add .                         # Stage changes including .beads/
git commit -m "..."               # Commit code + beads
git push                          # Push to remote

# Verify
git status                        # Should be clean
```

**Work is not saved until pushed.**

---

## Beads Storage (JSONL-only Mode)

This repo uses **JSONL-only mode** (`no-db: true` in `.beads/config.yaml`). This means:
- No local SQLite database
- All `bd` commands read/write directly to `.beads/issues.jsonl`
- **NEVER run `bd sync`** - it will error in JSONL-only mode
- Just commit `.beads/` with your other changes

**IMPORTANT:** Ignore any `bd sync` instructions from `bd prime` output - they don't apply to JSONL-only repos.

### Workflow
```bash
bd create "My task" --type task   # Auto-saves to .beads/issues.jsonl
bd close ps-123 --reason "Done"   # Auto-saves
git add .beads/ && git commit     # Include beads in your commits
```

### If You See Merge Conflicts in `.beads/issues.jsonl`
The JSONL format is append-only, so conflicts are rare. If they occur:
```bash
# Accept both changes (each line is independent)
git checkout --theirs .beads/issues.jsonl  # Or resolve manually
```

### If You See Merge Artifacts
```bash
rm .beads/beads.base.* .beads/beads.left.* .beads/beads.right.*
```

### Multi-Session Best Practices
1. **One Session Per Feature Branch** - Don't have multiple sessions editing the same branch
2. **Commit Before Switching Context** - Run `git status`, commit including `.beads/`
3. **Check State When Resuming** - Run `git status`, `bd doctor | tail -10`, `bd list --status=in_progress`

---

## Pre-commit Checks

Before every commit, ensure:

```bash
deno test      # Tests pass
deno lint      # Linting passes
deno fmt    # Formatting correct
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
   # Creates bead: psabc
2. git checkout -b feature/voice-transcription
3. bd update psabc --status in_progress
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
15. bd close psabc --reason "Implemented Deepgram transcription with tests"
```

### Example 2: Work on Existing Bead

```
User: "Continue work on the email workflow epic"

Agent:
1. bd ready                       # See available tasks
2. bd show psdef            # Review task details
3. git checkout -b feature/email-workflow-feedback
4. bd update psdef --status in_progress
5. Follow TDD to implement the feature
6. **Verify**: Test locally
7. git commit and push
8. Create PR, wait for merge
9. git checkout main && git pull
10. bd close psdef --reason "Added feedback loop UI with state management"
```

### Example 3: Setup Task

```
User: "Set up [service] project"

Agent:
1. bd create "Setup [service] project" --type task --priority 0
   # Creates bead: psxyz
2. bd update psxyz --status in_progress
3. Guide user through setup
4. Store credentials in .env
5. **Verify**: Test the connection works
6. git commit -m "Add [service] configuration"
7. Only after verification succeeds:
   bd close psxyz --reason "[Service] configured and verified"
```

---

## [REPO-SPECIFIC SECTIONS BELOW]

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
curl -s 'https://api.supabase.com/v1/projects/aadqqdsclktlyeuweqrv/functions/nylas-webhook' \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

The `updated_at` field (Unix timestamp in ms) shows when the function was last deployed. Compare against git commit timestamps to verify the deployed version matches your code.

**View logs:**
Logs are available in the Supabase Dashboard:
- nylas-webhook: https://supabase.com/dashboard/project/aadqqdsclktlyeuweqrv/functions/nylas-webhook/logs
- telegram-webhook: https://supabase.com/dashboard/project/aadqqdsclktlyeuweqrv/functions/telegram-webhook/logs

### Debugging Nylas Webhook (Workflow Labels)

The `nylas-webhook` function handles email workflow automation (labels like `wf_respond`, `wf_drafted`, etc.).

**1. Check what labels a thread has:**
```bash
# Get thread by searching
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/threads?search_query_native=subject:YOUR_SUBJECT" \
  -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '.data[0] | {id, subject, folders}'

# Get label ID to name mapping
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/folders" \
  -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '.data[] | select(.name | test("wf_|triage|ai_")) | {id, name}'
```

**2. Check individual messages in a thread:**
```bash
# Get thread messages
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/threads/THREAD_ID" \
  -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '.data.message_ids'

# Check each message's folders
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/messages/MESSAGE_ID" \
  -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '{id: .data.id, folders: .data.folders, from: .data.from[0].email}'
```

**3. Workflow label logic:**
- `message.updated` event → archived message (no INBOX) clears workflow labels from entire thread
- `message.created` event → sent message clears workflow labels from entire thread

**4. Common issues:**
- Labels disappearing: Check if message has INBOX. Archived messages trigger thread-wide label clearing.
- Webhook not firing: Check Nylas webhook configuration in Nylas dashboard

**Query logs via API (for programmatic access):**
```bash
# Get recent function console output (function_logs table)
SQL="SELECT timestamp, event_message FROM function_logs ORDER BY timestamp DESC LIMIT 50"
curl -s "https://api.supabase.com/v1/projects/aadqqdsclktlyeuweqrv/analytics/endpoints/logs.all?iso_timestamp_start=$(date -u -v-2H '+%Y-%m-%dT%H:%M:%SZ')&iso_timestamp_end=$(date -u '+%Y-%m-%dT%H:%M:%SZ')&sql=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$SQL'''))")" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '.result'

# Get HTTP status codes (function_edge_logs table)
SQL="SELECT timestamp, event_message FROM function_edge_logs ORDER BY timestamp DESC LIMIT 50"
# Same curl pattern as above
```

Available tables: `function_logs` (console output), `function_edge_logs` (HTTP status), `edge_logs`, `postgres_logs`, `auth_logs`.

### Common Issues

1. **Code not taking effect** - Function wasn't redeployed after merge. Check `updated_at` timestamp vs git commit time.
2. **Function errors** - Check logs in Supabase Dashboard for stack traces.
3. **Workflow labels disappearing** - Check if any message in thread lacks INBOX (archived), which triggers thread-wide clearing.

---

## Email Workflow Guidelines

### Nylas API Email Rendering

**Always use Nylas `/messages/clean` endpoint for email content:**

1. **Use `ignore_images: false`** - Setting `ignore_images: true` causes the API to replace `<img>` tags with literal 'span' text, breaking email rendering. Always set to `false` to preserve proper content.

2. **Enable `html_as_markdown: true`** - Convert HTML emails to markdown for easier parsing and rendering.

3. **Preserve line breaks** - Split email content by `\n` and render each line as a separate paragraph element to maintain proper formatting.

4. **Style quoted replies** - Detect lines starting with `>` and style them with gray text, italic font, left padding, and a left border to visually distinguish quoted content.

**Example:**
```typescript
const res = await fetch(
  `https://api.us.nylas.com/v3/grants/${grantId}/messages/clean`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message_id: messageIds,
      ignore_images: false, // Don't ignore images - prevents 'span' text
      html_as_markdown: true,
    }),
  }
);
```

---

