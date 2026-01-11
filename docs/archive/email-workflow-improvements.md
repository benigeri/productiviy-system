# Email Workflow Improvements - Technical Plan

> **Reference Document** for implementing fixes to the email response workflow.
> Created: 2026-01-08
> Related Beads: See section at end

## Executive Summary

Three critical issues identified during E2E testing of `/handle-to-respond-paul`:

| Issue | Severity | Root Cause | Solution |
|-------|----------|------------|----------|
| Draft Mismatch | **Critical** | AI called twice → different outputs | Single generation + temp file |
| Missing Dictation | **Critical** | User intent not passed to AI | Add `--dictation` argument |
| Panel Performance | **High** | Process restart per update, no caching | Persistent process + FIFO IPC |

## Architecture Overview

### Current (Broken)
```
User dictates → Agent runs draft-email.py (no dictation!) → Panel shows draft
User approves → Agent runs draft-email.py AGAIN → Different draft sent to Gmail
```

### Target Architecture
```
┌─────────────────────────────────────────────────────────────────────┐
│                          Claude Agent                               │
│                                                                     │
│  1. Collect dictation from user                                     │
│  2. Run draft-email.py --dictation "..." > /tmp/draft-XXX.json     │
│  3. Send to panel: echo '{"action":"draft",...}' > /tmp/panel.fifo │
│  4. On approve: read /tmp/draft-XXX.json → create Gmail draft       │
└─────────────────────────────────────────────────────────────────────┘
          │                              │
          │ Temp File                    │ Named Pipe (FIFO)
          │ (draft storage)              │ (panel commands)
          ▼                              ▼
┌─────────────────┐          ┌─────────────────────────────────────────┐
│ /tmp/draft.json │          │           Panel Process                 │
│ {to, cc, subj,  │          │  - Persistent (no restart)              │
│  body}          │          │  - Reads FIFO for commands              │
└─────────────────┘          │  - In-memory cache for API responses    │
                             │  - Loading indicators                   │
                             └─────────────────────────────────────────┘
```

---

## Issue #1: Draft Mismatch

### Problem Statement

When user approves a draft, a **different draft** is sent to Gmail because the AI is called twice:
1. First call: Generate draft for panel display
2. Second call: Generate draft for Gmail (different due to AI non-determinism)

### Root Cause Analysis

In the current workflow (SKILL.md), the agent:
```bash
# Step 1: Generate for display
DRAFT_BODY=$(python3 draft-email.py THREAD_ID --body-only)

# Step 2: On approve - REGENERATE (BUG!)
DRAFT_JSON=$(python3 draft-email.py THREAD_ID)  # Different output!
```

### Solution: Single Generation + Temp File Storage

**Principle**: Generate once, store, display from storage, send from storage.

**Flow:**
```
1. Generate draft with dictation → write to temp file
2. Extract body from temp file → display in panel
3. User approves → read full JSON from temp file → create Gmail draft
4. Cleanup temp file
```

### Implementation

**Temp file location**: `/tmp/email-draft-{THREAD_ID}.json`

**Step 1: Generate and Store**
```bash
DRAFT_FILE="/tmp/email-draft-${THREAD_ID}.json"
python3 draft-email.py "$THREAD_ID" --dictation "$DICTATION" > "$DRAFT_FILE"
```

**Step 2: Extract Body for Panel**
```bash
# Use Python for proper HTML→text conversion
DRAFT_BODY=$(python3 << 'PYEOF'
import json, sys
sys.path.insert(0, '.claude/skills/email-respond')
from email_canvas import html_to_text
with open(sys.argv[1]) as f:
    print(html_to_text(json.load(f)['body']))
PYEOF
"$DRAFT_FILE")
```

**Step 3: On Approve - Read Stored Draft**
```bash
# Read the SAME draft that was displayed
DRAFT_JSON=$(cat "$DRAFT_FILE")
TO=$(echo "$DRAFT_JSON" | jq -c '.to')
CC=$(echo "$DRAFT_JSON" | jq -c '.cc')
SUBJECT=$(echo "$DRAFT_JSON" | jq -r '.subject')
BODY=$(echo "$DRAFT_JSON" | jq -r '.body')

# Create Gmail draft with exact content
curl -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/drafts" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"to\": $TO, \"cc\": $CC, \"subject\": \"$SUBJECT\", \"body\": \"$BODY\", \"reply_to_message_id\": \"$MSG_ID\"}"
```

**Step 4: Cleanup**
```bash
rm -f "$DRAFT_FILE"
```

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Agent crashes before cleanup | Next workflow run cleans old files at start |
| User skips thread | Delete temp file immediately |
| User says "done" | Delete all temp files in `/tmp/email-draft-*.json` |
| Feedback iteration | Overwrite same temp file with new draft |

### Files to Modify

| File | Changes |
|------|---------|
| `SKILL.md` | Update workflow to use temp file pattern |

### Verification

- [ ] Generate draft → temp file exists at `/tmp/email-draft-{ID}.json`
- [ ] Panel shows body extracted from temp file
- [ ] Approve → Gmail draft body matches panel exactly (character-for-character)
- [ ] Skip → temp file deleted
- [ ] Done → all temp files deleted

---

## Issue #2: Missing Dictation

### Problem Statement

**The AI doesn't know what the user wants to say!**

Current `draft-email.py` accepts:
- `thread_id` (required)
- `--verbose`, `--body-only` (optional)

It does NOT accept the user's dictation, so the AI just guesses a response based on thread context.

### Root Cause Analysis

The prompt sent to the AI contains:
```
[guidelines]
---
[example emails]
---
[thread conversation]
```

Missing: **What does the user want to say?**

### Solution: Add Dictation Support

**New prompt structure:**
```
[guidelines]           # email-writing-guidelines.md
---
[example emails]       # paul-emails.txt
---
[thread conversation]  # Historical email thread
---
[user dictation]       # "Tell him yes, we can do the meeting next week"
```

### Implementation

**New CLI arguments:**
```python
parser.add_argument("--dictation", "-d", required=True,
                    help="User's dictation of what they want to say")
parser.add_argument("--feedback", "-f",
                    help="Feedback on previous draft (triggers iteration)")
parser.add_argument("--previous-draft",
                    help="Path to previous draft JSON (for feedback iterations)")
```

**Updated prompt builder:**
```python
def get_draft_prompt(thread_content: str, dictation: str) -> str:
    """Build prompt with guidelines, examples, thread, and dictation."""
    guidelines = load_guidelines()
    paul_emails = load_paul_emails()

    parts = [guidelines]

    if paul_emails:
        parts.append("\n---\n\n## Reference Examples (paul-emails.txt)\n")
        parts.append(paul_emails)

    parts.append("\n---\n\n## Email Thread to Respond To\n")
    parts.append(thread_content)

    parts.append("\n---\n\n## User's Dictation\n")
    parts.append("The user wants to respond with this intent. ")
    parts.append("Capture their key points while writing in Paul's voice:\n\n")
    parts.append(dictation)

    return "\n".join(parts)
```

**Multi-turn for feedback:**
```python
def generate_with_feedback(thread_content: str, dictation: str,
                           previous_draft: str, feedback: str) -> str:
    """Generate revised draft based on feedback."""
    messages = [
        {"role": "user", "content": get_draft_prompt(thread_content, dictation)},
        {"role": "assistant", "content": previous_draft},
        {"role": "user", "content": f"The user left this feedback, please iterate:\n\n{feedback}"}
    ]

    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2048,
        "messages": messages
    }
    # ... make API call ...
```

### Usage Examples

**Initial generation:**
```bash
python3 draft-email.py abc123 --dictation "Tell him yes, let's meet next Tuesday at 2pm"
```

**Feedback iteration:**
```bash
python3 draft-email.py abc123 \
  --dictation "Tell him yes, let's meet next Tuesday at 2pm" \
  --feedback "Make it shorter and more casual" \
  --previous-draft /tmp/email-draft-abc123.json
```

### Files to Modify

| File | Changes |
|------|---------|
| `draft-email.py` | Add `--dictation`, `--feedback`, `--previous-draft` args; update prompt builder |
| `draft-email_test.py` | Add tests for new arguments |
| `SKILL.md` | Update examples to include `--dictation` |

### Verification

- [ ] `--dictation` is required (error without it)
- [ ] Draft output reflects dictation key points
- [ ] `--feedback` with `--previous-draft` produces refined output
- [ ] Feedback iterations maintain conversation context

---

## Issue #3: Panel Performance

### Problem Statement

The email panel is slow and unreliable:
1. **3+ API calls per panel update** (thread + clean messages + full message)
2. **Process restart for each update** (Python killed and restarted)
3. **No caching** (27+ API calls for 9 threads)
4. **No loading indicators** (30s timeout feels like crash)
5. **Panel sometimes disappears** (tmux send-keys can fail silently)

### Root Cause Analysis

Current workflow (from SKILL.md):
```bash
# Kill current process
tmux send-keys -t {right} C-c

# Start new process with new arguments
tmux send-keys -t {right} "python3 email-canvas.py --thread-id X --draft 'text'" Enter
```

Problems:
- Full Python startup overhead each time
- No state preserved between updates
- All API responses discarded

### Solution: Persistent Process + Named Pipe IPC + Cache

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Claude Agent                                                        │
│                                                                     │
│   # Send commands via named pipe (no escaping issues!)              │
│   echo '{"action":"show","thread_id":"abc","body_b64":"..."}' \    │
│        > /tmp/email-panel.fifo                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Named Pipe (FIFO)
                              │ - Simple bash writes
                              │ - No escaping issues
                              │ - Kernel-level fast
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Panel Process (persistent in tmux pane)                             │
│                                                                     │
│   while True:                                                       │
│       line = fifo.readline()                                        │
│       cmd = json.loads(line)                                        │
│       handle_command(cmd)  # show_thread, show_draft, loading, etc │
│                                                                     │
│   Features:                                                         │
│   - In-memory API cache (threads, messages)                        │
│   - Loading indicator during API calls                             │
│   - Error recovery without crash                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Named Pipe (FIFO) vs Other Options

| Method | Simplicity | Reliability | Speed | Issues |
|--------|------------|-------------|-------|--------|
| **Named Pipe (FIFO)** | ✅ High | ✅ High | ✅ Fast | None for this use case |
| Unix Socket | Medium | High | Fast | More complex setup |
| HTTP Server | High | High | Medium | Port management |
| tmux send-keys | Low | ❌ Low | Fast | **Escaping nightmare** |
| File watching | High | Medium | Slow | Race conditions |

**tmux send-keys fails because:**
- Quotes in JSON break shell quoting
- Newlines in body text break line-based protocol
- Special characters (`$`, `` ` ``, `!`) cause expansion
- No error feedback if command fails

### IPC Protocol

**Commands (JSON over FIFO):**
```json
{"action": "list"}
{"action": "show", "thread_id": "abc123", "index": 1, "total": 9}
{"action": "draft", "thread_id": "abc123", "body_b64": "SGV5Li4u", "index": 1, "total": 9}
{"action": "loading", "message": "Generating draft..."}
{"action": "clear_cache"}
{"action": "exit"}
```

**Note:** `body_b64` is base64-encoded to handle multiline content safely.

### Implementation

**email-canvas.py changes:**

```python
import os
import json
import base64
from typing import Optional

# FIFO path
FIFO_PATH = "/tmp/email-panel.fifo"

# Global cache
_cache = {
    "threads": None,
    "threads_time": 0,
    "messages": {},      # thread_id -> cleaned messages
    "full_messages": {}, # message_id -> full message with body
}

CACHE_TTL = 300  # 5 minutes for thread list


def run_server():
    """Run in persistent server mode, reading commands from FIFO."""
    # Create FIFO if it doesn't exist
    if os.path.exists(FIFO_PATH):
        os.remove(FIFO_PATH)
    os.mkfifo(FIFO_PATH)

    print_loading("Panel ready. Waiting for commands...")

    try:
        while True:
            # Open FIFO (blocks until writer connects)
            with open(FIFO_PATH, 'r') as fifo:
                for line in fifo:
                    if not line.strip():
                        continue
                    try:
                        cmd = json.loads(line.strip())
                        handle_command(cmd)
                    except json.JSONDecodeError as e:
                        print(f"Invalid JSON: {e}", file=sys.stderr)
                    except Exception as e:
                        print(f"Error: {e}", file=sys.stderr)
    finally:
        # Cleanup
        if os.path.exists(FIFO_PATH):
            os.remove(FIFO_PATH)


def handle_command(cmd: dict):
    """Dispatch command to appropriate handler."""
    action = cmd.get("action")

    if action == "list":
        list_threads_cached()
    elif action == "show":
        show_thread_cached(
            cmd["thread_id"],
            index=cmd.get("index"),
            total=cmd.get("total")
        )
    elif action == "draft":
        body = base64.b64decode(cmd["body_b64"]).decode() if cmd.get("body_b64") else cmd.get("body", "")
        show_thread_cached(
            cmd["thread_id"],
            draft_text=body,
            index=cmd.get("index"),
            total=cmd.get("total")
        )
    elif action == "loading":
        print_loading(cmd.get("message", "Loading..."))
    elif action == "clear_cache":
        clear_cache()
    elif action == "exit":
        print_loading("Goodbye!")
        sys.exit(0)

    sys.stdout.flush()


def print_loading(message: str):
    """Clear screen and show loading indicator."""
    print("\033[2J\033[H", end="")  # Clear screen, cursor to top
    print()
    print(double_line())
    print(f"  ⏳ {message}")
    print(double_line())
    sys.stdout.flush()


def clear_cache():
    """Clear all cached data."""
    global _cache
    _cache = {
        "threads": None,
        "threads_time": 0,
        "messages": {},
        "full_messages": {},
    }


def list_threads_cached():
    """List threads with caching."""
    import time
    now = time.time()

    if _cache["threads"] is None or (now - _cache["threads_time"]) > CACHE_TTL:
        _cache["threads"] = nylas_get(f"/threads?in={TO_RESPOND_LABEL}&limit=20")
        _cache["threads_time"] = now

    # ... render using cached data ...


def get_thread_cached(thread_id: str) -> dict:
    """Get thread with caching."""
    if thread_id not in _cache["messages"]:
        _cache["messages"][thread_id] = nylas_get(f"/threads/{thread_id}")
    return _cache["messages"][thread_id]


def get_full_message_cached(message_id: str) -> dict:
    """Get full message (with HTML body) with caching."""
    if message_id not in _cache["full_messages"]:
        _cache["full_messages"][message_id] = nylas_get(f"/messages/{message_id}")
    return _cache["full_messages"][message_id]
```

**SKILL.md updates:**

```bash
### 1. Setup Panel (once at workflow start)

# Start panel in server mode
tmux split-window -h -p 40 "python3 .claude/skills/email-respond/email-canvas.py --server"

# Wait for FIFO to be ready
sleep 0.5

# Send initial list command
echo '{"action": "list"}' > /tmp/email-panel.fifo


### 3a. Show Thread

echo '{"action": "loading", "message": "Loading thread..."}' > /tmp/email-panel.fifo
echo "{\"action\": \"show\", \"thread_id\": \"$THREAD_ID\", \"index\": $INDEX, \"total\": $TOTAL}" > /tmp/email-panel.fifo


### 3d. Show Draft

# Base64 encode the body to handle newlines safely
BODY_B64=$(echo "$DRAFT_BODY" | base64)
echo "{\"action\": \"draft\", \"thread_id\": \"$THREAD_ID\", \"body_b64\": \"$BODY_B64\", \"index\": $INDEX, \"total\": $TOTAL}" > /tmp/email-panel.fifo


### 5. Cleanup (at workflow end)

echo '{"action": "exit"}' > /tmp/email-panel.fifo
```

### API Call Reduction

| Scenario | Before | After |
|----------|--------|-------|
| Show thread list | 1 call | 1 call (cached 5min) |
| Show thread | 3 calls | 1-3 calls (cached) |
| Show same thread again | 3 calls | **0 calls** (from cache) |
| 9 threads, 2 views each | 54+ calls | **~12 calls** |

### Files to Modify

| File | Changes |
|------|---------|
| `email-canvas.py` | Add `--server` mode, FIFO reader, caching, loading UI |
| `email-canvas_test.py` | Add tests for server mode commands |
| `SKILL.md` | Update all panel commands to use FIFO |

### Verification

- [ ] Panel starts in server mode without errors
- [ ] `echo '{"action":"list"}' > /tmp/email-panel.fifo` shows thread list
- [ ] Second view of same thread is instant (no loading indicator)
- [ ] `{"action":"loading","message":"..."}` shows loading spinner
- [ ] `{"action":"exit"}` cleanly closes panel
- [ ] FIFO file cleaned up on exit
- [ ] Panel survives invalid JSON (logs error, continues)

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: draft-email.py changes (Issue #2)                         │
│ - Add --dictation argument                                          │
│ - Add --feedback and --previous-draft for iterations               │
│ - Update prompt structure                                           │
│ - Write tests                                                       │
│ Time: 1 session                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 2: SKILL.md temp file workflow (Issue #1)                    │
│ - Update workflow to use temp file storage                         │
│ - Ensure single draft generation                                    │
│ - Add cleanup logic                                                 │
│ Time: 1 session                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 3: Panel refactor (Issue #3)                                 │
│ - Add --server mode to email-canvas.py                             │
│ - Implement FIFO IPC                                                │
│ - Add caching layer                                                 │
│ - Add loading indicators                                            │
│ - Update SKILL.md to use FIFO commands                             │
│ - Write tests                                                       │
│ Time: 2 sessions                                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 4: E2E Testing                                                │
│ - Run full /handle-to-respond-paul workflow                        │
│ - Verify all issues resolved                                        │
│ - Performance benchmarking                                          │
│ Time: 1 session                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Files Summary

| File | Issue(s) | Description |
|------|----------|-------------|
| `draft-email.py` | #2 | Add dictation/feedback args, update prompt |
| `draft-email_test.py` | #2 | Tests for new arguments |
| `email-canvas.py` | #3 | Server mode, FIFO, caching, loading |
| `email-canvas_test.py` | #3 | Tests for server mode |
| `SKILL.md` | #1, #3 | Temp file workflow, FIFO commands |
| `docs/email-workflow-plan.md` | - | Update status |

---

## Testing Checklist

### Unit Tests
- [ ] `draft-email.py --dictation` produces output with dictation points
- [ ] `draft-email.py` without `--dictation` shows clear error
- [ ] `--feedback` with `--previous-draft` works
- [ ] email-canvas.py `--server` mode starts without error
- [ ] All IPC commands work: list, show, draft, loading, exit
- [ ] Cache reduces API calls

### Integration Tests
- [ ] Full workflow: dictate → draft → approve → Gmail draft created
- [ ] Draft in Gmail matches panel display exactly
- [ ] Panel persists across multiple thread views
- [ ] Feedback iteration produces refined draft
- [ ] Cleanup removes all temp files

### Performance Tests
- [ ] Second view of thread is instant (<100ms)
- [ ] 9-thread workflow completes in <2 minutes
- [ ] No visible lag when switching threads

---

## Rollback Plan

If issues arise, the old workflow still works:
1. Remove `--server` flag usage from SKILL.md
2. Revert to process-restart pattern
3. Draft-email.py changes are additive (old usage still works)

---

## Related Beads

| Bead ID | Title | Status |
|---------|-------|--------|
| productiviy-system-126 | Draft mismatch between panel and Gmail | Open |
| productiviy-system-mhg | Debug draft-email.py prompts | Open |
| productiviy-system-smy | Improve tmux panel performance | Open |

---

## Appendix: IPC Protocol Reference

### Commands

| Action | Required Fields | Optional Fields | Description |
|--------|-----------------|-----------------|-------------|
| `list` | - | - | Show thread list |
| `show` | `thread_id` | `index`, `total` | Show single thread |
| `draft` | `thread_id` | `body_b64`, `body`, `index`, `total` | Show thread with draft |
| `loading` | - | `message` | Show loading indicator |
| `clear_cache` | - | - | Clear all cached data |
| `exit` | - | - | Shutdown panel |

### Examples

```bash
# Show loading
echo '{"action":"loading","message":"Generating draft..."}' > /tmp/email-panel.fifo

# Show thread 2 of 9
echo '{"action":"show","thread_id":"abc123","index":2,"total":9}' > /tmp/email-panel.fifo

# Show draft (with base64 body)
BODY_B64=$(echo "Hey Mitch,

Thanks for the note." | base64)
echo "{\"action\":\"draft\",\"thread_id\":\"abc123\",\"body_b64\":\"$BODY_B64\",\"index\":2,\"total\":9}" > /tmp/email-panel.fifo

# Exit
echo '{"action":"exit"}' > /tmp/email-panel.fifo
```
