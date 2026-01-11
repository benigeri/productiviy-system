# Email Workflow Improvements Plan

## Summary

Comprehensive improvements to the email workflow system with focus on:
- Simple, scalable architecture using `email_utils.py` at project root
- Test-driven development with pytest
- Claude Code optimizations for efficient building

---

## Architecture Decision: `email_utils.py` at Project Root

### Why NOT `.claude/lib/email/`

1. **Convention violation**: `.claude/` is for Claude Code configs, not application code
2. **Fragile imports**: `sys.path.insert()` breaks IDE support and is error-prone
3. **Name collision**: `from email import ...` conflicts with Python's builtin

### Recommended Structure

```
/Users/benigeri/Projects/productiviy-system/
├── email_utils.py                    # NEW: All shared functions
├── email_utils_test.py               # NEW: Tests for shared code
├── draft-email.py                    # Refactored: imports from email_utils
├── .claude/
│   └── skills/
│       ├── email-respond/
│       │   ├── email-canvas.py       # Refactored: imports from email_utils
│       │   ├── create-gmail-draft.py # Refactored: imports from email_utils
│       │   └── ...
│       └── compose-email/            # NEW skill
│           ├── SKILL.md
│           └── compose-draft.py
```

### Why This Works

Scripts are invoked as: `python3 .claude/skills/email-respond/email-canvas.py`
- Working directory = project root
- Python finds `email_utils.py` automatically
- No `sys.path` hacking needed

---

## Phase 1: Bug Fixes (P0)

### 1.1 Fix Tmux Pane Width

**File:** `.claude/skills/email-respond/panel-manager.sh` (line 48)

**Change:**
```bash
# From: percentage-based (varies with terminal size)
new_pane_id=$(tmux split-window -h -p 40 -d -P -F '#{pane_id}')

# To: fixed character width
new_pane_id=$(tmux split-window -h -l 102 -d -P -F '#{pane_id}')
```

### 1.2 Fix Line Spacing in Draft Preview

**File:** `.claude/skills/email-respond/email-canvas.py` (lines 204-220)

**Problem:** Line 215 `if line_text:` discards blank lines within paragraphs.

**Fix:**
```python
def wrap_text(text: str, width: int = PANEL_WIDTH - 4) -> str:
    paragraphs = text.strip().split("\n\n")
    wrapped_paragraphs = []
    for para in paragraphs:
        lines = para.split("\n")
        wrapped_lines = []
        for line in lines:
            line_text = " ".join(line.split())
            if line_text:
                if len(line_text) > width:
                    wrapped_lines.append(textwrap.fill(line_text, width=width))
                else:
                    wrapped_lines.append(line_text)
            else:
                wrapped_lines.append("")  # PRESERVE blank lines
        if wrapped_lines:
            wrapped_paragraphs.append("\n".join(wrapped_lines))
    return "\n\n".join(wrapped_paragraphs)
```

---

## Phase 2: Shared Library Extraction (P1)

### 2.1 Create `email_utils.py`

**Location:** Project root (alongside `draft-email.py`)

**Contents (~150 lines):**

```python
# email_utils.py - Shared utilities for email workflow
"""Shared Nylas API client, formatting, and draft utilities."""

import os
import sys
from datetime import datetime
from typing import Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

# === Configuration ===
NYLAS_API_KEY = os.getenv("NYLAS_API_KEY")
NYLAS_GRANT_ID = os.getenv("NYLAS_GRANT_ID")
NYLAS_BASE_URL = "https://api.us.nylas.com/v3"
REQUEST_TIMEOUT = 30

# Label IDs
LABEL_TO_RESPOND = "Label_139"
LABEL_TO_READ = "Label_138"
LABEL_DRAFTED = "Label_215"

# Folders that can't be modified via API
UNSETTABLE_FOLDERS = {"INBOX", "SENT", "DRAFTS", "TRASH", "SPAM", "STARRED", "IMPORTANT"}

# === Environment Check ===
def check_env(*required: str) -> None:
    """Check required env vars exist, exit if missing."""
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        print(f"Error: Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

# === Nylas API ===
def nylas_get(endpoint: str) -> dict:
    """GET request to Nylas API."""
    ...

def nylas_put(endpoint: str, payload: dict) -> dict:
    """PUT request to Nylas API."""
    ...

def nylas_post(endpoint: str, payload: dict) -> dict:
    """POST request to Nylas API."""
    ...

def get_thread(thread_id: str) -> dict:
    """Fetch thread by ID."""
    return nylas_get(f"/threads/{thread_id}")

def clean_messages(message_ids: List[str]) -> List[Dict]:
    """Batch clean messages (20 per request max)."""
    ...

# === Label Management ===
def update_thread_labels(thread_id: str, add: List[str], remove: List[str]) -> None:
    """Update labels on all messages in a thread."""
    ...

# === Formatting ===
def format_participant(p: dict) -> str:
    """Format as 'Name <email>' or just 'email'."""
    name, email = p.get("name", ""), p.get("email", "")
    return f"{name} <{email}>" if name and name != email else email

def format_date(timestamp: int) -> str:
    """Format Unix timestamp to 'Jan 08, 10:30 AM'."""
    if not timestamp:
        return "Unknown"
    return datetime.fromtimestamp(timestamp).strftime("%b %d, %I:%M %p")

# === Draft Utilities ===
def normalize_recipient(r) -> dict:
    """Normalize recipient to {email, name} format."""
    if isinstance(r, str):
        return {"email": r, "name": ""}
    return {"email": r.get("email", ""), "name": r.get("name", "")}

def normalize_draft(draft: dict) -> dict:
    """Normalize all recipients in draft."""
    ...

def atomic_write(path: str, content: str) -> None:
    """Write file atomically via temp file + rename."""
    ...
```

### 2.2 Create `email_utils_test.py`

**Location:** Project root

**Framework:** pytest (consistent with existing tests)

```python
# email_utils_test.py
"""Tests for email_utils shared library."""

import pytest
from email_utils import (
    format_participant,
    format_date,
    normalize_recipient,
    normalize_draft,
    check_env,
)

class TestFormatParticipant:
    def test_with_name_and_email(self):
        result = format_participant({"name": "John Doe", "email": "john@example.com"})
        assert result == "John Doe <john@example.com>"

    def test_with_email_only(self):
        result = format_participant({"email": "john@example.com"})
        assert result == "john@example.com"

    def test_name_same_as_email(self):
        result = format_participant({"name": "john@example.com", "email": "john@example.com"})
        assert result == "john@example.com"

class TestFormatDate:
    def test_valid_timestamp(self):
        # Jan 1, 2025 12:00 PM UTC
        result = format_date(1735732800)
        assert "Jan" in result and "12:00" in result

    def test_zero_timestamp(self):
        assert format_date(0) == "Unknown"

class TestNormalizeRecipient:
    def test_string_input(self):
        result = normalize_recipient("john@example.com")
        assert result == {"email": "john@example.com", "name": ""}

    def test_dict_input(self):
        result = normalize_recipient({"email": "john@example.com", "name": "John"})
        assert result == {"email": "john@example.com", "name": "John"}

# Run: pytest email_utils_test.py -v
```

### 2.3 Refactor Existing Scripts

**Files to update:**
- `draft-email.py` - Remove ~100 lines of duplicated code
- `.claude/skills/email-respond/email-canvas.py` - Remove ~80 lines
- `.claude/skills/email-respond/create-gmail-draft.py` - Remove ~60 lines

**Import pattern:**
```python
from email_utils import (
    check_env,
    nylas_get,
    clean_messages,
    format_participant,
    format_date,
    normalize_draft,
    LABEL_TO_RESPOND,
    LABEL_DRAFTED,
)
```

---

## Phase 3: Fix Forwarding (P1)

**Beads Issue:** `productiviy-system-gvp`

### 3.1 Add Forward Mode to `draft-email.py`

**New arguments:**
```python
parser.add_argument("--forward", action="store_true",
    help="Forward mode: include full thread in body")
parser.add_argument("--forward-to",
    help="Recipient email for forward")
```

**New function:**
```python
def build_forward_body(thread: dict, messages: list, intro: str) -> str:
    """Build Gmail-style forward body."""
    # Gmail format: <div class="gmail_quote"> with forwarded header
    ...
```

### 3.2 Update `create-gmail-draft.py`

**Change:** Skip `reply_to_message_id` for forwards:
```python
is_forward = draft.get("action") == "forward"
if not is_forward:
    payload["reply_to_message_id"] = latest_message_id
```

### 3.3 Add Forward Tests

**File:** `draft-email_test.py`

```python
class TestForwardMode:
    def test_forward_body_includes_original(self):
        ...
    def test_forward_subject_has_fwd_prefix(self):
        ...
    def test_forward_no_reply_to_message_id(self):
        ...
```

---

## Phase 4: Speed Improvements (P1)

### Top 2 Recommendations

### 4.1 Tmux Hotkeys for Instant Actions

**Rationale:** Eliminates ~2-3s of agent thinking per action

**Hotkeys:**
- `Ctrl+A` = approve draft
- `Ctrl+S` = skip thread
- `Ctrl+D` = done (exit workflow)

**Implementation in `panel-manager.sh`:**
```bash
setup_hotkeys() {
    tmux bind-key -n C-a run-shell "echo 'approve' > /tmp/email-hotkey.txt"
    tmux bind-key -n C-s run-shell "echo 'skip' > /tmp/email-hotkey.txt"
    tmux bind-key -n C-d run-shell "echo 'done' > /tmp/email-hotkey.txt"
}

cleanup_hotkeys() {
    tmux unbind-key -n C-a 2>/dev/null || true
    tmux unbind-key -n C-s 2>/dev/null || true
    tmux unbind-key -n C-d 2>/dev/null || true
    rm -f /tmp/email-hotkey.txt
}
```

**SKILL.md workflow update:**
```markdown
Before prompting user, check for hotkey:
```bash
if [ -f /tmp/email-hotkey.txt ]; then
    ACTION=$(cat /tmp/email-hotkey.txt)
    rm /tmp/email-hotkey.txt
    # Process immediately
fi
```
```

### 4.2 Pre-fetch Next Thread

**Rationale:** Saves ~1-2s per thread by fetching while user reviews

**New file:** `prefetch.py`
```python
#!/usr/bin/env python3
"""Pre-fetch threads in background."""

from concurrent.futures import ThreadPoolExecutor
from email_utils import get_thread, clean_messages
import json
import os

CACHE_DIR = "/tmp/email-prefetch"

def prefetch_thread(thread_id: str) -> None:
    """Fetch and cache a thread."""
    cache_file = f"{CACHE_DIR}/{thread_id}.json"
    if os.path.exists(cache_file):
        return

    os.makedirs(CACHE_DIR, exist_ok=True)
    thread = get_thread(thread_id)
    messages = clean_messages(thread.get("message_ids", []))

    with open(cache_file, "w") as f:
        json.dump({"thread": thread, "messages": messages}, f)

def get_cached(thread_id: str) -> dict:
    """Get from cache or fetch live."""
    cache_file = f"{CACHE_DIR}/{thread_id}.json"
    if os.path.exists(cache_file):
        with open(cache_file) as f:
            return json.load(f)
    return None
```

**Usage in workflow:**
```bash
# At start: prefetch all threads in background
python3 prefetch.py $THREAD_IDS &

# When showing thread: check cache first
CACHED=$(python3 -c "from prefetch import get_cached; print(get_cached('$THREAD_ID'))")
```

---

## Phase 5: Net-New Email Composition (P2)

### New Skill: `/compose-email`

**Location:** `.claude/skills/compose-email/`

### 5.1 `SKILL.md`

```yaml
---
name: compose-email
description: Compose new emails from scratch with AI assistance
---

# Email Composition Workflow

## CLI Tool

```bash
python3 .claude/skills/compose-email/compose-draft.py \
  --to "recipient@example.com" \
  --subject "Meeting request" \
  --dictation "I want to schedule a call..."
```

## Workflow

1. User provides: recipient, subject, dictation
2. AI generates draft in Paul's voice
3. Display in panel for review
4. Approve or iterate
5. Create Gmail draft
```

### 5.2 `compose-draft.py`

```python
#!/usr/bin/env python3
"""Generate new email draft from dictation."""

import argparse
import json
import sys
sys.path.insert(0, "../..")  # For email_utils
from email_utils import normalize_draft, atomic_write

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", "-t", required=True)
    parser.add_argument("--cc")
    parser.add_argument("--subject", "-s", required=True)
    parser.add_argument("--dictation", "-d", required=True)
    parser.add_argument("--output", "-o")
    parser.add_argument("--body-only", action="store_true")

    args = parser.parse_args()

    # Generate draft via Anthropic
    draft = generate_compose_draft(
        to=args.to.split(","),
        cc=args.cc.split(",") if args.cc else [],
        subject=args.subject,
        dictation=args.dictation,
    )

    draft = normalize_draft(draft)
    output = draft["body"] if args.body_only else json.dumps(draft, indent=2)

    if args.output:
        atomic_write(args.output, output)
    else:
        print(output)
```

### 5.3 Tests

**File:** `.claude/skills/compose-email/compose-draft_test.py`

```python
class TestComposeDraft:
    def test_requires_to_subject_dictation(self):
        ...
    def test_output_includes_all_recipients(self):
        ...
    def test_body_only_flag(self):
        ...
```

---

## Phase 6: Claude Code Configuration

### 6.1 Update Pre-commit Hook

**File:** `.claude/hooks/pre-commit-checks.py`

**Add Python test check:**
```python
# Run pytest for Python files
if any(f.endswith(".py") for f in changed_files):
    result = subprocess.run(
        ["pytest", "email_utils_test.py", "-v", "--tb=short"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("Python tests failed:")
        print(result.stdout)
        sys.exit(1)
```

### 6.2 Add Test Permission to settings.local.json

**File:** `.claude/settings.local.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(pytest:*)",
      ...existing permissions...
    ]
  }
}
```

### 6.3 Add Test Commands to CLAUDE.md

**Add to CLAUDE.md:**
```markdown
## Python Tests

Run email utility tests:
```bash
pytest email_utils_test.py -v
```

Run all Python tests:
```bash
pytest *_test.py -v
```
```

---

## Phase 7: Linear Integration (Future)

### Overview

Linear for Agents (May 2025) provides:
- OAuth with `app:assignable` scope
- Agent Sessions for structured interactions
- Non-billable agent seats

### Integration Points

| Email Event | Linear Action |
|-------------|---------------|
| Draft approved | Create "Follow up: {subject}" issue |
| Forward sent | Link to existing issue |

### Future Implementation

**File:** `linear_utils.py`

```python
LINEAR_API = "https://api.linear.app/graphql"

def create_issue(title: str, description: str, team_id: str) -> dict:
    """Create Linear issue from email context."""
    ...
```

---

## Implementation Sequence

| # | Phase | Effort | Test Coverage |
|---|-------|--------|---------------|
| 1 | Fix tmux width | 30 min | Manual |
| 2 | Fix line spacing | 30 min | Add test |
| 3 | Create email_utils.py | 3 hrs | email_utils_test.py |
| 4 | Refactor existing scripts | 2 hrs | Verify existing tests pass |
| 5 | Fix forwarding | 4 hrs | draft-email_test.py |
| 6 | Tmux hotkeys | 2 hrs | Manual |
| 7 | Compose skill | 4 hrs | compose-draft_test.py |
| 8 | Pre-fetch | 2 hrs | prefetch_test.py |
| 9 | Claude configs | 1 hr | N/A |

**Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

---

## Verification Checklist

### Phase 1-2 (Bug Fixes)
- [ ] Tmux pane is 102 chars wide
- [ ] Draft preview preserves line breaks
- [ ] `pytest email_utils_test.py` passes

### Phase 3-4 (Core Features)
- [ ] `draft-email.py --forward` creates forward body
- [ ] Forward has "Fwd:" prefix, no `reply_to_message_id`
- [ ] Existing tests still pass after refactor

### Phase 5-6 (Speed)
- [ ] `Ctrl+A/S/D` trigger instant actions
- [ ] Pre-fetched threads load faster

### Phase 7 (Compose)
- [ ] `/compose-email` skill works end-to-end
- [ ] `compose-draft.py --to --subject --dictation` generates valid draft

---

## Critical Files

| File | Changes |
|------|---------|
| `email_utils.py` | NEW - shared library |
| `email_utils_test.py` | NEW - tests |
| `panel-manager.sh` | Width fix, hotkeys |
| `email-canvas.py` | Line spacing fix, refactor imports |
| `draft-email.py` | Forward mode, refactor imports |
| `create-gmail-draft.py` | Forward handling, refactor imports |
| `prefetch.py` | NEW - background pre-fetch |
| `.claude/skills/compose-email/` | NEW skill directory |
| `.claude/hooks/pre-commit-checks.py` | Add pytest |
| `CLAUDE.md` | Add Python test docs |
