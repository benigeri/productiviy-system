# Email Reply with Full History - Simplified Implementation

**Created:** 2026-01-11
**Type:** Feature Enhancement
**Priority:** P1
**Effort:** 5 hours

---

## Overview

Fix email replies so CC'd recipients see full conversation context. Keep it simple - structured JSON from AI, inline formatting, direct API calls.

**Core Problem:** When you reply and CC someone, they only see your reply without the original conversation.

**Solution:** Include Gmail-style quoted history in all replies. AI detects CC from natural language.

---

## Key Decisions

✅ **AI Parsing:** Structured JSON output (trust the AI)
✅ **HTML Conversion:** Use Nylas clean endpoint (already converts HTML→markdown server-side)
✅ **Formatter:** Inline function in API route (no separate module)
✅ **Nylas API:** Keep direct fetch() calls (simple for personal app)

---

## Implementation

### Phase 1: Update AI Prompt (1 hour)

**Braintrust prompt for `email-draft-generation`:**

```
You are an email assistant. Parse user instructions and return structured JSON.

Return this exact format:
{
  "to": ["email@example.com"],
  "cc": ["email@example.com"],
  "body": "Your reply text here"
}

Rules:
- Detect CC from phrases like "CC John", "copy Sarah", "loop in Mike"
- Extract email addresses from thread participants if name-only
- Only write NEW reply text in body (history added automatically)
- If multiple recipients, return arrays

Example:
User: "Reply yes and CC john@example.com"
Output: {"to": ["alice@example.com"], "cc": ["john@example.com"], "body": "Yes"}
```

**Validation:**
- Test with 5 CC detection phrases
- Verify JSON format with sample outputs
- Add simple try/catch for malformed JSON (fallback: empty cc array)

---

### Phase 2: Add Inline History Formatter (1 hour)

**File:** `/email-workflow/app/api/drafts/route.ts`

**Add this function:**

```typescript
function formatThreadHistory(messages: NylasMessage[], currentUserEmail: string): string {
  return messages
    .filter(m => m.from[0]?.email !== currentUserEmail) // Skip own messages
    .sort((a, b) => a.date - b.date) // Chronological order
    .map(msg => {
      const sender = msg.from[0];
      const date = new Date(msg.date * 1000);
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });

      // Nylas clean endpoint already gives us markdown/plain text
      const plainBody = msg.body;
      const quotedLines = plainBody.split('\n').map(line => `> ${line}`).join('\n');

      return `On ${dateStr} at ${timeStr} ${sender.name || sender.email} <${sender.email}> wrote:\n${quotedLines}`;
    })
    .join('\n\n');
}
```

**Why inline?**
- Only used in one place
- Simple logic (~20 lines)
- Easy to modify
- No extra files to maintain

---

### Phase 3: Update Draft Generation API (2 hours)

**File:** `/email-workflow/app/api/drafts/route.ts`

**Current flow:**
```
1. Receive thread_id + instructions
2. Fetch thread messages
3. Call AI → returns plain text
4. Return { body: text }
```

**New flow:**
```
1. Receive thread_id + instructions
2. Fetch thread messages (use Nylas clean endpoint - already returns markdown)
3. Call AI → returns JSON: { to, cc, body }
4. Parse JSON (simple try/catch, trust it works)
5. Format thread history with inline function
6. Combine: body + "\n\n" + history
7. Return { to, cc, body, subject }
```

**Implementation:**

```typescript
export async function POST(request: Request) {
  const body = await request.json();
  const { threadId, subject, messages, instructions, latestMessageId } = body;

  // Call AI
  const aiResponse = await invoke({
    projectName: process.env.BRAINTRUST_PROJECT_NAME,
    slug: process.env.BRAINTRUST_DRAFT_SLUG,
    input: {
      subject,
      messages: messages.map(m => ({
        from: m.from[0]?.email,
        date: new Date(m.date * 1000).toLocaleString(),
        body: m.body.slice(0, 500), // Truncate long bodies for AI prompt
      })),
      instructions,
    },
  });

  // Parse AI response (trust it's valid JSON)
  let draft;
  try {
    draft = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;
  } catch (error) {
    console.error('AI JSON parse failed:', error);
    // Fallback: treat as plain text
    draft = {
      to: [messages[messages.length - 1].from[0]],
      cc: [],
      body: typeof aiResponse === 'string' ? aiResponse : '',
    };
  }

  // Format thread history
  const currentUserEmail = process.env.USER_EMAIL || 'paul@example.com';
  const history = formatThreadHistory(messages, currentUserEmail);

  // Combine
  const fullBody = `${draft.body}\n\n${history}`;

  return NextResponse.json({
    success: true,
    to: draft.to,
    cc: draft.cc || [],
    subject: `Re: ${subject}`,
    body: fullBody,
    metadata: {
      thread_id: threadId,
      reply_to_message_id: latestMessageId,
      has_new_cc: draft.cc && draft.cc.length > 0,
    },
  });
}
```

**Key points:**
- Trust AI returns valid JSON (1 try/catch for safety)
- Use existing Nylas clean endpoint data (already markdown)
- Inline formatter keeps it simple
- 10-line fallback if JSON fails

---

### Phase 4: Update Draft Save API (30 min)

**File:** `/email-workflow/app/api/drafts/save/route.ts`

**Changes needed:** Almost none! Just accept cc array.

**Current code (lines 68-84):**
```typescript
const draftRes = await fetch(
  `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/drafts`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: `Re: ${subject}`,
      body: draftBody,
      to,
      cc: filteredCc, // ← Already supports CC!
      reply_to_message_id: latestMessageId,
    }),
  }
);
```

**New code:**
```typescript
// Just pass cc from frontend (no filtering needed - AI handles it)
body: JSON.stringify({
  subject: `Re: ${subject}`,
  body: draftBody,
  to,
  cc, // ← From AI-generated draft
  reply_to_message_id: latestMessageId,
}),
```

**That's it!** API already supports cc array, just use what AI gives us.

---

### Phase 5: Update Frontend (1 hour)

**File:** `/email-workflow/app/inbox/ThreadDetail.tsx`

**Add CC display:**

```typescript
// After "To:" line
{draft.cc && draft.cc.length > 0 && (
  <div className="text-xs text-gray-600 mb-2">
    <strong>CC:</strong> {draft.cc.map(c => c.email || c).join(', ')}
  </div>
)}

// Show quoted history with preserved formatting
<div className="whitespace-pre-wrap text-sm text-gray-700">
  {draft.body}
</div>
```

**That's it!** Just display the data, React handles escaping.

---

## Testing

**Manual test cases:**

1. **Basic CC detection:**
   - Input: "Reply yes and CC john@example.com"
   - Expected: CC shows john@example.com, history included

2. **Name-based CC:**
   - Input: "Reply approved and loop in Alice"
   - Expected: AI extracts Alice's email from thread participants

3. **No CC:**
   - Input: "Reply thanks"
   - Expected: No CC, history still included

4. **Long thread:**
   - Test with 15-message thread
   - Expected: All quoted in chronological order

5. **Gmail verification:**
   - Complete flow, check draft in Gmail web UI
   - Expected: CC recipients visible, quoted history displays correctly

**Total testing time: 30 minutes**

---

## What We're NOT Doing (Simplifications)

❌ **No html-to-text dependency** - Use Nylas clean endpoint (already converts)
❌ **No separate formatter module** - Inline function is simpler
❌ **No Nylas client abstraction** - Direct fetch() works fine for personal app
❌ **No complex error handling** - Simple try/catch, trust AI mostly works
❌ **No extensive unit tests** - Manual testing sufficient for personal tool
❌ **No Zod validation on AI response** - Trust the structured output

---

## Edge Cases & Limitations

**Known limitations (acceptable for personal app):**

1. **AI JSON failures:** ~5% chance of malformed JSON → fallback to plain text, no CC
2. **Long threads (50+ messages):** Will work but may be slow (acceptable)
3. **Complex HTML:** Nylas clean endpoint handles it, we just quote the output
4. **Ambiguous names:** AI picks most recent participant match (good enough)

**Not implementing:**
- Email address validation (trust AI extracts correctly)
- CC confirmation UI for external recipients (personal app, low risk)
- Retry logic for Nylas API (can manually retry if fails)
- Performance monitoring (not needed for single user)

---

## Files Changed

**Modified (3 files):**
1. `/email-workflow/app/api/drafts/route.ts` - Add formatter + JSON parsing (~30 lines)
2. `/email-workflow/app/api/drafts/save/route.ts` - Change cc filtering (~1 line)
3. `/email-workflow/app/inbox/ThreadDetail.tsx` - Display CC (~5 lines)

**New (0 files):** Everything inline!

**Total LOC added:** ~40 lines

---

## Deployment

**Steps:**
1. Update Braintrust prompt via dashboard
2. Deploy email-workflow app to Vercel
3. Test with 1 real email thread
4. Monitor for first 24 hours

**Rollback:** Revert Braintrust prompt to previous version

---

## Timeline

- Phase 1 (AI Prompt): 1 hour
- Phase 2 (Formatter): 1 hour
- Phase 3 (Draft API): 2 hours
- Phase 4 (Save API): 30 min
- Phase 5 (Frontend): 1 hour
- Testing: 30 min

**Total: 6 hours**

---

## Success Criteria

✅ AI correctly extracts CC from natural language (5/5 test cases)
✅ All replies include full quoted history in Gmail format
✅ CC recipients visible in draft preview
✅ Threading preserved (reply_to_message_id works)
✅ No regressions in existing reply flow
✅ Draft appears correctly in Gmail web UI

---

## Notes

- This is 1/10th the complexity of original plan (778 lines → 40 LOC)
- Leverages existing Nylas clean endpoint (no new dependencies)
- Inline approach perfect for personal app (not team project)
- Can refactor later if needed (YAGNI principle)
- Focus on shipping fast, iterate based on actual usage
