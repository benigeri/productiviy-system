# Email Workflow QA Checklist

Manual testing checklist for the email workflow system.

## Prerequisites

```bash
# Ensure environment variables are set
source .env
echo "NYLAS_API_KEY: ${NYLAS_API_KEY:0:10}..."
echo "NYLAS_GRANT_ID: ${NYLAS_GRANT_ID:0:10}..."
echo "ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:10}..."
```

---

## 1. Draft Email Script (`draft-email.py`)

### Basic Draft Generation
```bash
# Get a thread ID from to-respond-paul label
THREAD_ID=$(curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/threads?in=Label_139&limit=1" \
  -H "Authorization: Bearer $NYLAS_API_KEY" | jq -r '.data[0].id')
echo "Thread: $THREAD_ID"

# Generate a draft (output to stdout)
python3 draft-email.py $THREAD_ID -d "Thanks for reaching out, let me get back to you soon"
```

- [ ] Returns valid JSON with `to`, `cc`, `subject`, `body` fields
- [ ] `to` and `cc` are arrays of `{email, name}` objects (not strings)
- [ ] Body is well-formatted HTML

### Output to File (`-o/--output`)
```bash
# Generate draft to file
python3 draft-email.py $THREAD_ID -d "Looking forward to our meeting" -o /tmp/draft.json

# Verify file was created
cat /tmp/draft.json
```

- [ ] File contains valid JSON
- [ ] Works without shell redirection issues

### Feedback Iteration
```bash
# First draft
python3 draft-email.py $THREAD_ID -d "Let's schedule for Tuesday" -o /tmp/draft.json

# Revise with feedback (same input/output file)
python3 draft-email.py $THREAD_ID -d "Let's schedule for Tuesday" \
  --feedback "Make it shorter and more casual" \
  --previous-draft /tmp/draft.json \
  -o /tmp/draft.json

cat /tmp/draft.json
```

- [ ] Revision reflects the feedback
- [ ] Same file for input/output works correctly (atomic write)
- [ ] Original content is read before being overwritten

---

## 2. Email Canvas Panel (`email-canvas.py`)

### Thread List View
```bash
python3 .claude/skills/email-respond/email-canvas.py
```

- [ ] Shows list of threads with to-respond-paul label
- [ ] Each thread shows subject, sender, date, message count

### Single Thread View (All Messages)
```bash
# Get a thread with multiple messages
THREAD_ID="<thread-with-multiple-messages>"
python3 .claude/skills/email-respond/email-canvas.py --thread-id $THREAD_ID
```

- [ ] Shows ALL messages in the thread (not just latest)
- [ ] Messages have visual separation (box separators)
- [ ] Most recent message is at the BOTTOM
- [ ] Latest message labeled with "LATEST" indicator

### Thread with Draft
```bash
echo "Hi, thanks for your email!" > /tmp/test-draft.txt
python3 .claude/skills/email-respond/email-canvas.py --thread-id $THREAD_ID --draft-file /tmp/test-draft.txt
```

- [ ] Shows abbreviated original email
- [ ] Shows draft in separate box below
- [ ] Draft box has approval instructions

---

## 3. Create Gmail Draft (`create-gmail-draft.py`)

### Basic Draft Creation
```bash
# Create a test draft JSON
cat > /tmp/test-draft.json << 'EOF'
{
  "to": [{"email": "test@example.com", "name": "Test User"}],
  "cc": [],
  "subject": "Re: Test Subject",
  "body": "<p>This is a test draft.</p>"
}
EOF

# Create draft (use a real thread ID)
THREAD_ID="<real-thread-id>"
python3 .claude/skills/email-respond/create-gmail-draft.py /tmp/test-draft.json --thread-id $THREAD_ID
```

- [ ] Returns JSON with `status: success` and `draft_id`
- [ ] Draft appears in Gmail drafts

### Label Updates
```bash
python3 .claude/skills/email-respond/create-gmail-draft.py /tmp/test-draft.json \
  --thread-id $THREAD_ID --update-labels
```

- [ ] Removes `to-respond-paul` (Label_139) from thread
- [ ] Removes `to-read-paul` (Label_138) if present
- [ ] Adds `drafted` (Label_215) to thread
- [ ] Output shows `labels_updated: true`

---

## 4. Webhook (`nylas-webhook`)

### Workflow Label Deduplication
When a message has multiple workflow labels, the webhook should keep only the highest priority.

Test scenarios:
- [ ] Message with `to-respond-paul` + `drafted` → keeps only `to-respond-paul`
- [ ] Message with `to-read-paul` + `drafted` → keeps only `to-read-paul`

### Archive Detection
When a message is archived (removed from INBOX), workflow labels should be cleared.

- [ ] Message with `to-respond-paul`, no INBOX → labels cleared
- [ ] Message with `drafted`, no INBOX → labels cleared

### Sent Message Handling
When a reply is sent, all workflow labels should be cleared from the entire thread.

- [ ] Send a reply to a thread with `drafted` label
- [ ] All messages in thread should have `drafted` removed
- [ ] The sent message itself should NOT have `drafted`

---

## 5. Full Workflow Integration

### End-to-End Test
1. Start with a thread labeled `to-respond-paul`
2. Run `/handle-to-respond-paul` skill
3. Dictate a response
4. Approve the draft
5. Verify in Gmail:
   - [ ] Draft appears in drafts folder
   - [ ] Thread has `drafted` label
   - [ ] Thread no longer has `to-respond-paul` label

### Send and Verify
1. Open the draft in Gmail and send it
2. Wait a few seconds for webhook to process
3. Verify:
   - [ ] Thread no longer has `drafted` label
   - [ ] No workflow labels remain on any message

---

## Test Automation

### Run Unit Tests
```bash
# Draft email tests (Python)
python3 draft-email.test.py -v

# Config/duplicate detection tests (Deno)
cd .claude && deno test --allow-read config.test.ts

# Webhook tests (Deno)
cd supabase/functions/nylas-webhook && deno test
```

Expected: All tests pass

---

## Common Issues

### CC as String Array
If Nylas returns 400 error when creating draft, check that CC is `[{email, name}]` not `["email"]`.
The `normalize_draft()` function in `draft-email.py` should handle this.

### Previous Draft File Empty
Don't use `> file.json` redirection with `--previous-draft`. Use `-o file.json` instead.
Shell redirection truncates the file before the script can read it.

### Workflow Labels Not Cleared
1. Check webhook is deployed and running
2. Check webhook secret matches in Nylas dashboard
3. Check logs in Supabase dashboard
