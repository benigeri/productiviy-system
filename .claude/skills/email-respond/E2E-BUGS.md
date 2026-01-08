# Email Workflow E2E Testing - Bug Tracker

Tracking bugs discovered during E2E testing session.

## Fixed

### 1. Panel manager kills wrong tmux pane (CRITICAL)
- **Status**: FIXED
- **Symptom**: Running `panel-manager.sh close` could kill the Agent Deck conversation pane
- **Root cause**: Used relative target `{right}` instead of tracking specific pane IDs
- **Fix**: Store pane ID in `/tmp/email-panel-id.txt`, target by ID, add safety check to never kill current pane

### 2. Nylas API "message_id cannot exceed 20" error
- **Status**: FIXED
- **Symptom**: Threads with >20 messages fail to display or draft
- **Root cause**: `clean_messages()` sent all message IDs in one request, but Nylas limits to 20
- **Fix**: Batch message IDs into chunks of 20
- **Files fixed**: `email-canvas.py`, `draft-email.py`

## Open

### 3. Non-monospace font for email panel
- **Status**: OPEN (Feature request)
- **Request**: Use a non-monospace font in the tmux panel for better email readability
- **Notes**: Tmux typically uses terminal fonts. Options to explore:
  - Configure terminal emulator's alternate font
  - Use a proportional terminal font like "Input Sans" or custom iTerm2 profile
  - May require Agent Deck configuration rather than script changes

### 4. Hard to find the relevant message in long threads
- **Status**: OPEN
- **Symptom**: In threads with many messages (e.g., "Paul x Em Meet" with 25 messages), it's hard to locate the message that needs a response
- **Possible fixes**:
  - Highlight the latest/most recent message more prominently
  - Collapse older messages by default, expand only the latest
  - Add visual separators or message numbering
  - Show only the last N messages with option to expand

### 5. Labels not being removed after draft creation
- **Status**: OPEN
- **Symptom**: After approving a draft, `Label_139` (to-respond-paul) is NOT removed from thread, though `Label_215` (drafted) IS added
- **Evidence**: Thread `199e3641bcc609e4` still has both labels after draft created
- **File to investigate**: `create-gmail-draft.py` label update logic

### 6. Draft not appearing in Gmail
- **Status**: OPEN
- **Symptom**: Script reports success but draft doesn't show in Gmail
- **Evidence**: Fling thread (19b28509efff0331) - script returned `draft_id: r-5294907974433256899` but user can't find draft
- **Investigate**: Check if draft is being created on wrong thread or if there's a Nylas API issue

### 7. Line breaks not showing in draft preview
- **Status**: OPEN
- **Symptom**: Draft preview in tmux panel shows text without line breaks, even though the actual Gmail draft has proper formatting
- **Root cause**: Likely stripping `<br>` or `<p>` tags when converting HTML to plain text without preserving newlines
- **Files to investigate**: `panel-manager.sh` (show_draft function), `email-canvas.py` (draft display)
- **Fix**: Ensure HTML-to-text conversion preserves paragraph breaks

## Feature Requests

### FR1. Auto-approve simple emails
- **Request**: When user says "auto-approve" or similar at the end of dictation, skip the approval step - generate draft and send to Gmail directly, then move to next email
- **Trigger phrases**: "auto-approve", "auto-approved", "send directly"
- **Benefit**: Faster flow for quick/simple responses

## To Verify

- [ ] Thread with 25+ messages displays correctly after batching fix
- [ ] Full E2E flow: dictate → draft → approve → Gmail draft created
- [ ] Panel close no longer kills Agent Deck pane
