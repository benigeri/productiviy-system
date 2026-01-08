# Email Workflow Improvement Plan

## Core Value

**Strong model + your prompt for email writing.** Daily use, full flow from review → draft → Gmail drafts.

## Design Principles

1. **Ship fast** - MVP first, iterate based on real usage
2. **Simplicity** - One skill, minimal files, inline code until patterns emerge
3. **Strong AI** - Sonnet 4.5 with extended thinking + your prompt
4. **Clean UX** - Tmux panel for context, chat for interaction

## MVP Scope (v1)

Single enhanced skill: `/handle-to-respond-paul`

```
┌─────────────────────────────────────────────────────────────────┐
│  /handle-to-respond-paul (enhanced)                             │
│                                                                  │
│  1. Fetch threads (not messages) with to-respond-paul label     │
│  2. Spawn tmux panel showing email                              │
│  3. Wait for input:                                             │
│     • "next" / "skip" → next thread                             │
│     • <dictation> → call Anthropic, show draft in panel         │
│  4. After draft shown, wait for:                                │
│     • "approve" → create Gmail draft + update labels            │
│     • <feedback> → regenerate draft                             │
│  5. After approve → auto-advance to next thread                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create `drafted` label ✅ DONE
```bash
curl -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/folders" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "drafted"}'
```
- Label ID: `Label_215`
- Completed: 2026-01-07
- Bead: `productiviy-system-oc8` (closed)

### Step 2: Create email-canvas.py ⏳ IN PROGRESS
Terminal panel display for email workflow:
- List mode: show all threads with `to-respond-paul` label
- Single thread mode: `--thread-id` shows full thread
- Draft mode: `--draft` adds draft section below email

**File**: `.claude/skills/email-respond/email-canvas.py`
**Bead**: `productiviy-system-bw2` (in_progress)

### Step 3: Create draft-email.py ✅ DONE
Anthropic wrapper that:
- Takes thread ID, fetches via Nylas Clean Messages API
- Calls Anthropic to generate draft response
- Returns draft text to stdout

**File**: `draft-email.py` (project root)
**PR**: #33 (merged)
**Bead**: `productiviy-system-9lx` (closed)

**Future enhancement**: Add extended thinking + custom prompt from email-writing-guidelines.md

### Step 4: Update SKILL.md ⏳ TODO
Rewrite the skill workflow to:
- Use Threads API (not Messages)
- Spawn tmux panel for display
- Call draft-email.py for AI generation
- Handle approve/feedback loop
- Update labels on approve

**File**: `.claude/skills/email-respond/SKILL.md`
**Bead**: `productiviy-system-ngo`

### Step 5: Test end-to-end ⏳ TODO
- Run `/handle-to-respond-paul`
- Verify thread display in panel
- Dictate a response
- Verify draft appears
- Approve and verify Gmail draft created

**Bead**: `productiviy-system-ac8`

## Files Structure

```
.claude/skills/email-respond/
├── SKILL.md                    # Workflow instructions for Claude
├── email-canvas.py             # Terminal panel display
└── email-writing-guidelines.md # Your email writing prompt (TODO)

draft-email.py                  # Anthropic API wrapper (project root)
```

## Key APIs

### Threads (Nylas)
```bash
# List threads with label
GET /threads?in=Label_139&limit=20

# Get thread (includes all message IDs)
GET /threads/{thread_id}

# Clean messages (get plain text)
PUT /messages/clean
{"message_id": ["id1", "id2"], "ignore_images": true, "ignore_links": true}
```

### Draft Creation (Nylas)
```bash
POST /drafts
{
  "subject": "Re: Subject",
  "to": [{"email": "...", "name": "..."}],
  "cc": [...],
  "body": "<p>HTML content</p>",
  "reply_to_message_id": "msg_id"  # Links to thread
}
```

### Labels (Nylas)
```bash
# Update message labels
PUT /messages/{message_id}
{
  "folders": ["INBOX", "Label_215"]  # Label_215 = drafted
}
```

### Label IDs
- `to-respond-paul`: Label_139
- `to-read-paul`: Label_138
- `drafted`: Label_215

## Panel Display

### Email View (List)
```
══════════════════════════════════════════════════════════════
  📧 EMAILS TO RESPOND (9 threads)
══════════════════════════════════════════════════════════════

  📩 [1] Re: Paul / Mitch - Catch Up
     From: Bell, Mitch
     Date: Jan 07, 3:31 PM | 16 messages
     ID: 19b298d96ad7ef4e

  ⏳ [2] The Lead x Archive agreement
     From: Paul Benigeri
     Date: Jan 06, 2:15 PM | 3 messages
     ID: 199e3641bcc609e4

══════════════════════════════════════════════════════════════
  Use --thread-id <ID> to view a thread
══════════════════════════════════════════════════════════════
```

### Single Thread View
```
══════════════════════════════════════════════════════════════
  📧 Thread 1/9: Re: Paul / Mitch - Catch Up
  From: Bell, Mitch <mitch.bell@edelman.com>
  To: paul@archive.com
  CC: michael@archive.com, hannah@edelman.com
  Date: Jan 07, 3:31 PM | 16 messages
══════════════════════════════════════════════════════════════

Thanks for the clarification - I think we'll need to see the
first report to properly assess the usefulness of the output.
For instance, are we talking about a static report or
something dynamic with playable content?

[... full message ...]

──────────────────────────────────────────────────────────────
Scroll up for earlier messages
──────────────────────────────────────────────────────────────
```

### After Draft Generated
```
══════════════════════════════════════════════════════════════
  📧 ORIGINAL: Re: Paul / Mitch - Catch Up
  From: Bell, Mitch | Jan 07, 3:31 PM
══════════════════════════════════════════════════════════════
[abbreviated original message]
══════════════════════════════════════════════════════════════
  ✏️  YOUR DRAFT
══════════════════════════════════════════════════════════════

Hey Mitch,

The first report will be a static PDF with key insights and
recommendations. For the full engagement, you'd get workspace
access to see content in real-time.

Let me know if you have any other questions!

Best,
Paul

──────────────────────────────────────────────────────────────
  "approve" to save draft | give feedback to revise
──────────────────────────────────────────────────────────────
```

## Verification Checklist

- [x] `drafted` label exists in Gmail (Label_215)
- [ ] `/handle-to-respond-paul` shows threads (not messages)
- [ ] Tmux panel displays current email
- [ ] Dictation triggers Anthropic call
- [ ] Draft appears in panel
- [ ] "approve" creates Gmail draft
- [ ] Labels updated: `drafted` added, `to-respond-paul` removed
- [ ] Auto-advances to next thread

## Error Handling

- **Anthropic API failure**: Show error in panel, stay on current email, allow retry
- **Nylas API failure**: Show error, allow retry or skip
- **Empty thread list**: Display "No emails to respond to" and exit gracefully

## Recipient Handling

- Keep original To/CC recipients by default
- Display recipients in panel so user can see who will receive reply
- User can override by saying "just to Mitch" or "remove CC" in dictation

## Future Iterations (v2+)

- Extended thinking for Anthropic calls
- Custom email-writing-guidelines.md prompt
- Keyboard shortcuts in panel
- Better thread history display (collapsible)
- Draft templates for common responses
- Batch mode (draft multiple, approve at end)
- Analytics (response time, email volume)
