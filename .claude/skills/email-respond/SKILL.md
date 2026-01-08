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

### email-canvas.py
Terminal panel display. Located at `.claude/skills/email-respond/email-canvas.py`

```bash
# List all threads
python3 .claude/skills/email-respond/email-canvas.py

# Show single thread
python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID

# Show thread with draft
python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID --draft "Draft text here"

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

---

## Workflow

### 1. Setup Panel

Create a tmux split pane for the email canvas:

```bash
tmux split-window -h -p 40 "python3 .claude/skills/email-respond/email-canvas.py; read"
```

This shows the thread list. Note the total count and thread IDs.

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
tmux send-keys -t {right} C-c
tmux send-keys -t {right} "python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID --index N --total TOTAL" Enter
```

#### b. Ask User for Input

Present options to user:
- **"next"** or **"skip"** → Move to next thread (keep labels unchanged)
- **dictation** → User provides response guidance

#### c. Generate Draft (if user dictated)

```bash
# Store draft to temp file (ensures same draft shown in panel goes to Gmail)
DRAFT_FILE="/tmp/email-draft-${THREAD_ID}.json"

# Generate draft with user's dictation - returns JSON with to, cc, subject, body
python3 draft-email.py THREAD_ID --dictation "$USER_DICTATION" > "$DRAFT_FILE"

# Extract body for panel display (strip HTML tags for readability)
DRAFT_BODY=$(jq -r '.body' "$DRAFT_FILE" | sed 's/<[^>]*>//g')
```

#### d. Update Panel with Draft

```bash
tmux send-keys -t {right} C-c
tmux send-keys -t {right} "python3 .claude/skills/email-respond/email-canvas.py --thread-id THREAD_ID --draft '$DRAFT_BODY' --index N --total TOTAL" Enter
```

Note: The panel displays plain text. The actual HTML body (with hyperlinks) is preserved in `DRAFT_JSON` for creating the Gmail draft.

#### e. Ask User to Approve or Revise

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

#### a. Get Thread Details for Draft Creation

Read the stored draft from the temp file (`$DRAFT_FILE` from step 3c):

```bash
# Extract fields from stored draft
TO_JSON=$(jq -c '.to' "$DRAFT_FILE")
CC_JSON=$(jq -c '.cc' "$DRAFT_FILE")
SUBJECT=$(jq -r '.subject' "$DRAFT_FILE")
BODY_HTML=$(jq -r '.body' "$DRAFT_FILE")
```

Also fetch the thread to get the latest message ID:

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/threads/THREAD_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"' | jq '{message_ids}'
```

Get the latest message ID (last in `message_ids` array) for `reply_to_message_id`.

#### b. Create Gmail Draft

Use the fields extracted from the temp file:

```bash
bash -c 'source .env && curl -s -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/drafts" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"subject\": \"$SUBJECT\",
    \"to\": $TO_JSON,
    \"cc\": $CC_JSON,
    \"reply_to_message_id\": \"LATEST_MESSAGE_ID\",
    \"body\": \"$BODY_HTML\"
  }"'
```

The `body` is already HTML formatted with hyperlinks.

#### b2. Cleanup Temp File

```bash
rm -f "$DRAFT_FILE"
```

#### c. Update Labels on Latest Message

Remove `to-respond-paul` (Label_139), add `drafted` (Label_215):

```bash
bash -c 'source .env && curl -s -X PUT "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/messages/MESSAGE_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"folders\": [\"INBOX\", \"Label_215\"]}"'
```

Note: Fetch current folders first if you need to preserve other labels.

#### d. Confirm and Advance

Tell user the draft was created, then auto-advance to next thread.

### 5. Cleanup

When all threads processed or user says "done":

```bash
# Clean up any remaining temp draft files
rm -f /tmp/email-draft-*.json

# Close the panel
tmux send-keys -t {right} C-c
tmux send-keys -t {right} "exit" Enter
```

When user skips a thread (no draft generated), no cleanup needed for that thread.
When user skips after seeing a draft, delete that thread's temp file:
```bash
rm -f "$DRAFT_FILE"
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
