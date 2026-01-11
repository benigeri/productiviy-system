# Email Reply with Full History & Structured CC Detection

**Created:** 2026-01-11
**Type:** Feature Enhancement
**Priority:** P1
**Complexity:** Medium

---

## Overview

Enhance the email reply system to:
1. Always include full thread history in Gmail-style quoted format
2. Properly detect CC recipients from natural language input
3. Return structured data for parsing (To, CC, BCC, reply text)

This solves the problem where CC'd recipients only see the reply without conversation context.

---

## Problem Statement

### Current Behavior
- User replies to email thread and CCs new people
- System creates draft with only the new reply text
- CC recipients receive email without original conversation context
- They lack understanding of what's being discussed

### Example Scenario
```
Original thread:
Alice: "Can we meet Tuesday at 2pm?"
Bob: "Tuesday works for me"

User replies via draft-email: "Reply to Alice and CC john@example.com saying yes that works"

Current result:
To: Alice
CC: John
Body: "Yes that works"

Problem: John has no idea what "works" or what meeting is being discussed
```

### Desired Behavior
- All replies include full thread history in Gmail-style quoted blocks
- CC recipients see the complete conversation
- AI properly extracts CC recipients from natural language
- Structured output for reliable parsing

---

## Proposed Solution

### Architecture Changes

#### 1. Update AI Prompt (Braintrust)

**File:** Braintrust prompt for `email-draft-generation` slug

**Changes:**
- Add CC detection instructions to system prompt
- Request structured JSON output with separate fields
- Include thread history formatting instructions

**New Prompt Structure:**
```
You are an email assistant. Parse the user's instructions and generate an email draft.

IMPORTANT: Return a JSON object with this exact structure:
{
  "to": ["email1@example.com"],
  "cc": ["email2@example.com"],
  "bcc": [],
  "subject": "Re: Original Subject",
  "body": "Your reply text here",
  "analysis": {
    "intent": "reply_with_cc",
    "detected_cc": true,
    "confidence": 0.95
  }
}

CC Detection:
- Phrases like "CC John", "copy Sarah", "loop in Mike" indicate CC
- Extract email addresses from context or thread participants
- If name only provided, match against thread participants

Body Formatting:
- Write only the NEW reply text in the body field
- Do NOT include quoted history in body (system will add it)
- Keep reply concise and natural

Thread History:
- Will be automatically appended in Gmail format by the system
- You only generate the new reply text
```

#### 2. Enhance Draft Generation API

**File:** `/email-workflow/app/api/drafts/route.ts`

**Current Flow:**
```
1. Receive thread_id and instructions
2. Fetch thread messages
3. Call AI to generate draft
4. Return draft text
```

**New Flow:**
```
1. Receive thread_id and instructions
2. Fetch thread messages (with full bodies)
3. Call AI to generate STRUCTURED draft
4. Parse JSON response
5. Build Gmail-style quoted history
6. Combine: new_reply + "\n\n" + quoted_history
7. Return structured draft object with To, CC, subject, body
```

**New Response Format:**
```typescript
{
  "to": [{ "email": "alice@example.com", "name": "Alice" }],
  "cc": [{ "email": "john@example.com", "name": "John" }],
  "bcc": [],
  "subject": "Re: Meeting Tuesday",
  "body": "Yes that works\n\nOn Wed, Jan 10, 2026 at 2:15 PM Alice <alice@example.com> wrote:\n> Can we meet Tuesday at 2pm?\n\nOn Wed, Jan 10, 2026 at 1:00 PM Bob <bob@example.com> wrote:\n> Tuesday works for me",
  "metadata": {
    "thread_id": "abc123",
    "reply_to_message_id": "msg_xyz",
    "has_new_cc": true,
    "cc_count": 1
  }
}
```

#### 3. Implement Thread History Formatter

**File:** `/email-workflow/lib/format-thread-history.ts` (new)

**Purpose:** Convert thread messages into Gmail-style quoted blocks

**Function Signature:**
```typescript
interface Message {
  id: string;
  from: { name: string; email: string }[];
  date: number; // Unix timestamp
  body: string; // HTML or plain text
}

function formatThreadHistory(
  messages: Message[],
  currentUserEmail: string
): string;
```

**Output Format:**
```
On Wed, Jan 10, 2026 at 2:15 PM Alice <alice@example.com> wrote:
> Can we meet Tuesday at 2pm?

On Wed, Jan 10, 2026 at 1:00 PM Bob <bob@example.com> wrote:
> Tuesday works for me
```

**Implementation Details:**
- Sort messages chronologically (oldest first)
- Format each message with Gmail-style header
- Prefix each body line with `> `
- Convert HTML bodies to plain text
- Handle multi-line bodies (preserve line breaks)
- Skip the most recent message if it's from current user (don't quote own message)

#### 4. Update Draft Save API

**File:** `/email-workflow/app/api/drafts/save/route.ts`

**Current Code (lines 68-84):**
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
      cc: filteredCc,
      reply_to_message_id: latestMessageId,
    }),
  }
);
```

**Changes Needed:**
- Accept `cc` array from frontend (new)
- No longer filter CC (AI handles this)
- Body already includes quoted history (no change needed)
- Maintain `reply_to_message_id` for threading

**New Code:**
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
      body: bodyWithQuotedHistory, // Already includes history
      to,
      cc: ccRecipients, // From AI-generated draft
      reply_to_message_id: latestMessageId,
    }),
  }
);
```

#### 5. Update Frontend Display

**File:** `/email-workflow/app/inbox/ThreadDetail.tsx`

**Changes:**
- Display CC recipients in draft preview
- Show "CC: john@example.com, sarah@example.com" below To: line
- Visual indicator when new CCs detected
- Ensure quoted history renders properly (preserve line breaks)

---

## Technical Considerations

### Gmail-Style Quoted Format

Gmail uses this format for quoted replies:

```
[Your new reply text]

On [Weekday], [Month] [Day], [Year] at [Time] [Name] <[email]> wrote:
> [Line 1 of original]
> [Line 2 of original]
> [Line 3 of original]

On [Earlier date] [Earlier sender] wrote:
> [Earlier message]
```

**Key Details:**
- Blank line before each quoted section
- Full date/time with sender name and email
- `> ` prefix on every line of quoted text
- Chronological order (oldest first, bottom to top)
- Matches Gmail's native reply format

### HTML to Plain Text Conversion

Email bodies from Nylas are HTML. Need to convert to plain text for quoting.

**Library Options:**
1. **html-to-text** (npm) - Recommended
   - Preserves structure (paragraphs, lists)
   - Configurable formatting
   - Well-maintained

2. **cheerio** + custom parser
   - More control but more work
   - May be overkill

**Implementation:**
```typescript
import { convert } from 'html-to-text';

function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: 80,
    preserveNewlines: true,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' }
    ]
  });
}
```

### CC Recipient Extraction

AI must extract email addresses from:
1. **Explicit emails:** "CC john@example.com"
2. **Names from thread:** "CC John" → lookup in thread participants
3. **Multiple CCs:** "CC John and Sarah"
4. **Implicit CC:** "loop in Mike" = CC Mike

**Edge Cases:**
- Name matches multiple participants → use most recent
- Name not in thread → ask user for clarification or skip
- Ambiguous phrasing ("tell John" vs "CC John") → AI decides based on context

**Validation:**
- Email format regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Warn if email domain unusual (not in common list)
- No validation of actual deliverability (too expensive)

### Performance

**Thread Fetch:**
- Current: Fetch thread metadata only
- New: Must fetch all message bodies (larger payload)
- Mitigation: Cache thread bodies in localStorage (conversation.ts already does this)

**AI Generation:**
- Current: Simple prompt → 1-2 seconds
- New: Structured output + CC detection → 2-3 seconds
- Mitigation: Show loading indicator, acceptable for internal tool

**History Formatting:**
- Processing 20 messages × 5KB each = 100KB text
- Formatting overhead: ~50ms (negligible)

---

## Implementation Plan

### Phase 1: Structured AI Output (1-2 hours)

**Tasks:**
1. Update Braintrust prompt with structured JSON format
2. Add CC detection instructions
3. Test prompt with various CC phrases
4. Validate JSON parsing in draft generation API

**Acceptance Criteria:**
- [ ] AI returns valid JSON with to/cc/body fields
- [ ] CC detection works for "CC John", "copy Sarah", "loop in Mike"
- [ ] Email extraction works for both explicit emails and names
- [ ] Non-CC replies return empty cc array

**Test Cases:**
```
Input: "Reply to Alice saying yes"
Output: { to: ["alice@..."], cc: [], body: "Yes" }

Input: "Reply and CC john@example.com with yes"
Output: { to: ["alice@..."], cc: ["john@example.com"], body: "Yes" }

Input: "Reply and loop in Bob saying approved"
Output: { to: ["alice@..."], cc: ["bob@..."], body: "Approved" }
```

### Phase 2: Thread History Formatter (2-3 hours)

**Tasks:**
1. Create `lib/format-thread-history.ts`
2. Implement `formatThreadHistory()` function
3. Add HTML-to-text conversion with html-to-text library
4. Write unit tests for formatting edge cases
5. Test with real thread data

**Acceptance Criteria:**
- [ ] Formats messages in Gmail style with "On [date] [name] wrote:"
- [ ] Prefixes all lines with `> `
- [ ] Preserves line breaks and paragraph structure
- [ ] Handles HTML entities (quotes, ampersands)
- [ ] Skips images, converts links to plain text
- [ ] Chronological order (oldest first)

**Test Cases:**
```typescript
describe('formatThreadHistory', () => {
  it('formats single message', () => {
    const messages = [{
      from: [{ name: 'Alice', email: 'alice@example.com' }],
      date: 1704901200, // Jan 10, 2026 2:00 PM
      body: '<p>Can we meet?</p>'
    }];
    const result = formatThreadHistory(messages, 'paul@example.com');
    expect(result).toContain('On Wed, Jan 10, 2026 at 2:00 PM Alice <alice@example.com> wrote:');
    expect(result).toContain('> Can we meet?');
  });

  it('formats multiple messages chronologically', () => {
    // Test with 3 messages, verify order
  });

  it('handles multi-line bodies', () => {
    // Test with body containing \n, verify all lines quoted
  });

  it('converts HTML to plain text', () => {
    // Test with HTML tags, links, images
  });
});
```

### Phase 3: Integration & API Updates (2-3 hours)

**Tasks:**
1. Update `/api/drafts/route.ts` to:
   - Parse AI's JSON response
   - Call `formatThreadHistory()`
   - Combine new reply + quoted history
   - Return structured draft object
2. Update `/api/drafts/save/route.ts` to accept CC array
3. Remove old CC filtering logic (AI now handles)
4. Update response types in TypeScript

**Acceptance Criteria:**
- [ ] `/api/drafts` returns structured object with to/cc/body
- [ ] Body includes new reply + quoted history
- [ ] `/api/drafts/save` accepts and uses CC array
- [ ] reply_to_message_id still set for threading
- [ ] TypeScript types updated and validated

**Modified Files:**
- `/email-workflow/app/api/drafts/route.ts` (lines 30-80)
- `/email-workflow/app/api/drafts/save/route.ts` (lines 68-84)
- `/email-workflow/types/draft.ts` (new file for shared types)

### Phase 4: Frontend Updates (1-2 hours)

**Tasks:**
1. Update `ThreadDetail.tsx` to display CC recipients
2. Add "CC: email1, email2" line to draft preview
3. Ensure quoted history renders with preserved formatting
4. Add visual indicator for new CCs (badge/highlight)
5. Test long quoted histories (scrolling, truncation)

**Acceptance Criteria:**
- [ ] CC recipients visible in draft preview
- [ ] Quoted history renders with `> ` prefixes visible
- [ ] Line breaks preserved in quoted text
- [ ] Long threads scroll smoothly
- [ ] New CCs have visual indicator (optional)

**Modified Files:**
- `/email-workflow/app/inbox/ThreadDetail.tsx`
- `/email-workflow/app/inbox/styles.css` (if needed for quoted formatting)

### Phase 5: Testing & Validation (2-3 hours)

**Tasks:**
1. E2E test: Reply with CC detection
2. E2E test: Reply without CC (ensure no regression)
3. E2E test: Multi-message thread history
4. E2E test: HTML email conversion
5. Verify Gmail draft appearance (actual Gmail web UI)
6. Test edge cases (long threads, special characters, emojis)

**Test Scenarios:**

**Scenario 1: Basic CC Detection**
```
Given: Thread between Alice and Bob
When: User says "Reply yes and CC john@example.com"
Then: Draft shows To: Alice, CC: John, body includes history
```

**Scenario 2: Name-Based CC**
```
Given: Thread with participants Alice, Bob, John
When: User says "Reply approved and loop in John"
Then: Draft shows CC: John (email extracted from participants)
```

**Scenario 3: Long Thread History**
```
Given: Thread with 15 messages
When: User replies
Then: Body includes all 15 messages quoted in chronological order
```

**Scenario 4: HTML Email Handling**
```
Given: Thread with rich HTML emails (bold, links, images)
When: User replies
Then: Quoted history is plain text with preserved structure
```

**Scenario 5: Gmail Verification**
```
Given: Draft created successfully
When: User opens Gmail web UI
Then: Draft appears with CC recipients and quoted history
```

---

## Success Metrics

### Functional Requirements
- [ ] All replies include full thread history
- [ ] CC recipients properly detected from natural language
- [ ] Quoted history in Gmail-standard format
- [ ] Threading preserved (reply_to_message_id set)
- [ ] No regression in existing reply functionality

### Quality Requirements
- [ ] AI CC detection accuracy >95% on test cases
- [ ] History formatting matches Gmail's native format
- [ ] HTML-to-text conversion preserves readability
- [ ] Unit test coverage >80% for new functions
- [ ] E2E tests pass for all scenarios

### Performance Requirements
- [ ] Draft generation <5 seconds (including history formatting)
- [ ] No timeout errors on 20+ message threads
- [ ] Frontend renders quoted history smoothly (no jank)

---

## Dependencies & Prerequisites

### Required
- Braintrust API access (already configured)
- Nylas API v3 with current grant (already configured)
- email-workflow app deployed and accessible

### New Dependencies
- `html-to-text` npm package (for HTML conversion)
- Updated TypeScript types for structured draft response

### Existing Systems
- Uses current Nylas client (`/supabase/functions/_shared/lib/nylas.ts`)
- Uses current conversation storage (`/email-workflow/lib/conversation.ts`)
- Maintains current label workflow (no changes)

---

## Risks & Mitigations

### Risk 1: AI JSON Parsing Failures
**Impact:** Draft generation fails if AI returns malformed JSON

**Mitigation:**
- Add JSON validation with Zod schema
- Graceful fallback: if parsing fails, show error + raw response
- Log failures for prompt refinement
- Retry once with simplified prompt

### Risk 2: Large Thread Performance
**Impact:** 50+ message threads may timeout or exceed memory limits

**Mitigation:**
- Limit history to most recent 20 messages (configurable)
- Add loading indicator for long processing
- Consider pagination in future (show summary + "expand full history" link)

### Risk 3: HTML Conversion Quality
**Impact:** Plain text may lose important formatting or be unreadable

**Mitigation:**
- Configure html-to-text carefully (preserve lists, paragraphs)
- Test with real newsletters, rich emails
- Consider preserving some basic formatting (***bold*** via markdown)

### Risk 4: CC Name Ambiguity
**Impact:** "CC John" matches wrong person if multiple Johns exist

**Mitigation:**
- AI uses most recent participant with that name
- Add confidence score in JSON response
- Log ambiguous cases for manual review
- Future: show confirmation UI for ambiguous names

### Risk 5: Gmail Rendering Issues
**Impact:** Quoted history may not render correctly in Gmail

**Mitigation:**
- Test in actual Gmail web UI (not just preview)
- Follow Gmail's exact format (already researched)
- Test on mobile Gmail app (iOS/Android)
- Validate with different email clients (Outlook, Apple Mail)

---

## Testing Plan

### Unit Tests

**File:** `/email-workflow/lib/format-thread-history.test.ts`
- Test single message formatting
- Test multi-message chronological ordering
- Test HTML-to-text conversion
- Test special characters and emojis
- Test empty/null bodies
- Test very long messages (truncation)

**File:** `/email-workflow/lib/cc-extraction.test.ts` (if separated)
- Test explicit email extraction
- Test name-based extraction from participants
- Test multiple CC detection
- Test edge cases (no CC, ambiguous names)

### Integration Tests

**File:** `/email-workflow/app/api/drafts/route.test.ts`
- Test full flow: instructions → AI → formatting → response
- Test with real Nylas thread data
- Test error handling (AI timeout, invalid JSON)
- Test caching and performance

### E2E Tests

**Tool:** Playwright or manual testing

1. **Basic CC Reply:**
   - Open thread
   - Dictate "Reply yes and CC john@example.com"
   - Verify draft shows CC recipient
   - Verify history appears in body

2. **Name-Based CC:**
   - Dictate "Reply and loop in Alice"
   - Verify Alice's email extracted from thread

3. **No CC Reply:**
   - Dictate "Reply approved"
   - Verify no CC recipients
   - Verify history still included

4. **Long Thread:**
   - Use 20-message test thread
   - Reply and verify all messages quoted

5. **Gmail Verification:**
   - Complete draft workflow
   - Open Gmail web UI
   - Verify draft exists with CC and history

---

## Future Enhancements (Out of Scope)

### Optional Features for Later
1. **Smart History Summarization:** For threads >10 messages, show summary + expand link
2. **Attachment Handling:** Include "Original message had 2 attachments" note
3. **Inline Image Preservation:** Convert CID references to hosted URLs
4. **BCC Support:** Detect and handle BCC from dictation
5. **Multi-Language Support:** Handle non-English email content
6. **Forwarding:** Separate forward workflow (original request) for future sprint
7. **Draft Templates:** Pre-built reply templates with history
8. **History Filtering:** Option to exclude specific messages from history
9. **Rich Text History:** Preserve some HTML formatting (bold, lists)
10. **Confidence Scoring:** Show AI confidence for CC extraction, allow user override

---

## References & Research

### Internal Documentation
- `/Users/benigeri/Projects/productiviy-system/.claude/skills/email-respond/FORWARD-PLAN.md` - Original forward plan (now deprioritized)
- `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/drafts/save/route.ts:68-84` - Current draft save logic
- `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts` - Conversation storage (reuse for caching)
- `/Users/benigeri/Projects/productiviy-system/supabase/functions/_shared/lib/nylas.ts` - Nylas client library

### Email Standards
- [RFC 5322: Internet Message Format](https://datatracker.ietf.org/doc/html/rfc5322) - Email header standards
- [Gmail Threading Algorithm](https://workspaceupdates.googleblog.com/2019/03/threading-changes-in-gmail-conversation-view.html) - 2019 threading changes
- [Gmail Reply Format Best Practices](https://yamm.com/blog/how-to-forward-whole-email-chain-in-gmail/) - Quoted block format

### Nylas API
- [Nylas Messages API](https://developer.nylas.com/docs/v3/email/send-email/) - Sending with CC/BCC
- [Nylas Threading](https://support.nylas.com/hc/en-us/articles/20295511843997-Threading-behaviour-in-API-V3) - reply_to_message_id usage
- [Nylas Headers](https://developer.nylas.com/docs/v3/email/headers-mime-data/) - Custom header management

### Libraries
- [html-to-text npm](https://www.npmjs.com/package/html-to-text) - HTML conversion
- [Zod](https://zod.dev/) - Runtime validation for AI JSON responses

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review Braintrust prompt editor access
- [ ] Verify html-to-text library compatibility with Next.js 15
- [ ] Create test thread data (15-20 messages) for validation
- [ ] Backup current Braintrust prompt

### Phase 1: AI Prompt Update
- [ ] Update Braintrust system prompt with JSON schema
- [ ] Add CC detection examples to prompt
- [ ] Test prompt with 10 variations of CC phrasing
- [ ] Validate JSON output schema with Zod

### Phase 2: History Formatter
- [ ] Install html-to-text: `npm install html-to-text`
- [ ] Create `/email-workflow/lib/format-thread-history.ts`
- [ ] Implement core formatting function
- [ ] Write unit tests (10+ test cases)
- [ ] Test with real Nylas message data

### Phase 3: API Integration
- [ ] Update `/api/drafts/route.ts` response structure
- [ ] Integrate `formatThreadHistory()` into draft generation
- [ ] Update `/api/drafts/save/route.ts` CC handling
- [ ] Create TypeScript types file (`/types/draft.ts`)
- [ ] Remove old CC filtering logic

### Phase 4: Frontend
- [ ] Update `ThreadDetail.tsx` draft preview
- [ ] Add CC display line
- [ ] Test quoted history rendering
- [ ] Verify scrolling for long histories

### Phase 5: Testing
- [ ] Run unit tests: `npm test`
- [ ] E2E test 1: Basic CC detection
- [ ] E2E test 2: Name-based CC
- [ ] E2E test 3: Long thread history
- [ ] E2E test 4: HTML conversion
- [ ] Manual test in Gmail web UI

### Deployment
- [ ] Deploy updated Braintrust prompt
- [ ] Deploy email-workflow app
- [ ] Smoke test in production
- [ ] Monitor error logs for 24 hours

---

## Estimated Effort

- **Phase 1:** 1-2 hours (prompt update + testing)
- **Phase 2:** 2-3 hours (formatter + tests)
- **Phase 3:** 2-3 hours (API integration)
- **Phase 4:** 1-2 hours (frontend)
- **Phase 5:** 2-3 hours (testing + validation)

**Total:** 8-13 hours (1-2 days)

---

## Questions & Clarifications

### Resolved
✅ User wants CC functionality, not forwarding
✅ Always include history in replies (not conditional)
✅ Use Gmail-style quoted format
✅ AI should detect CC from natural language and return structured data

### Open Questions
None - all requirements clarified through user discussions

---

## Success Criteria

This feature is complete when:
1. User can dictate "Reply and CC John" and system extracts CC correctly
2. All reply drafts include full thread history in Gmail format
3. History is readable (proper HTML-to-text conversion)
4. CC recipients visible in draft preview
5. Threading maintained (reply_to_message_id works)
6. No regressions in existing reply workflow
7. E2E tests pass for all scenarios
8. Production deployment stable for 48 hours

---

## Notes

- This replaces the original "forward" feature request after clarification
- Focus is on fixing the core reply workflow first
- Forwarding can be added later if needed (separate epic)
- Internal tool priority = reliability over scalability
- AI prompt changes are fast to iterate, test thoroughly before locking in
