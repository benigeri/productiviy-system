# Email Workflow UX Improvements Plan

## User Decisions
- **Panel width**: 100 chars
- **Thread UI**: Card-based with box borders
- **Label errors**: Warning (show but don't block), fix known bugs

---

## Bugs to Fix (from this session)

### Bug 1: Nylas Webhook Not Triggering on Label Changes (CRITICAL)
**Symptom**: When `to-respond-paul` removed or `drafted` added, webhook automation doesn't fire
**Expected**: `supabase/functions/nylas-webhook/` should handle `message.updated` events for label changes
**Impact**: Label deduplication, archive detection, and reply detection automation broken
**Debug needed**:
- Check if Nylas is sending webhook events for label changes
- Verify webhook endpoint is deployed and accessible
- Check Supabase function logs for errors
- Confirm webhook signature validation is working

**Files**:
- `supabase/functions/nylas-webhook/index.ts` - webhook handler
- `supabase/functions/_shared/lib/workflow-labels.ts` - label logic

### Bug 2: Label Update DRAFT Error
**Error**: `Nylas API error: 400 {"error":{"message":"Invalid label: DRAFT"}}`
**Cause**: `update_thread_labels()` doesn't filter out DRAFT system folder
**File**: `.claude/skills/email-respond/create-gmail-draft.py`
**Fix**: Add "DRAFT" to `GMAIL_SYSTEM_FOLDERS` set

### Bug 3: Labels Not Actually Updating (via API)
**Symptom**: `to-respond-paul` (Label_139) not removed after drafting
**Cause**: Return value from `update_thread_labels()` is ignored
**File**: `.claude/skills/email-respond/create-gmail-draft.py` lines 222-234
**Fix**: Check return value, include status in output JSON

### Bug 4: Duplicate JSON Output
**Symptom**: Two separate JSON objects printed to stdout
**File**: `.claude/skills/email-respond/create-gmail-draft.py` lines 219, 229
**Fix**: Combine into single JSON output with all fields

---

## Implementation Plan

### Step 0: Debug Nylas Webhook (FIRST PRIORITY)

**Goal**: Determine why label change events aren't triggering automation

**Debug Steps**:

1. **Check webhook registration in Nylas Dashboard**
   - Verify webhook URL points to Supabase function
   - Confirm `message.updated` trigger is enabled
   - Check webhook status (active/failed)

2. **Check Supabase function logs**
   ```bash
   # View recent function invocations
   supabase functions logs nylas-webhook --project-ref aadqqdsclktlyeuweqrv
   ```

3. **Test webhook endpoint manually**
   ```bash
   # Send test payload to webhook
   curl -X POST https://aadqqdsclktlyeuweqrv.supabase.co/functions/v1/nylas-webhook \
     -H "Content-Type: application/json" \
     -d '{"type":"message.updated","data":{"object":{"id":"test","folders":["Label_139"]}}}'
   ```

4. **Verify webhook secret matches**
   - Check `NYLAS_WEBHOOK_SECRET` in `.env` matches Nylas dashboard
   - Check Supabase function has correct secret configured

5. **Check for filtering issues**
   - Does the webhook handler filter out certain event types?
   - Is there a condition that skips label change events?

**Files to inspect**:
- `supabase/functions/nylas-webhook/index.ts` - main handler
- Nylas dashboard webhook configuration
- Supabase function environment variables

---

### Step 1: Fix Label Updates in create-gmail-draft.py

**File**: `.claude/skills/email-respond/create-gmail-draft.py`

1. Add DRAFT to system folders (around line 20):
```python
GMAIL_SYSTEM_FOLDERS = {
    "SENT", "DRAFT", "TRASH", "SPAM", "STARRED",
    "IMPORTANT", "CATEGORY_PERSONAL", "CATEGORY_SOCIAL",
    "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS",
    "UNREAD"
}
```

2. Update `update_thread_labels()` to return success/error dict instead of exiting

3. In main(), capture label update result and include in output:
```python
output = {
    "status": "success",
    "draft_id": draft_id,
    "subject": subject,
    "reply_to": message_id,
}

if args.update_labels:
    label_result = update_thread_labels(...)
    if label_result.get("error"):
        output["labels_warning"] = label_result["error"]
    else:
        output["labels_updated"] = True

print(json.dumps(output))  # Single JSON output
```

### Step 2: Update Panel Width in email-canvas.py

**File**: `.claude/skills/email-respond/email-canvas.py`

1. Change `PANEL_WIDTH = 62` to `PANEL_WIDTH = 100`
2. Update text wrap width from 58 to 96

### Step 3: Implement Card-Based Layout in email-canvas.py

**File**: `.claude/skills/email-respond/email-canvas.py`

Update `show_thread_server()` and related functions:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│  THREAD 3/14: Re: Skin Spirit Intro to Archive                                                 │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│  FROM: Halee Hatlestad <hhatlestad@skinspirit.com>                                             │
│  TO:   Paul Benigeri <paul@archive.com>                                                        │
│  CC:   Charlotte Robinson, Jackie Brokaw                                                       │
│  DATE: Jan 8, 2026 10:30 AM                                                                    │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                │
│  Thank you for the intro Charlotte! Paul, any chance you could show us a demo this Friday?     │
│  If so, what does your availability look like. Could you do 10 am?                             │
│                                                                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

For draft view:
```
┌─ ORIGINAL ─────────────────────────────────────────────────────────────────────────────────────┐
│  From: Halee Hatlestad | Jan 8, 10:30 AM                                                       │
│  "Thank you for the intro Charlotte! Paul, any chance..."                                      │
├─ YOUR DRAFT ───────────────────────────────────────────────────────────────────────────────────┤
│  TO: Halee Hatlestad <hhatlestad@skinspirit.com>                                               │
│  CC: Charlotte Robinson, Brian <brian@archive.com>                                             │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                │
│  Hey Halee,                                                                                    │
│                                                                                                │
│  Thanks Charlotte for the connection! Archive is the AI that helps brands scale creator        │
│  programs infinitely...                                                                        │
│                                                                                                │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│  approve | feedback | skip                                                                     │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Step 4: Update Session Summary in skill.md

**File**: `.claude/skills/email-respond/skill.md`

Change session summary format from individual draft links to:
```
Session complete! 6 drafted, 8 skipped
https://mail.google.com/mail/u/0/#drafts
```

### Step 5: Update Claude Workflow Behavior in skill.md

**File**: `.claude/skills/email-respond/skill.md`

Add instruction: "Show draft in panel only. Claude confirms 'Draft ready in panel' without repeating the body text."

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/nylas-webhook/index.ts` | Debug/fix webhook trigger |
| `.claude/skills/email-respond/create-gmail-draft.py` | Fix label bugs, single JSON output |
| `.claude/skills/email-respond/email-canvas.py` | 100 char width, card-based UI |
| `.claude/skills/email-respond/skill.md` | Session summary, draft display instructions |

---

## Verification

### Webhook Verification
1. Add a label in Gmail manually, check Supabase logs for webhook event
2. Remove `to-respond-paul` label, verify webhook fires
3. Confirm label deduplication works (add multiple workflow labels)

### Email Workflow Verification
1. Run email workflow on 2-3 test threads
2. Confirm labels update correctly via API (check Gmail)
3. Verify webhook automation triggers after API label change
4. Verify panel displays at 100 char width with card borders
5. Confirm draft shows in panel, not echoed in Claude conversation
6. Verify session summary shows single drafts link
