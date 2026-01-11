# Braintrust Email Draft Prompt Specification

## Prompt Details
- **Project:** Email_Workflow
- **Slug:** email-draft-generation
- **Model:** (TBD - test with Sonnet 3.5 or GPT-4)

---

## Input Schema

```typescript
{
  thread_subject: string,           // Email subject line
  messages: Array<{                 // Chronological thread history
    from: string,                   // Email address
    to: string,                     // Comma-separated emails
    date: string,                   // Human-readable date
    body: string                    // Message content
  }>,
  user_instructions: string         // User's natural language instructions
}
```

### Example Input
```json
{
  "thread_subject": "Q4 Budget Review",
  "messages": [
    {
      "from": "alice@example.com",
      "to": "paul@archive.com",
      "date": "Wed, Jan 8, 2026 at 2:30 PM",
      "body": "Can we schedule a budget review meeting?"
    },
    {
      "from": "paul@archive.com",
      "to": "alice@example.com",
      "date": "Wed, Jan 8, 2026 at 3:15 PM",
      "body": "Sure, I'm available Tuesday or Thursday."
    }
  ],
  "user_instructions": "Reply confirming Thursday at 2pm and CC bob@example.com"
}
```

---

## Output Schema (Structured JSON)

```typescript
{
  to: string[],      // Primary recipients (usually last sender)
  cc: string[],      // CC recipients extracted from instructions
  body: string       // Reply text ONLY (no quoted history)
}
```

### Example Output
```json
{
  "to": ["alice@example.com"],
  "cc": ["bob@example.com"],
  "body": "Perfect! Thursday at 2pm works for me. I'll see you then.\n\nPaul"
}
```

---

## CC Detection Examples

User should be able to say CC in various natural language forms:

| User Instructions | Expected CC |
|-------------------|-------------|
| "Reply yes and CC john@example.com" | ["john@example.com"] |
| "Confirm and loop in Bob" | Extract bob's email from thread participants |
| "Reply approved and copy Sarah and Mike" | Extract both emails from thread |
| "CC the whole team on this" | Extract all thread participants except sender |
| "Reply thanks" (no CC) | [] (empty array) |

---

## Prompt Template (Draft v1)

```handlebars
You are an email assistant that helps draft professional replies.

Your task: Generate a structured JSON reply based on the user's instructions and email thread context.

## Thread Subject
{{thread_subject}}

## Previous Messages (Chronological)
{{#each messages}}
---
From: {{this.from}}
To: {{this.to}}
Date: {{this.date}}

{{this.body}}
{{/each}}
---

## User Instructions
{{user_instructions}}

## Output Format (IMPORTANT)

You MUST return ONLY valid JSON in this exact format:

```json
{
  "to": ["email@example.com"],
  "cc": ["email@example.com"],
  "body": "Your reply text here"
}
```

## Rules

1. **TO recipients**: Usually the sender of the last message. Include full email addresses.

2. **CC recipients**:
   - Extract from natural language cues like "CC", "copy", "loop in", "include"
   - If user mentions a name only, try to find their email from thread participants
   - If email not found in thread, use the name as-is (e.g., "john@example.com" if they said "CC John")
   - Return empty array [] if no CC mentioned

3. **Body**:
   - Write ONLY the new reply text
   - Do NOT include quoted previous messages
   - Do NOT add "On [date] [person] wrote:" sections
   - Follow the user's instructions exactly
   - Match the tone of the thread (professional, casual, etc.)
   - Keep it concise unless user asks for detail

4. **Signature**: Include a simple sign-off with "Paul" (the sender's name)

## Examples

Example 1:
Instructions: "Reply yes and CC bob@company.com"
Output:
```json
{
  "to": ["alice@example.com"],
  "cc": ["bob@company.com"],
  "body": "Yes, that works for me!\n\nPaul"
}
```

Example 2:
Instructions: "Tell them I need more time, loop in Sarah"
(Sarah's email is sarah@example.com from thread participants)
Output:
```json
{
  "to": ["alice@example.com"],
  "cc": ["sarah@example.com"],
  "body": "I'll need a bit more time on this. Can we push the deadline to next week?\n\nPaul"
}
```

Example 3:
Instructions: "Reply thanks" (no CC)
Output:
```json
{
  "to": ["alice@example.com"],
  "cc": [],
  "body": "Thanks for the update!\n\nPaul"
}
```

Now generate the reply:
```

---

## Testing Checklist

- [ ] Returns valid JSON (not plain text)
- [ ] JSON has `to`, `cc`, `body` keys
- [ ] `to` is an array of email addresses
- [ ] `cc` is an array (empty if no CC mentioned)
- [ ] `body` contains ONLY new reply (no quoted history)
- [ ] CC detection works for "CC [email]"
- [ ] CC detection works for "loop in [name]"
- [ ] CC detection works for "copy [name]"
- [ ] Handles no CC case (empty array)
- [ ] Reply follows user instructions
- [ ] Tone matches thread context
- [ ] Sign-off includes "Paul"

---

## Integration Notes

Once prompt works in testing:

1. **Update app/api/drafts/route.ts:**
   - Parse JSON response
   - Add fallback for malformed JSON
   - Return structured data to frontend

2. **Update app/inbox/ThreadDetail.tsx:**
   - Display CC recipients if present
   - Show only new reply body (not duplicated history)

3. **Update app/api/drafts/save/route.ts:**
   - Pass through `cc` array to Nylas API
   - Already supports this! Just need to send it

---

## Migration Plan

**Step 1:** Create prompt in Braintrust UI with template above
**Step 2:** Test with `npx tsx scripts/test-braintrust-prompt.ts`
**Step 3:** Iterate prompt until all checklist items pass
**Step 4:** Update app code to use structured output
**Step 5:** Test end-to-end in development
**Step 6:** Deploy to production
