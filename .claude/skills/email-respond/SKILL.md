---
name: handle-to-respond-paul
description: Process emails labeled 'to-respond-paul' - show thread in tmux panel, draft reply from dictation using AI, update labels. Interactive workflow for email triage.
---

# Email Response Workflow

Process email threads with the `to-respond-paul` label. For each thread: display in panel, get user dictation, generate AI draft, approve and save to Gmail drafts.

## Prerequisites

Environment variables in `.env`:
- `NYLAS_API_KEY`
- `NYLAS_GRANT_ID`
- `ANTHROPIC_API_KEY`

## Label IDs

| Label | Gmail ID | Purpose |
|-------|----------|---------|
| `to-respond-paul` | Label_139 | Emails needing response |
| `to-read-paul` | Label_138 | Emails to read (lower priority) |
| `drafted` | Label_215 | Response drafted, pending send |

---

## Tools

### email-canvas.py (Server Mode - Recommended)
Terminal panel with persistent process and FIFO IPC. Much faster due to caching and no process restarts.

```bash
# Start panel in server mode (run in tmux pane)
python3 .claude/skills/email-respond/email-canvas.py --server

# Send commands via FIFO (from main shell)
FIFO="/tmp/email-panel.fifo"

# Show thread list
echo '{"action":"list"}' > "$FIFO"

# Show loading indicator
echo '{"action":"loading","message":"Loading thread..."}' > "$FIFO"

# Show specific thread
echo '{"action":"show","thread_id":"THREAD_ID","index":1,"total":9}' > "$FIFO"

# Show thread with draft (base64-encode body for multiline safety)
BODY_B64=$(echo "Draft body text here" | base64)
echo "{\"action\":\"draft\",\"thread_id\":\"THREAD_ID\",\"body_b64\":\"$BODY_B64\",\"index\":1,\"total\":9}" > "$FIFO"

# Clear cache (force fresh API calls)
echo '{"action":"clear_cache"}' > "$FIFO"

# Exit server
echo '{"action":"exit"}' > "$FIFO"
```

**IPC Commands:**
| Action | Required | Optional | Description |
|--------|----------|----------|-------------|
| `list` | - | - | Show thread list |
| `show` | `thread_id` | `index`, `total`, `drafted`, `skipped` | Show single thread |
| `draft` | `thread_id` | `body_b64`, `body`, `index`, `total`, `drafted`, `skipped` | Show thread with draft |
| `loading` | - | `message` | Show loading indicator |
| `clear_cache` | - | - | Clear all cached data |
| `exit` | - | - | Shutdown server |

### panel-manager.sh (Legacy)
Manages the tmux panel. Located at `.claude/skills/email-respond/panel-manager.sh`

```bash
PANEL=".claude/skills/email-respond/panel-manager.sh"

# Create panel with persistent shell
bash "$PANEL" create

# Show thread list
bash "$PANEL" list

# Show specific thread
bash "$PANEL" thread THREAD_ID [INDEX] [TOTAL]

# Show thread with draft from file (avoids shell quoting issues)
bash "$PANEL" draft THREAD_ID DRAFT_FILE [INDEX] [TOTAL]

# Close panel
bash "$PANEL" close
```

### email-canvas.py (Standalone Mode)
Terminal panel display for one-off commands. Located at `.claude/skills/email-respond/email-canvas.py`

```bash
# List all threads
python3 .claude/skills/email-respond/email-canvas.py

# Show single thread
python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID

# Show thread with draft from file (preferred - avoids shell quoting)
python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID --draft-file /tmp/draft.txt

# Show thread with inline draft (legacy - may have quoting issues)
python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID --draft "Draft text"

# With position indicator
python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID --index 1 --total 9
```

### draft-email.py
AI draft generator. Located at project root. **Requires --dictation argument.**

```bash
# Generate full JSON with to, cc, subject, body
python3 draft-email.py THREAD_ID --dictation "User's response intent"

# Get just the body (for panel display)
python3 draft-email.py THREAD_ID --dictation "..." --body-only

# Iterate on a draft with feedback
python3 draft-email.py THREAD_ID --dictation "..." --feedback "Make it shorter" --previous-draft /tmp/draft.json
```

### create-gmail-draft.py
Creates Gmail draft from JSON file. Located at `.claude/skills/email-respond/create-gmail-draft.py`
**Use this instead of curl to avoid shell quoting issues with HTML.**

```bash
# Create draft from file
python3 .claude/skills/email-respond/create-gmail-draft.py DRAFT_FILE --thread-id THREAD_ID

# Create draft and update labels (remove to-respond-paul, add drafted)
python3 .claude/skills/email-respond/create-gmail-draft.py DRAFT_FILE --thread-id THREAD_ID --update-labels

# Create draft, update labels, and cleanup temp file
python3 .claude/skills/email-respond/create-gmail-draft.py DRAFT_FILE --thread-id THREAD_ID --update-labels --cleanup
```

---

## Workflow

### 1. Setup Panel (Server Mode)

Start the panel in server mode for best performance:

```bash
FIFO="/tmp/email-panel.fifo"

# Start panel server in tmux split pane
tmux split-window -h -p 40 "python3 .claude/skills/email-respond/email-canvas.py --server"

# Wait for FIFO to be ready
sleep 0.5

# Show initial thread list
echo '{"action":"list"}' > "$FIFO"
```

This creates a persistent panel process with caching. Subsequent updates are instant.

### 2. Fetch Thread List

Get threads for iteration:

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/threads?in=Label_139&limit=20" \
  -H "Authorization: Bearer $NYLAS_API_KEY"' | jq '[.data[] | {id, subject, message_ids}]'
```

Store the thread IDs and count for iteration.

### 3. For Each Thread

#### a. Update Panel to Show Thread

```bash
# Show loading, then thread (via FIFO)
echo '{"action":"loading","message":"Loading thread..."}' > "$FIFO"
echo "{\"action\":\"show\",\"thread_id\":\"$THREAD_ID\",\"index\":$INDEX,\"total\":$TOTAL}" > "$FIFO"
```

#### b. Ask User for Input

Present options to user:
- **"next"** or **"skip"** → Move to next thread (keep labels unchanged)
- **dictation** → User provides response guidance

#### c. Show Recipients (after dictation, before generating)

After user provides dictation, show the likely recipients before generating the draft:

```
📬 Recipients for this reply:
   To: John Smith <john@example.com>
   CC: Jane Doe <jane@example.com>, Team <team@example.com>

   Confirm or adjust? (enter to confirm, or specify changes)
```

To get recipients, look at the thread's latest message:
- **To**: Reply to the sender of the latest message (unless it's from Paul)
- **CC**: Include original CC recipients

User can adjust: "remove Jane from CC", "add Bob to CC", etc.

#### d. Generate Draft (after recipient confirmation)

```bash
# Store draft to temp file (ensures same draft shown in panel goes to Gmail)
DRAFT_FILE="/tmp/email-draft-${THREAD_ID}.json"

# Generate draft with user's dictation - returns JSON with to, cc, subject, body
python3 draft-email.py THREAD_ID --dictation "$USER_DICTATION" > "$DRAFT_FILE"
```

#### e. Update Panel with Draft

```bash
# Extract body and base64-encode for safe transport
DRAFT_BODY=$(jq -r '.body' "$DRAFT_FILE" | python3 -c "import sys; from html import unescape; import re; t=sys.stdin.read(); t=re.sub(r'<[^>]+>', '', t); print(unescape(t).strip())")
BODY_B64=$(echo "$DRAFT_BODY" | base64)

# Send to panel via FIFO
echo "{\"action\":\"draft\",\"thread_id\":\"$THREAD_ID\",\"body_b64\":\"$BODY_B64\",\"index\":$INDEX,\"total\":$TOTAL}" > "$FIFO"
```

Note: The panel displays plain text. The actual HTML body (with hyperlinks) is preserved in the temp file for creating the Gmail draft.

#### f. Ask User to Approve or Revise

- **"approve"** → Create Gmail draft and update labels
- **feedback** → Iterate on draft with feedback:

```bash
# If user gives feedback, iterate on the draft (preserves original dictation context)
python3 draft-email.py THREAD_ID \
  --dictation "$USER_DICTATION" \
  --feedback "$USER_FEEDBACK" \
  --previous-draft "$DRAFT_FILE" > "$DRAFT_FILE"

# Re-extract body and update panel
DRAFT_BODY=$(jq -r '.body' "$DRAFT_FILE" | sed 's/<[^>]*>//g')
```

### 4. On Approve

Use `create-gmail-draft.py` to create the draft, update labels, and cleanup in one command:

```bash
RESULT=$(python3 .claude/skills/email-respond/create-gmail-draft.py "$DRAFT_FILE" --thread-id THREAD_ID --update-labels --cleanup)
```

This script:
- Reads the draft JSON from the temp file
- Gets the latest message ID from the thread
- Creates a Gmail draft as a reply
- Updates labels (removes `to-respond-paul`, adds `drafted`)
- Deletes the temp file

**Capture the draft_id for session summary:**
```bash
DRAFT_ID=$(echo "$RESULT" | jq -r '.draft_id')
SUBJECT=$(echo "$RESULT" | jq -r '.subject')
# Add to drafts array for end-of-session summary
```

Increment `drafted_count` and store `{subject, draft_id}` in `drafts[]` array.
Then confirm to user and auto-advance to next thread.

### 5. On Skip

Increment `skipped_count`. If a draft was generated but not approved, delete the temp file:
```bash
rm -f "$DRAFT_FILE"
```

### 6. Session Summary

When all threads processed or user says "done", display the session summary:

```
✅ Session Complete!

📊 Summary: {drafted_count} drafted, {skipped_count} skipped

📝 Drafts to review:
1. {subject}
   https://mail.google.com/mail/u/0/#drafts?compose={draft_id}
2. {subject}
   https://mail.google.com/mail/u/0/#drafts?compose={draft_id}
...
```

The Gmail URL format is: `https://mail.google.com/mail/u/0/#drafts?compose=<draft_id>`

### 7. Cleanup

After showing session summary:

```bash
# Clean up any remaining temp draft files
rm -f /tmp/email-draft-*.json /tmp/email-draft-display-*.txt

# Exit panel server (cleans up FIFO automatically)
echo '{"action":"exit"}' > "$FIFO"
```

---

## User Commands

| Command | Action |
|---------|--------|
| `next` / `skip` | Move to next thread, keep current labels |
| `done` | Exit workflow |
| `approve` | After seeing draft, save to Gmail and advance |
| (any text) | Treated as dictation/feedback for draft generation |

---

## State Tracking

Track these variables during the workflow:

```
threads[]        - Array of {id, subject, message_ids}
current_index    - Current position (1-based)
total_threads    - Total count
user_dictation   - User's dictation for current thread
draft_file       - Path to temp file: /tmp/email-draft-{THREAD_ID}.json

# Session summary tracking
drafted_count    - Number of drafts created
skipped_count    - Number of threads skipped
drafts[]         - Array of {subject, draft_id} for summary display
```

**Important**: The draft is stored in a temp file to ensure the exact draft shown in the panel is sent to Gmail. Clean up temp files when skipping threads or finishing the workflow.

---

## Example Session

```
Claude: Setting up email panel...
        [Panel shows: 9 threads to respond]

        📧 Thread 1/9: Re: Paul / Mitch - Catch Up
        From: Bell, Mitch

        What would you like to say? (or: skip, done)

User: tell him the first report will be a static PDF, but for full
      engagement they'd get workspace access

Claude: Generating draft...
        [Panel updates to show draft]

        Does this look good? (approve / give feedback)

User: approve

Claude: ✓ Draft saved to Gmail
        ✓ Labels updated

        📧 Thread 2/9: The Lead x Archive agreement
        From: John Smith

        What would you like to say? (or: skip, done)

User: skip

Claude: Moving to next thread...

        📧 Thread 3/9: ...

... [more threads] ...

User: done

Claude: ✅ Session Complete!

        📊 Summary: 5 drafted, 4 skipped

        📝 Drafts to review:
        1. Re: Paul / Mitch - Catch Up
           https://mail.google.com/mail/u/0/#drafts?compose=r-7427271980476641806
        2. Re: Archive connect request
           https://mail.google.com/mail/u/0/#drafts?compose=r-7427271980476641807
        3. Re: Edelman
           https://mail.google.com/mail/u/0/#drafts?compose=r-7427271980476641808
        4. Re: Archive / Stripe - follow up
           https://mail.google.com/mail/u/0/#drafts?compose=r-7427271980476641809
        5. Re: Paul x Em Meet
           https://mail.google.com/mail/u/0/#drafts?compose=r-7427271980476641810
```

---

## Error Handling

- **API failure**: Show error message, allow retry or skip
- **Empty thread list**: Display "No emails to respond to" and exit
- **Draft generation failure**: Show error, allow user to retry or skip

---

## Recipient Handling

When creating the draft:
- Get recipients from the thread's `participants` field
- For a reply, typically reply to the sender of the last message
- Include original CC recipients if present
- User can override by mentioning specific recipients in dictation
