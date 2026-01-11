# Testing Instructions for Email Reply with History & CC (ps-22)

**Branch:** `feature/email-reply-with-history`
**Epic:** ps-16

## Prerequisites

1. Deploy email-workflow to Vercel (preview deployment is fine)
2. Ensure Braintrust prompt `email-writer-like-paul-bb66` is configured for structured JSON output
3. Have a test email thread with 2+ messages in Gmail

## Test Cases

### Test 1: Basic CC Detection
**Input:** "Reply yes and CC john@example.com"
**Expected:**
- ✅ Draft preview shows john@example.com in CC field
- ✅ Draft body contains your reply text
- ✅ Full thread history is quoted below your reply
- ✅ Quoted text is styled (gray, italic, left border)

### Test 2: Name-Based CC (Extract from Thread)
**Input:** "Reply approved and loop in Alice"
**Expected:**
- ✅ AI extracts Alice's email from thread participants
- ✅ CC field shows Alice's email
- ✅ History included as in Test 1

### Test 3: No CC
**Input:** "Reply thanks"
**Expected:**
- ✅ No CC field shown (or empty)
- ✅ History still included in draft body
- ✅ Only "To:" recipient is last message sender

### Test 4: Multiple CC Recipients
**Input:** "Reply LGTM, CC alice@example.com and bob@example.com"
**Expected:**
- ✅ Both emails appear in CC field
- ✅ History formatted correctly

### Test 5: Long Thread (15+ messages)
**Prerequisites:** Use a thread with 15+ messages
**Input:** "Reply sounds good"
**Expected:**
- ✅ All messages in thread quoted chronologically
- ✅ Own messages excluded from history
- ✅ Each message has "On [date] at [time] [sender] wrote:" header
- ✅ Each line of previous messages prefixed with `>`

## Gmail Verification

After creating a draft in the app:

1. Open Gmail web UI
2. Navigate to Drafts
3. Find the draft you just created
4. **Verify:**
   - ✅ CC recipients visible in Gmail's CC field
   - ✅ Quoted history displays correctly (not as plain text `>`)
   - ✅ Reply threading is maintained (draft is in correct conversation)
   - ✅ Subject line has "Re:" prefix

## Edge Cases to Check

### Edge 1: Current User in CC
**Input:** "CC paul@example.com" (your own email)
**Expected:**
- ✅ Your email filtered out from CC (save API removes it)

### Edge 2: Empty Thread
**Input:** Try with a thread that has only 1 message
**Expected:**
- ✅ No history section (only your reply)
- ✅ No errors

### Edge 3: HTML-Heavy Emails
**Prerequisites:** Thread with formatted HTML emails
**Input:** Any reply instruction
**Expected:**
- ✅ History shows plain text/markdown (Nylas clean endpoint converts)
- ✅ No broken HTML tags visible

## Regression Tests

1. **Plain replies still work:** Create a draft without any CC mention
   - ✅ Draft generates successfully
   - ✅ No CC field shown
   - ✅ History included

2. **API errors handled:** Disconnect network, try to generate draft
   - ✅ Error message shown to user
   - ✅ No crash

## Success Criteria

All test cases pass ✅ = Mark ps-22 as complete

## Testing Commands

```bash
# Start dev server
cd /Users/benigeri/Projects/productiviy-system/email-workflow
npm run dev

# Or deploy to Vercel preview
vercel --prod=false
```

## Known Limitations (Acceptable)

- AI JSON parsing failures (~5% chance) → Fallback to plain text, no CC
- Very long threads (50+ messages) → May be slow but will work
- Ambiguous names in CC → AI picks most recent participant

## Closing This Bead

After all tests pass:

```bash
bd close ps-22 --reason "All 5 CC detection test cases passed, Gmail verification successful, edge cases handled, no regressions found"
bd sync
```

Then check if epic ps-16 is ready to close:

```bash
bd ready | grep ps-16
# If ps-16 appears (all blockers closed), close it:
bd close ps-16 --reason "Email reply with history and CC detection fully implemented and tested. All phases complete."
```
