# Email Workflow Improvements Plan

**Created:** 2026-01-08
**Status:** Ready for implementation

---

## Overview

Improvements based on E2E testing session. Prioritized bug fixes followed by UX enhancements.

---

## Phase 1: Critical Bug Fixes

### Bug #5: Labels not being removed after draft creation
**Priority:** HIGH
**File:** `.claude/skills/email-respond/create-gmail-draft.py:154`

**Root cause:**
```python
update_message_labels(latest_message_id, ["INBOX", "Label_215"])
```
This updates labels on ONE message, not the thread. Gmail labels are per-thread via the API.

**Fix:**
1. Use Nylas thread update endpoint instead of message update
2. OR update ALL messages in the thread
3. Get current folders, filter out `Label_139`, add `Label_215`

**Implementation:**
```python
def update_thread_labels(thread_id: str, add_labels: list, remove_labels: list):
    """Update labels on a thread (all messages)."""
    url = f"{NYLAS_BASE_URL}/grants/{NYLAS_GRANT_ID}/threads/{thread_id}"
    headers = {
        "Authorization": f"Bearer {NYLAS_API_KEY}",
        "Content-Type": "application/json",
    }

    # Get current folders
    thread = get_thread(thread_id)
    current_folders = thread.get("folders", [])

    # Modify folders
    new_folders = [f for f in current_folders if f not in remove_labels]
    new_folders.extend([l for l in add_labels if l not in new_folders])

    payload = {"folders": new_folders}
    response = requests.put(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
    return response.json()
```

---

### Bug #6: Draft not appearing in Gmail
**Priority:** HIGH
**File:** `.claude/skills/email-respond/create-gmail-draft.py`

**Investigation needed:**
1. Check if draft_id format is valid Gmail draft ID
2. Verify `reply_to_message_id` is correct
3. Check Nylas dashboard for draft creation logs
4. Test: Create draft without `reply_to_message_id` to see if it appears

**Possible causes:**
- Draft created but on wrong account/grant
- `reply_to_message_id` causing silent failure
- Draft created but Gmail sync delay

---

### Bug #7: Line breaks missing in draft preview
**Priority:** MEDIUM
**Files:**
- `.claude/skills/email-respond/panel-manager.sh:106` (show_draft)
- Terminal display of draft body

**Current code:**
```bash
draft_body=$(jq -r '.body' "$draft_file" 2>/dev/null | sed 's/<[^>]*>//g')
```

**Fix:**
```bash
# Preserve line breaks when stripping HTML
draft_body=$(jq -r '.body' "$draft_file" 2>/dev/null | \
  sed 's/<br\s*\/?>/\n/gi' | \
  sed 's/<\/p>/\n\n/gi' | \
  sed 's/<[^>]*>//g')
```

---

## Phase 2: UX Improvements

### Improvement E: Running progress count
**Files:** Panel display, SKILL.md workflow

**Add to panel header:**
```
📧 Thread 3/12: "Subject here"     [2 drafted, 1 skipped]
```

**Implementation:**
- Pass `--drafted N --skipped M` to panel-manager.sh
- Update email-canvas.py to display in header

---

### Improvement H: Show recipients before drafting
**Change workflow in SKILL.md**

**Current flow:**
1. User dictates
2. Generate draft
3. Show draft + recipients
4. Approve/feedback

**New flow:**
1. User dictates
2. Show likely recipients (To: X, CC: Y, Z)
3. User confirms or adjusts ("actually remove Z from CC")
4. Generate draft
5. Show draft
6. Approve/feedback

**Implementation:**
- Add `--recipients-only` flag to draft-email.py that returns recipients without generating full draft
- Or: Quick lookup of thread participants before draft generation

---

### Improvement I: Session summary with Gmail draft links
**Add to end of workflow**

**Output format:**
```
✅ Session Complete!

📊 Summary: 9 drafted, 3 skipped

📝 Drafts to review:
1. Re: Potential CPG client
   https://mail.google.com/mail/u/0/#drafts?compose=<draft_id>
2. Re: Paul x Em Meet
   https://mail.google.com/mail/u/0/#drafts?compose=<draft_id>
...
```

**Implementation:**
- Collect draft IDs in array during workflow
- Format Gmail URLs: `https://mail.google.com/mail/u/0/#drafts?compose=<draft_id>`
- Display at end before closing panel

---

### Improvement: Dictation artifact handling
**File:** `draft-email.py` (Claude prompt)

**Add to system prompt:**
```
Note: The dictation may contain transcription artifacts at the end such as
repeated words ("bye bye bye"), filler words ("um", "uh"), or trailing noise.
Ignore these and do not include them in the draft.
```

---

## Phase 3: Speed Optimizations (Future)

Lower priority, tackle after bugs and UX improvements:

1. **Reduce sleep delays** - Test removing `sleep 0.3` in panel-manager.sh
2. **Pre-fetch next thread** - While user reviews current, fetch next in background
3. **Cache thread data** - Store in /tmp to avoid re-fetching
4. **Combine API calls** - Batch where possible

---

## Verification Checklist

- [ ] Bug #5: Create draft → Label_139 removed from thread in Gmail
- [ ] Bug #6: Create draft → Draft visible in Gmail drafts folder
- [ ] Bug #7: Draft with paragraphs → Preview shows line breaks
- [ ] Improvement E: Progress count visible during workflow
- [ ] Improvement H: Recipients shown before draft generation
- [ ] Improvement I: Session summary with clickable Gmail links

---

## Beads Structure

```
EPIC: Email workflow v2 improvements
├── TASK: Fix label removal (Bug #5) [P1]
├── TASK: Fix draft not appearing (Bug #6) [P1]
├── TASK: Fix line breaks in preview (Bug #7) [P2]
├── TASK: Add progress count display [P2]
├── TASK: Show recipients before drafting [P2]
├── TASK: Add session summary with draft links [P2]
└── TASK: Add dictation artifact note to prompt [P3]
```
