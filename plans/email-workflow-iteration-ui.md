# Email Workflow: Iteration UI Improvements

**Created:** 2026-01-10
**Status:** Ready to implement
**Epic:** productiviy-system-2m4
**Branch Strategy:** One PR per bead, merge to main after review

---

## Problem Statement

Current web app (https://email-workflow-phi.vercel.app) has UX issues:

1. ❌ **Auto-saves to Gmail immediately** - No chance to review/iterate
2. ❌ **No feedback loop** - Can't refine drafts with follow-up instructions
3. ❌ **No Skip button** - Must draft every email or refresh page
4. ❌ **No Approve button** - Auto-saves without confirmation
5. ❌ **Plain HTML forms** - Basic styling, not mobile-optimized

---

## Solution: Iteration-First Workflow

### New User Flow

```
1. Select email thread
   ↓
2. View messages + enter initial instructions
   ↓
3. Generate draft → Shows in preview (NOT saved to Gmail)
   ↓
4. Review draft with options:
   - Give feedback → Regenerate (iterate)
   - Skip → Go to next email (no save)
   - Approve → Save to Gmail + advance to next
   ↓
5. Repeat for next email
```

### Key Principles

- **Draft in UI only** - Gmail is the final destination, not interim storage
- **Iterate freely** - No consequences until Approve
- **Fast navigation** - Skip and auto-advance for speed
- **Persist state** - Survive page refresh while iterating
- **Clean on approve** - Clear conversation state after save

---

## Technical Architecture

### Conversation State (localStorage)

```typescript
// Key: email-workflow-conversations
{
  [threadId]: {
    messages: [
      { role: 'user', content: 'Write a friendly reply' },
      { role: 'assistant', content: '<p>Thanks for reaching out...</p>' },
      { role: 'user', content: 'Make it more concise' },
      { role: 'assistant', content: '<p>Thanks! Here are the details...</p>' }
    ],
    currentDraft: '<p>Latest draft HTML</p>',
    timestamp: 1704902400000
  }
}
```

**Lifecycle:**
- Created when first draft generated
- Updated on each feedback iteration
- Cleared when Approve clicked
- Survives page refresh

### API Routes

#### POST /api/drafts (Modified)
**Purpose:** Generate draft via Braintrust (no Gmail save)

**Request:**
```typescript
{
  threadId: string
  subject: string
  messages: Message[]  // Thread messages
  conversation: [      // Iteration history
    { role: 'user', content: 'Initial instruction' },
    { role: 'assistant', content: 'Previous draft' },
    { role: 'user', content: 'Feedback' }  // Latest
  ]
}
```

**Response:**
```typescript
{
  draft: '<p>Generated HTML</p>'
}
```

**Changes from current:**
- ❌ Remove Nylas draft save
- ❌ Remove label updates
- ✅ Add conversation history support
- ✅ Return draft only

#### PUT /api/drafts (New)
**Purpose:** Save approved draft to Gmail + update labels

**Request:**
```typescript
{
  threadId: string
  subject: string
  draft: string        // Final approved HTML
  latestMessageId: string
}
```

**Response:**
```typescript
{
  success: true
  draftId: string
  nextThreadId?: string  // For auto-advance
}
```

**Implementation:**
- Save draft to Gmail via Nylas
- Update labels (remove to-respond-paul, add drafted)
- Return next thread ID from inbox

---

## Implementation Plan

### Phase 1: Install shadcn (Bead: productiviy-system-rbm)

**Branch:** `feature/email-workflow-shadcn`

**Steps:**
```bash
cd email-workflow
npx shadcn@latest init

# Answer prompts:
# - TypeScript: yes
# - Style: Default
# - Color: Slate
# - CSS variables: yes
# - Tailwind config: tailwind.config.ts
# - Components: @/components
# - Utils: @/lib/utils

# Add components
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add textarea
npx shadcn@latest add input
npx shadcn@latest add badge
```

**Verification:**
- `components/ui/` directory created
- `lib/utils.ts` created
- Components render without errors
- No build warnings

**PR:** One PR with all shadcn setup

---

### Phase 2: Conversation State (Bead: productiviy-system-8a4)

**Branch:** `feature/email-workflow-conversation-state`

**Files to create:**
```typescript
// email-workflow/lib/conversation.ts
export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Conversation {
  messages: Message[]
  currentDraft: string
  timestamp: number
}

export function getConversation(threadId: string): Conversation | null {
  // Load from localStorage
}

export function saveConversation(threadId: string, conv: Conversation): void {
  // Save to localStorage
}

export function clearConversation(threadId: string): void {
  // Remove from localStorage
}

export function addMessage(threadId: string, message: Message): void {
  // Append to existing conversation
}
```

**Hook:**
```typescript
// email-workflow/hooks/useConversation.ts
export function useConversation(threadId: string) {
  const [conversation, setConversation] = useState<Conversation | null>(null)

  // Load on mount, save on change
  // Return: { conversation, addMessage, clear, currentDraft }
}
```

**Test:**
- Manual: Open thread, add messages, refresh page
- Should persist messages
- Clear should remove from localStorage

**PR:** One PR with state management

---

### Phase 3: Refactor Generation (Bead: productiviy-system-xhs)

**Branch:** `feature/email-workflow-no-autosave`

**API Route Changes:**
```typescript
// email-workflow/app/api/drafts/route.ts

export async function POST(request: Request) {
  const { threadId, subject, messages, conversation } = await request.json()

  // Generate draft via Braintrust (pass conversation for context)
  const draft = await invoke({
    projectName: process.env.BRAINTRUST_PROJECT_NAME!,
    slug: process.env.BRAINTRUST_DRAFT_SLUG!,
    input: {
      thread_subject: subject,
      thread_messages: messages,
      conversation_history: conversation  // NEW: iteration context
    }
  })

  // Return draft only (no save, no label update)
  return NextResponse.json({ draft })
}
```

**UI Changes:**
```typescript
// email-workflow/app/inbox/ThreadDetail.tsx

async function generateDraft() {
  const res = await fetch('/api/drafts', {
    method: 'POST',
    body: JSON.stringify({
      threadId,
      subject,
      messages,
      conversation: conversation?.messages || []
    })
  })

  const { draft } = await res.json()

  // Save to conversation state (localStorage)
  addMessage({ role: 'assistant', content: draft })

  // DON'T redirect, DON'T save to Gmail
}
```

**Verification:**
- Draft generates
- Shows in UI
- Does NOT appear in Gmail
- Labels unchanged

**PR:** One PR with refactored generation

---

### Phase 4: Skip/Approve Buttons (Bead: productiviy-system-n0i)

**Branch:** `feature/email-workflow-skip-approve`

**New API Route:**
```typescript
// email-workflow/app/api/drafts/approve/route.ts

export async function PUT(request: Request) {
  const { threadId, subject, draft, latestMessageId } = await request.json()

  // 1. Save draft to Gmail
  const draftRes = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/drafts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: `Re: ${subject}`,
        body: draft,
        to: lastMessage.from,
        cc: lastMessage.to.slice(1),
        reply_to_message_id: latestMessageId
      })
    }
  )

  // 2. Update labels
  await updateThreadLabels(threadId, ['Label_215'], ['Label_139'])

  // 3. Get next thread
  const threads = await getThreads()
  const currentIndex = threads.findIndex(t => t.id === threadId)
  const nextThread = threads[currentIndex + 1]

  return NextResponse.json({
    success: true,
    nextThreadId: nextThread?.id
  })
}
```

**UI:**
```typescript
// ThreadDetail.tsx

<Card>
  <CardContent>
    {/* Draft preview */}
    <div dangerouslySetInnerHTML={{ __html: currentDraft }} />

    {/* Action buttons */}
    <div className="flex gap-2 mt-4">
      <Button variant="outline" onClick={handleSkip}>
        Skip
      </Button>
      <Button onClick={handleApprove}>
        Approve & Send to Gmail
      </Button>
    </div>
  </CardContent>
</Card>

async function handleSkip() {
  clearConversation(threadId)
  // Go to next thread (get from inbox)
  const nextId = getNextThreadId()
  router.push(`/inbox?thread=${nextId}`)
}

async function handleApprove() {
  const res = await fetch('/api/drafts/approve', {
    method: 'PUT',
    body: JSON.stringify({
      threadId,
      subject,
      draft: currentDraft,
      latestMessageId
    })
  })

  const { nextThreadId } = await res.json()

  clearConversation(threadId)

  if (nextThreadId) {
    router.push(`/inbox?thread=${nextThreadId}`)
  } else {
    router.push('/inbox')
  }
}
```

**Test:**
- Skip: advances without saving, labels unchanged
- Approve: saves to Gmail, updates labels, advances
- Last email: returns to inbox

**PR:** One PR with Skip/Approve buttons

---

### Phase 5: Feedback Loop (Bead: productiviy-system-ohj)

**Branch:** `feature/email-workflow-feedback-loop`

**UI:**
```typescript
// ThreadDetail.tsx

const [feedback, setFeedback] = useState('')
const [regenerating, setRegenerating] = useState(false)

<Card>
  <CardHeader>
    <h3>Draft Preview</h3>
  </CardHeader>
  <CardContent>
    {/* Current draft */}
    <div dangerouslySetInnerHTML={{ __html: currentDraft }} />

    {/* Feedback textarea */}
    <Textarea
      placeholder="Give feedback to improve the draft..."
      value={feedback}
      onChange={e => setFeedback(e.target.value)}
      className="mt-4"
    />

    <Button
      onClick={handleRegenerate}
      disabled={regenerating || !feedback.trim()}
      className="mt-2"
    >
      {regenerating ? 'Regenerating...' : 'Regenerate'}
    </Button>
  </CardContent>
</Card>

async function handleRegenerate() {
  setRegenerating(true)

  // Add feedback to conversation
  addMessage({ role: 'user', content: feedback })

  // Regenerate with full conversation history
  const res = await fetch('/api/drafts', {
    method: 'POST',
    body: JSON.stringify({
      threadId,
      subject,
      messages,
      conversation: conversation.messages
    })
  })

  const { draft } = await res.json()

  // Update conversation with new draft
  addMessage({ role: 'assistant', content: draft })

  setFeedback('')
  setRegenerating(false)
}
```

**Test:**
- Type feedback → Regenerate
- Draft updates
- Can iterate multiple times
- Conversation history persists

**PR:** One PR with feedback loop

---

## Testing Strategy

### Manual Testing Checklist

**Per Bead:**
- [ ] Phase 1: shadcn components render correctly
- [ ] Phase 2: Conversation state persists on refresh
- [ ] Phase 3: Draft generates without Gmail save
- [ ] Phase 4: Skip/Approve buttons work as expected
- [ ] Phase 5: Feedback loop regenerates drafts

**End-to-End Flow:**
1. [ ] Open email thread
2. [ ] Enter instructions → Generate draft
3. [ ] Draft appears in UI (not in Gmail)
4. [ ] Give feedback → Regenerate
5. [ ] Draft updates correctly
6. [ ] Click Skip → Advances to next email
7. [ ] Enter instructions → Generate → Approve
8. [ ] Draft appears in Gmail
9. [ ] Labels updated (to-respond-paul → drafted)
10. [ ] Auto-advances to next email

### Mobile Testing
- [ ] Responsive on iPhone (Safari)
- [ ] Buttons are tappable
- [ ] Textarea resizes correctly
- [ ] No horizontal scroll

---

## Deployment

Each phase deploys independently via Vercel:

```bash
# After each PR merge to main
git checkout main && git pull
cd email-workflow

# Vercel auto-deploys on push to main
# Verify at: https://email-workflow-phi.vercel.app
```

---

## File Structure Changes

```
email-workflow/
├── app/
│   ├── inbox/
│   │   ├── page.tsx                  # Modified: conversation state
│   │   └── ThreadDetail.tsx          # Modified: Skip/Approve/Feedback UI
│   └── api/
│       ├── drafts/
│       │   ├── route.ts              # Modified: no auto-save
│       │   └── approve/
│       │       └── route.ts          # NEW: save to Gmail
│       └── threads/route.ts          # Unchanged
├── components/
│   └── ui/                           # NEW: shadcn components
│       ├── button.tsx
│       ├── card.tsx
│       ├── textarea.tsx
│       ├── input.tsx
│       └── badge.tsx
├── lib/
│   ├── utils.ts                      # NEW: shadcn utils
│   └── conversation.ts               # NEW: state management
└── hooks/
    └── useConversation.ts            # NEW: conversation hook
```

---

## Success Metrics

- [ ] Can iterate on drafts multiple times
- [ ] Skip button works (no Gmail save)
- [ ] Approve button saves to Gmail + advances
- [ ] UI looks polished with shadcn
- [ ] State persists on page refresh
- [ ] Auto-advance works on last email
- [ ] Mobile-responsive and usable

---

## Future Enhancements (Defer)

- Keyboard shortcuts (Cmd+Enter to approve)
- Show conversation history in UI
- Undo last iteration
- Save drafts locally without Gmail
- Compose new emails from scratch
- Forward functionality

---

**Last Updated:** 2026-01-10
**Status:** Ready to implement Phase 1
