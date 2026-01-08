---
name: email-respond
description: Process emails labeled 'to-respond-paul' - show email, draft reply from dictation, update labels. Interactive workflow for email triage.
---

# Email Response Workflow

Process emails with the `to-respond-paul` label. For each email: show context, get user dictation, generate draft reply, update labels.

## Prerequisites

Environment variables in `.env`:
- `NYLAS_API_KEY`
- `NYLAS_GRANT_ID`

## Workflow Labels

| Label | Gmail ID | Purpose |
|-------|----------|---------|
| `to-respond-paul` | Label_139 | Emails needing response |
| `to-read-paul` | Label_138 | Emails to read (lower priority) |
| `drafted` | Label_140 | Response drafted, pending send |

Priority: `to-respond-paul` > `to-read-paul` > `drafted`

## Shell Pattern

Always use this pattern for reliable env loading:
```bash
bash -c 'source .env && curl -s ...'
```

---

## API Reference

### List Messages with Label

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/messages?in=Label_139&limit=50" \
  -H "Authorization: Bearer $NYLAS_API_KEY"'
```

Response includes: `id`, `thread_id`, `subject`, `from`, `to`, `date`, `snippet`, `folders`

### Get Full Message

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/messages/MESSAGE_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"'
```

Returns full message including `body` (HTML content).

### Get Thread

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/threads/THREAD_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"'
```

Returns thread with all `message_ids` for context.

### Create Draft Reply

```bash
bash -c 'source .env && curl -s -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/drafts" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"subject\": \"Re: Original Subject\",
    \"to\": [{\"email\": \"recipient@example.com\", \"name\": \"Name\"}],
    \"reply_to_message_id\": \"ORIGINAL_MESSAGE_ID\",
    \"body\": \"<p>Reply content here</p>\"
  }"'
```

Key fields:
- `reply_to_message_id`: Links reply to original thread
- `body`: HTML format
- `to`: Array of recipients (use original sender)

### Update Message Labels

```bash
bash -c 'source .env && curl -s -X PUT "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/messages/MESSAGE_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"folders\": [\"INBOX\", \"Label_140\"]}"'
```

To transition from `to-respond-paul` to `drafted`:
1. Get current folders
2. Remove `Label_139` (to-respond-paul)
3. Add `Label_140` (drafted)
4. PUT the updated folders array

---

## Workflow Steps

### 1. Fetch Emails

```bash
# Get count and first batch
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/messages?in=Label_139&limit=50" \
  -H "Authorization: Bearer $NYLAS_API_KEY"' | jq '{count: (.data | length), emails: [.data[:3][] | {id, subject, from: .from[0].email, date}]}'
```

### 2. Show Email Context

For each email:
1. Fetch full message with body
2. If part of thread, fetch thread for context
3. Display: sender, subject, date, body (cleaned HTML → text)

### 3. Get User Dictation

Ask user to dictate their response. They can:
- Provide key points to include
- Give full response text
- Say "skip" to move to next email
- Say "done" to exit

### 4. Generate Draft

Using the email context and user dictation, generate a professional reply:
- Match the tone of the conversation
- Be concise but complete
- Include any specific points user mentioned
- Format as clean HTML

### 5. Create Draft & Update Labels

1. Create draft via POST /drafts with `reply_to_message_id`
2. Update original message: remove `to-respond-paul`, add `drafted`
3. Confirm to user and move to next email

---

## User Commands

During the workflow, user can say:

| Command | Action |
|---------|--------|
| `next` | Show next email |
| `skip` | Keep current label, move to next |
| `done` | Exit workflow |
| `draft` | After dictation, create the draft |
| `edit` | Modify the generated draft before saving |

---

## Email Writing Style

See `email-writing-guidelines.md` for tone and formatting preferences.

Default style:
- Professional but friendly
- Concise - get to the point
- Clear action items if applicable
- Match the formality level of the incoming email

---

## Example Session

```
Claude: Found 5 emails with to-respond-paul label.

📧 Email 1/5
From: john@company.com
Subject: Q1 Planning Meeting
Date: Jan 7, 2026

"Hi Paul, wanted to follow up on our discussion about Q1 priorities..."

What would you like to say in your reply? (or: skip, done)

User: tell him I'm free next week Tuesday or Wednesday afternoon,
      and that I'll send over the doc he mentioned by Friday

Claude: Here's the draft reply:

---
Hi John,

Thanks for following up. I'm available next week on Tuesday or Wednesday
afternoon - let me know what works best for you.

I'll have that document over to you by Friday.

Best,
Paul
---

Create this draft? (yes/edit/skip)

User: yes

Claude: ✓ Draft created
        ✓ Label updated: to-respond-paul → drafted

📧 Email 2/5
From: sarah@vendor.com
...
```

---

## Troubleshooting

### No emails found
- Check that Label_139 exists: `GET /folders`
- Verify grant_id is correct

### Draft not linked to thread
- Ensure `reply_to_message_id` is set to the original message ID
- Check that subject starts with "Re: "

### Labels not updating
- Fetch current folders first, modify array, PUT back
- Don't forget INBOX and other system folders in the array
