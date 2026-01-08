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

### panel-manager.sh
Manages the tmux panel reliably. Located at `.claude/skills/email-respond/panel-manager.sh`

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

### email-canvas.py
Terminal panel display. Located at `.claude/skills/email-respond/email-canvas.py`

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

### 1. Setup Panel

Create a tmux split pane with a persistent shell:

```bash
PANEL=".claude/skills/email-respond/panel-manager.sh"
bash "$PANEL" create
bash "$PANEL" list
```

This creates a panel and shows the thread list. The panel uses a persistent shell so it won't disappear when commands finish.

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
bash "$PANEL" thread THREAD_ID INDEX TOTAL
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
# Use panel-manager which reads from file (avoids shell quoting issues with HTML)
bash "$PANEL" draft THREAD_ID "$DRAFT_FILE" INDEX TOTAL
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

📝 Review drafts: https://mail.google.com/mail/u/0/#drafts
```

**Keep it brief** - the user can see all their drafts in one place at the drafts link.

### 7. Cleanup

After showing session summary:

```bash
# Clean up any remaining temp draft files
rm -f /tmp/email-draft-*.json /tmp/email-draft-display-*.txt

# Close the panel
bash "$PANEL" close
```

---

## UX Guidelines

**Draft Display Rules:**
- **DO NOT** echo/repeat draft content in conversation - the panel already shows it
- When draft is ready, just say: "Draft shown in panel. Approve or give feedback?"
- Keep conversation responses brief - all the detail is visible in the panel

**Why:** Users see the panel side-by-side. Repeating content wastes space and slows the workflow.

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
```

**Important**: The draft is stored in a temp file to ensure the exact draft shown in the panel is sent to Gmail. Clean up temp files when skipping threads or finishing the workflow.

---

## Example Session

```
Claude: Setting up email panel...
        [Panel shows: 9 threads to respond]

        Thread 1/9 shown. What would you like to say? (or: skip, done)

User: tell him the first report will be a static PDF, but for full
      engagement they'd get workspace access

Claude: Draft shown in panel. Approve or give feedback?

User: approve

Claude: ✓ Saved. Thread 2/9 shown. What would you like to say?

User: skip

Claude: Thread 3/9 shown. What would you like to say?

... [more threads] ...

User: done

Claude: ✅ Session Complete!

        📊 5 drafted, 4 skipped
        📝 Review: https://mail.google.com/mail/u/0/#drafts
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
