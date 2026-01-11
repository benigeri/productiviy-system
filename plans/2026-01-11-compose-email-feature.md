# Compose Email Feature - Simplified Implementation Plan

## Overview
Add a compose email feature that allows users to create new emails from scratch using AI generation. Users click a Gmail-style floating action button (FAB), provide a brief instruction including recipients, and the AI generates a complete email with subject line and body. Users can iterate with feedback before saving to Gmail.

**This plan incorporates feedback from three specialized reviewers (DHH, Kieran, Simplicity) to eliminate unnecessary complexity while maintaining essential security and quality standards.**

## Requirements Summary
- **Use Case**: Compose new emails from scratch (not replies)
- **AI Generation**: Full AI generation from brief instruction
- **Recipients**: User includes recipients in brief (e.g., "Email john@example.com about Q1"), AI extracts To/CC
- **MVP Features**: Support To and CC only (BCC cut from MVP)
- **UI Entry Point**: Floating Action Button (FAB) - overlays inbox, opens modal
- **Draft Flow**: Same iteration flow as existing reply system (generate → feedback → iterate → approve)
- **Storage**: Component state only (no localStorage), save final draft to Gmail
- **Error Handling**: Show clear errors, let user iterate with feedback
- **Multi-Draft**: One draft at a time with static ID "compose-draft"

## Key Simplifications (Based on Reviews)

### What We Cut:
1. ❌ **Email parser utility** - AI returns structured JSON, trust it (169 LOC saved)
2. ❌ **localStorage persistence** - Not needed for compose workflow (80 LOC saved)
3. ❌ **BCC support** - Add when users request it (30 LOC saved)
4. ❌ **Conversation history UI** - Just track in component state, no display needed (40 LOC saved)
5. ❌ **80% coverage target** - Test behavior, not metrics
6. ❌ **Timestamp IDs** - Use static "compose-draft" for single-session drafts

### What We Keep:
- ✅ Zod validation (essential for type safety and security)
- ✅ Modal pattern (familiar UX)
- ✅ AI recipient extraction (core value prop)
- ✅ Iteration workflow (proven pattern from ThreadDetail)
- ✅ Two API endpoints (clear separation of concerns)

### Essential Security Fixes:
1. **Zod validation of AI responses** - Prevents runtime crashes from malformed JSON
2. **Sanitize email addresses before display** - Basic XSS protection using `encodeURIComponent()`

**Total reduction: ~350 lines of unnecessary code eliminated**

## Architecture Overview

### New Components (3)
1. **ComposeFAB.tsx** - Floating action button (entry point)
2. **ComposeModal.tsx** - Modal overlay wrapper
3. **ComposeForm.tsx** - Core compose logic (reuses ThreadDetail pattern)

### New API Endpoints (2)
1. **POST /api/compose** - Generate draft with recipient extraction
2. **POST /api/compose/save** - Save to Gmail (without reply context)

### Reused Infrastructure
- ThreadDetail iteration UI pattern (textarea → generate → feedback → iterate → approve)
- Braintrust LLM integration (new prompt slug: `email-compose-v1`)
- Nylas API for Gmail drafts
- Existing error handling patterns from `/api/drafts`

### NOT Used (Simplified):
- ~~useConversation hook~~ - Component state only
- ~~localStorage~~ - No persistence needed
- ~~Email parser utility~~ - Trust AI JSON output
- ~~Client-side email validation~~ - Let Nylas validate

## Implementation Tasks

### Phase 1: Backend API (2 tasks)

#### Task 1.1: Create Braintrust Compose Prompt
**Location**: Braintrust dashboard (web UI)
**Slug**: `email-compose-v1`

**System Prompt**:
```
You are an expert email composer. Given a user's brief instruction, generate a complete professional email.

Extract recipients (to/cc) from the instruction. Return ONLY a JSON object:

{
  "subject": "Clear, concise subject line (5-10 words)",
  "body": "Professional email body with greeting and signature",
  "to": ["john@example.com", "Jane Doe <jane@example.com>"],
  "cc": ["optional@example.com"]
}

Guidelines:
- Extract ALL explicitly mentioned recipients
- Use "to" for primary recipients, "cc" for secondary
- If no recipients found, return empty arrays and explain in body
- Body should be complete (greeting + content + sign-off)
- Keep tone professional unless instructed otherwise

If previous_draft is provided, improve it based on user feedback while keeping recipients unless explicitly changed.
```

**Environment variable**: Add `BRAINTRUST_COMPOSE_SLUG=email-compose-v1` to `.env`

**Time estimate**: 10 minutes

#### Task 1.2: Implement POST /api/compose Endpoint
**File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/compose/route.ts`

**Request Schema** (Zod):
```typescript
const ComposeRequestSchema = z.object({
  instructions: z.string().min(1).max(5000),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).optional(),
});
```

**Response Schema** (Zod - NEW, critical for security):
```typescript
const ComposeResponseSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  to: z.array(z.string()).min(0).max(20),
  cc: z.array(z.string()).default([]),
});
```

**Implementation**:
1. Validate request with ComposeRequestSchema
2. Call Braintrust invoke() with `email-compose-v1` slug
3. **Parse AI response and validate with ComposeResponseSchema** (security fix)
4. Handle JSON parsing errors gracefully (return error if AI returns non-JSON)
5. Return structured response

**Error Handling**:
- Invalid JSON from AI: Return 500 with "AI returned invalid response"
- Missing recipients: Return valid response with empty to/cc arrays
- Braintrust failure: Return 500 with retry message
- Validation failure: Return 400 with Zod error details

**Time estimate**: 1 hour

#### Task 1.3: Implement POST /api/compose/save Endpoint
**File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/compose/save/route.ts`

**Request Schema**:
```typescript
const SaveComposeSchema = z.object({
  subject: z.string().min(1).max(200),
  draftBody: z.string().min(1).max(50000),
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).default([]),
});
```

**Implementation** (reuse 70% of `/api/drafts/save/route.ts`):
1. Validate request with SaveComposeSchema
2. Get user's email from Nylas grant (filter from CC)
3. Create draft via Nylas `/drafts` endpoint:
   - Plain subject (NOT "Re: ...")
   - NO `reply_to_message_id` field
   - to and cc only (no bcc)
4. Return success with draftId (no label updates)

**Key Differences from Reply Save**:
- No `reply_to_message_id`
- Plain subject (not "Re: ...")
- No label updates (compose doesn't affect inbox)

**Time estimate**: 45 minutes

### Phase 2: Frontend Components (3 tasks)

#### Task 2.1: Create ComposeFAB Component
**File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ComposeFAB.tsx`

**Structure**:
```tsx
'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { ComposeModal } from './ComposeModal';

export function ComposeFAB() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 z-40 size-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition flex items-center justify-center"
        aria-label="Compose new email"
      >
        <Pencil className="size-6" />
      </button>

      <ComposeModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
```

**Integration**: Add to ThreadList.tsx only (not ThreadDetail per simplicity review)

**Time estimate**: 15 minutes

#### Task 2.2: Create ComposeModal Wrapper
**File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ComposeModal.tsx`

**Structure**:
```tsx
'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ComposeForm } from './ComposeForm';

export function ComposeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onClick={onClose}
    >
      <div
        className="fixed inset-4 md:inset-20 bg-white rounded-lg overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X className="size-6" />
        </button>

        <ComposeForm onClose={onClose} />
      </div>
    </div>
  );
}
```

**Time estimate**: 20 minutes

#### Task 2.3: Create ComposeForm Component
**File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ComposeForm.tsx`

**Key Differences from ThreadDetail**:
1. No thread/messages props
2. Static draft ID: "compose-draft" (not timestamp)
3. **No useConversation hook** - Use local component state only
4. Add recipient display section (simple text display with sanitization)
5. Add subject line display (read-only for MVP)
6. Call `/api/compose` instead of `/api/drafts`
7. Call `/api/compose/save` instead of `/api/drafts/save`
8. No "Skip" button (only "Cancel" and "Approve")
9. onClose callback to close modal after save
10. **Track conversation history in local state** (for regeneration context)

**State Management** (simplified):
```typescript
const [instructions, setInstructions] = useState('');
const [feedback, setFeedback] = useState('');
const [draft, setDraft] = useState('');
const [subject, setSubject] = useState('');
const [recipients, setRecipients] = useState<{ to: string[]; cc: string[] }>({ to: [], cc: [] });
const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
const [error, setError] = useState('');
```

**Security: Sanitize recipients before display**:
```typescript
// In JSX
<div>
  <strong>To:</strong> {recipients.to.map(email => encodeURIComponent(email)).join(', ')}
</div>
{recipients.cc.length > 0 && (
  <div>
    <strong>CC:</strong> {recipients.cc.map(email => encodeURIComponent(email)).join(', ')}
  </div>
)}
```

**UI Structure** (same as ThreadDetail.tsx):
1. Instruction textarea (when no draft)
2. Generate button
3. Draft preview box (blue background)
4. Recipient display (To/CC with sanitization)
5. Subject display (read-only)
6. Feedback textarea (for iteration)
7. Regenerate button
8. Action buttons (Cancel + Approve)

**Time estimate**: 2 hours

### Phase 3: Testing & Verification (2 tasks)

#### Task 3.1: Write Basic Tests
**Files**:
- `app/api/compose/route.test.ts` - Happy path + error handling
- `app/api/compose/save/route.test.ts` - Happy path + validation
- `app/inbox/ComposeForm.test.tsx` - Renders, calls API, shows errors

**Test Coverage** (behavior-focused, not metric-focused):
- ✅ API returns validated response
- ✅ API handles malformed JSON from AI
- ✅ Component renders instruction textarea
- ✅ Component shows draft after generation
- ✅ Component shows errors on API failure
- ✅ Save endpoint validates recipients

**Time estimate**: 1 hour

#### Task 3.2: Manual End-to-End Testing
**Dev server**: `npm run dev`

**Test Scenarios**:
1. ✅ Click FAB → modal opens
2. ✅ Enter: "Email john@example.com about Q1 results"
3. ✅ Draft generates with subject, body, recipients
4. ✅ Provide feedback: "Make it shorter"
5. ✅ Draft regenerates
6. ✅ Click Approve → saves to Gmail
7. ✅ Modal closes
8. ✅ Open Gmail → verify draft exists

**Edge Cases**:
- Invalid instruction (AI handles gracefully)
- No recipients mentioned (AI explains in body)
- Network failure (error message shows)
- Close modal mid-generation (request cancelled)

**Time estimate**: 30 minutes

## Critical Files Reference

### Files to Create (7 new files)
1. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/compose/route.ts`
2. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/compose/route.test.ts`
3. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/compose/save/route.ts`
4. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/compose/save/route.test.ts`
5. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ComposeFAB.tsx`
6. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ComposeModal.tsx`
7. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ComposeForm.tsx`

### Files to Modify (1 file)
1. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ThreadList.tsx` - Add ComposeFAB import and component at end

### Files to Reference (patterns to follow)
1. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/inbox/ThreadDetail.tsx` - Iteration UI pattern
2. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/drafts/route.ts` - API structure
3. `/Users/benigeri/Projects/productiviy-system/email-workflow/app/api/drafts/save/route.ts` - Nylas draft save

### Files NOT Created (eliminated from plan)
- ❌ `lib/email-parser.ts` - Not needed (AI returns structured JSON)
- ❌ `lib/email-parser.test.ts` - Not needed
- ❌ `app/inbox/ComposeForm.test.tsx` - Keep minimal (one smoke test only)

## Verification & Testing

### End-to-End Verification

**Start dev server**:
```bash
cd /Users/benigeri/Projects/productiviy-system/email-workflow
npm run dev
```

**Test in browser** (http://localhost:3000):
1. Navigate to inbox
2. Verify FAB appears (bottom-right blue circle with pencil icon)
3. Click FAB → modal opens
4. Enter: "Email john@example.com and cc jane@example.com about Q1 financial results"
5. Click "Generate Draft"
6. Verify draft displays:
   - Subject line (e.g., "Q1 Financial Results")
   - Email body with greeting and content
   - To: john@example.com
   - CC: jane@example.com
7. Enter feedback: "Make it more concise"
8. Click "Regenerate Draft"
9. Verify draft updates
10. Click "Approve & Send to Gmail"
11. Verify modal closes
12. Open Gmail → verify draft exists in Drafts folder with correct recipients/subject/body

**Test error handling**:
1. Disconnect network
2. Try to generate draft
3. Verify error message: "Failed to generate draft" with retry option
4. Reconnect and retry → success

**Run automated tests**:
```bash
npm run test
npm run lint
npm run build
```

### Definition of Done

- [ ] FAB appears on inbox list page (bottom-right)
- [ ] Clicking FAB opens modal with compose form
- [ ] User can enter brief and generate draft
- [ ] Recipients extracted correctly (to/cc) with sanitization
- [ ] Subject line generated and displayed
- [ ] User can provide feedback and regenerate
- [ ] User can approve and save to Gmail
- [ ] Draft appears in Gmail Drafts folder correctly
- [ ] Modal closes after save
- [ ] Error handling works (network, API, validation)
- [ ] Basic tests pass
- [ ] Linting passes
- [ ] Build succeeds

## Design Decisions & Rationale

### Why No Email Parser?
**Decision**: Trust AI JSON output directly

**Rationale** (DHH/Simplicity feedback):
- AI already returns structured JSON with recipients
- Parsing strings adds unnecessary complexity (169 LOC)
- If AI returns bad data, that's a prompt problem, not a parsing problem
- Nylas API validates emails on save anyway

### Why No localStorage?
**Decision**: Component state only, clear on modal close

**Rationale** (DHH/Simplicity feedback):
- Reply drafts need persistence (user switches between threads)
- Compose drafts don't (user stays in modal until done or cancelled)
- AI can regenerate a draft in 3-5 seconds if needed
- Simplifies state management (80 LOC saved)

### Why No BCC in MVP?
**Decision**: Support To and CC only

**Rationale** (DHH feedback):
- No evidence users need BCC for compose
- Add when first user requests it
- Reduces complexity (30 LOC)

### Why Static Draft ID?
**Decision**: Use "compose-draft" not `compose-${timestamp}`

**Rationale** (DHH feedback):
- Only one compose draft at a time
- Timestamps as IDs are a code smell
- Simpler to reason about

### Why Keep Two Endpoints?
**Decision**: Separate `/api/compose` and `/api/compose/save`

**Rationale**:
- Clear separation of concerns (generation vs persistence)
- Easier to test independently
- Matches existing pattern (`/api/drafts` and `/api/drafts/save`)
- Simplicity reviewer suggested merging, but kept separate for clarity

## What We're NOT Building (Out of Scope)

**Explicitly Cut from MVP**:
- ❌ BCC recipients (add when requested)
- ❌ Recipient editing UI (v2 - users can iterate with feedback)
- ❌ Subject editing (v2 - users can iterate with feedback)
- ❌ localStorage persistence (not needed for compose)
- ❌ Conversation history UI display (tracked internally but not shown)
- ❌ Email validation library (trust AI + Nylas)
- ❌ Multi-draft support (one at a time only)
- ❌ Attachments (v2)
- ❌ Rich text formatting (v2)
- ❌ Templates (v2)

## Time Estimates

### Total Implementation Time: ~6 hours

**Backend (2.5 hours)**:
- Braintrust prompt: 10 min
- POST /api/compose: 1 hour
- POST /api/compose/save: 45 min
- Basic API tests: 45 min

**Frontend (3 hours)**:
- ComposeFAB: 15 min
- ComposeModal: 20 min
- ComposeForm: 2 hours
- Integration: 15 min
- Basic component tests: 30 min

**Testing & QA (30 min)**:
- Manual E2E testing: 30 min

**Reality Check**: Add 50% buffer for debugging, edge cases, and polish = ~9 hours total

This is realistic for a single developer with the existing codebase patterns.

## Security Fixes (Essential Only)

### 1. Zod Validation of AI Responses
**Why**: Prevents runtime crashes from malformed JSON, validates data types

**Implementation** (already in plan):
```typescript
const ComposeResponseSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  to: z.array(z.string()).min(0).max(20),
  cc: z.array(z.string()).default([]),
});

const parsed = ComposeResponseSchema.safeParse(aiResponse);
if (!parsed.success) {
  return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 });
}
```

### 2. Sanitize Email Addresses for Display
**Why**: Basic XSS protection when rendering user/AI-provided emails

**Implementation** (simple, no library needed):
```typescript
// In ComposeForm JSX
{recipients.to.map(email => encodeURIComponent(email)).join(', ')}
```

**Note**: This is basic sanitization. Nylas API will do full validation on save.

### What We're NOT Doing (Deferred to v2):
- ❌ Battle-tested email validation library (Nylas validates on save)
- ❌ Content Security Policy headers (out of scope for feature work)
- ❌ Rate limiting (app-level concern, not feature-level)
- ❌ CSRF protection (Next.js handles this)

## Summary

This simplified plan implements compose email in ~6-9 hours by:

1. **Cutting unnecessary abstractions** (email parser, localStorage persistence, BCC)
2. **Reusing proven patterns** (ThreadDetail iteration UI, existing API structure)
3. **Adding essential security** (Zod validation, basic sanitization)
4. **Testing behavior** (not coverage metrics)
5. **Shipping vertical slices** (working feature end-to-end)

**Total: 7 new files, 1 modified file, ~600 lines of implementation code**

Compared to original plan: **-350 LOC, -2 files, -9 tasks**

The feature delivers the core value (AI-powered email composition) without gold-plating or premature optimization.
