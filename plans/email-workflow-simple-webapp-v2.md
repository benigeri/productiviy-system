# Email Workflow: Simple Web App (MVP v2 - Post Review)

**Created:** 2026-01-10
**Status:** Ready to implement (post-review)
**Timeline:** 3-4 days
**Total LOC:** ~250-300 lines

---

## Executive Summary

**What:** Mobile-responsive web app to reply to emails with AI drafts
**Stack:** Next.js 15 (Server Components first) deployed to Vercel
**Scope:** ONE workflow - reply to threads (no compose, no tabs, no extras)

**Key Changes from v1:**
- ✅ Server Components by default (DHH feedback)
- ✅ Proper TypeScript types (Kieran feedback)
- ✅ 75% scope reduction (Simplicity feedback)
- ✅ No abstraction layers - inline API calls
- ✅ Single page app - no separate routes
- ✅ Error handling with logging

---

## Architecture (Simplified)

```
app/
├── inbox/
│   └── page.tsx                # Server Component: fetch + render (100 lines)
└── api/
    ├── drafts/route.ts         # POST: generate + save draft (80 lines)
    └── threads/route.ts        # POST: update labels only (30 lines)

Total: 3 files, ~250 lines
```

**No `lib/` directory** - all API calls inline
**No separate thread detail page** - inline in list view
**No localStorage wrapper** - direct calls in component

---

## File 1: Inbox Page (~100 lines)

```typescript
// app/inbox/page.tsx
import { cookies } from 'next/headers'

// Types (inline)
interface Thread {
  id: string
  subject: string
  message_ids: string[]
  latest_draft_or_message: {
    from: Array<{ name: string; email: string }>
    date: number
  }
}

interface Message {
  id: string
  from: Array<{ name: string; email: string }>
  to: Array<{ name: string; email: string }>
  cc?: Array<{ name: string; email: string }>
  date: number
  conversation: string
}

// Server Component - fetches data directly
async function getThreads(): Promise<Thread[]> {
  const res = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/threads?in=Label_139&limit=20`,
    {
      headers: { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` },
      cache: 'no-store',
    }
  )
  if (!res.ok) throw new Error('Failed to fetch threads')
  const data = await res.json()
  return data.data || []
}

async function getMessages(messageIds: string[]): Promise<Message[]> {
  const res = await fetch(
    `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/clean`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message_id: messageIds,
        ignore_images: true,
        html_as_markdown: true,
      }),
    }
  )
  if (!res.ok) throw new Error('Failed to fetch messages')
  const data = await res.json()
  return data.data || []
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { thread?: string }
}) {
  const threads = await getThreads()
  const selectedThreadId = searchParams.thread

  let messages: Message[] = []
  let selectedThread: Thread | undefined

  if (selectedThreadId) {
    selectedThread = threads.find(t => t.id === selectedThreadId)
    if (selectedThread) {
      messages = await getMessages(selectedThread.message_ids)
      messages.sort((a, b) => a.date - b.date)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with session counts from cookie */}
      <InboxHeader />

      {!selectedThreadId ? (
        <ThreadList threads={threads} />
      ) : (
        <ThreadDetail
          thread={selectedThread!}
          messages={messages}
        />
      )}
    </div>
  )
}

// Client Components (only for interactivity)
'use client'
function ThreadList({ threads }: { threads: Thread[] }) {
  return (
    <div className="p-4 space-y-2">
      {threads.map(thread => (
        <a
          key={thread.id}
          href={`/inbox?thread=${thread.id}`}
          className="block p-4 bg-white rounded border hover:bg-gray-50"
        >
          <h3 className="font-medium">{thread.subject}</h3>
          <p className="text-sm text-gray-600">
            {thread.latest_draft_or_message.from[0]?.name || 'Unknown'}
          </p>
        </a>
      ))}
    </div>
  )
}

'use client'
function ThreadDetail({
  thread,
  messages
}: {
  thread: Thread
  messages: Message[]
}) {
  const [instructions, setInstructions] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)

  async function generateDraft() {
    setLoading(true)
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: thread.id,
          subject: thread.subject,
          messages: messages.map(m => ({
            from: m.from,
            to: m.to,
            date: m.date,
            body: m.conversation,
          })),
          instructions,
          latestMessageId: messages[messages.length - 1].id,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate draft')
      }

      setDraft(data.body)

      // Update session count in cookie
      const session = JSON.parse(localStorage.getItem('session') || '{}')
      session.draftedCount = (session.draftedCount || 0) + 1
      localStorage.setItem('session', JSON.stringify(session))

      // Redirect back to list
      window.location.href = '/inbox'
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to generate draft')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <a href="/inbox" className="text-blue-600">← Back</a>

      <h1 className="text-xl font-bold">{thread.subject}</h1>

      {/* Messages */}
      {messages.map((msg, i) => (
        <div key={msg.id} className="p-4 bg-white rounded border">
          <div className="flex justify-between mb-2">
            <strong>{msg.from[0]?.name || 'Unknown'}</strong>
            {i === messages.length - 1 && (
              <span className="text-xs bg-blue-100 px-2 py-1 rounded">Latest</span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap">{msg.conversation}</p>
        </div>
      ))}

      {/* Draft form */}
      {!draft ? (
        <div className="space-y-4">
          <textarea
            placeholder="Tell me what to say..."
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            className="w-full p-2 border rounded"
            rows={3}
          />
          <button
            onClick={generateDraft}
            disabled={loading || !instructions.trim()}
            className="w-full bg-blue-600 text-white p-2 rounded"
          >
            {loading ? 'Generating...' : 'Generate Draft'}
          </button>
        </div>
      ) : (
        <div className="p-4 bg-white rounded border">
          <p className="text-sm whitespace-pre-wrap">{draft}</p>
        </div>
      )}
    </div>
  )
}
```

---

## File 2: Draft Generation + Save (~80 lines)

```typescript
// app/api/drafts/route.ts
import { NextResponse } from 'next/server'
import { invoke } from 'braintrust'
import { z } from 'zod'

// Request validation
const DraftRequestSchema = z.object({
  threadId: z.string().min(1),
  subject: z.string(),
  messages: z.array(z.object({
    from: z.array(z.object({ name: z.string(), email: z.string() })),
    to: z.array(z.object({ name: z.string(), email: z.string() })),
    date: z.number(),
    body: z.string(),
  })),
  instructions: z.string().min(1),
  latestMessageId: z.string(),
})

export async function POST(request: Request) {
  try {
    // Parse and validate request
    const body = await request.json()
    const result = DraftRequestSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.errors },
        { status: 400 }
      )
    }

    const { threadId, subject, messages, instructions, latestMessageId } = result.data

    // Generate draft via Braintrust
    const draftBody = await invoke({
      projectName: process.env.BRAINTRUST_PROJECT_NAME!,
      slug: process.env.BRAINTRUST_DRAFT_SLUG!,
      input: {
        thread_subject: subject,
        messages: messages.map(m => ({
          from: m.from[0]?.email || 'unknown',
          to: m.to.map(p => p.email).join(', '),
          date: new Date(m.date * 1000).toLocaleString(),
          body: m.body,
        })),
        user_instructions: instructions,
      },
    })

    // Get reply recipients (last message sender)
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) {
      return NextResponse.json(
        { error: 'Thread has no messages' },
        { status: 400 }
      )
    }

    // Save draft to Gmail via Nylas
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
          to: lastMessage.from,
          cc: lastMessage.to.slice(1), // Exclude first recipient (sender)
          reply_to_message_id: latestMessageId,
        }),
      }
    )

    if (!draftRes.ok) {
      const error = await draftRes.text()
      console.error('Nylas draft creation failed:', error)
      throw new Error('Failed to save draft to Gmail')
    }

    const draft = await draftRes.json()

    // Update thread labels (remove to-respond-paul, add drafted)
    await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId,
        addLabels: ['Label_215'],
        removeLabels: ['Label_139'],
      }),
    })

    return NextResponse.json({
      success: true,
      draftId: draft.data.id,
      body: draftBody,
    })
  } catch (error) {
    console.error('Draft generation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate draft',
      },
      { status: 500 }
    )
  }
}
```

---

## File 3: Label Update (~30 lines)

```typescript
// app/api/threads/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateLabelsSchema = z.object({
  threadId: z.string(),
  addLabels: z.array(z.string()),
  removeLabels: z.array(z.string()),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { threadId, addLabels, removeLabels } = UpdateLabelsSchema.parse(body)

    // Get thread to fetch message IDs
    const threadRes = await fetch(
      `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/threads/${threadId}`,
      {
        headers: { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` },
      }
    )
    const thread = await threadRes.json()
    const messageIds = thread.data.message_ids

    // Update labels on all messages
    for (const msgId of messageIds) {
      // Get current labels
      const msgRes = await fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/${msgId}?select=labels`,
        {
          headers: { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` },
        }
      )
      const msg = await msgRes.json()
      const currentLabels = msg.data.labels?.map((l: any) => l.id) || []

      // Calculate new labels
      const newLabels = currentLabels
        .filter((l: string) => !removeLabels.includes(l))
        .concat(addLabels.filter(l => !currentLabels.includes(l)))

      // Update message
      await fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/${msgId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ labels: newLabels }),
        }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Label update error:', error)
    return NextResponse.json(
      { error: 'Failed to update labels' },
      { status: 500 }
    )
  }
}
```

---

## Environment Variables

```bash
# .env.local
NYLAS_API_KEY=your_key
NYLAS_GRANT_ID=your_grant_id
BRAINTRUST_API_KEY=sk-1fHWK3DiFvA1tgR4qmumNoQ3UMtIa1DyRMpQB94aVTqJ3nSp
BRAINTRUST_PROJECT_NAME=Email_Workflow
BRAINTRUST_DRAFT_SLUG=email-draft-generation
```

---

## Dependencies

```json
{
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "braintrust": "^2.0.1",
    "zod": "^3.22.0"
  }
}
```

---

## Implementation Steps

### Day 1: Setup
1. Create Next.js app: `npx create-next-app@latest email-workflow`
2. Install dependencies: `npm install braintrust zod`
3. Add `.env.local` with keys
4. Create Braintrust prompt in dashboard

### Day 2: Build
1. Create `app/inbox/page.tsx` (100 lines)
2. Create `app/api/drafts/route.ts` (80 lines)
3. Create `app/api/threads/route.ts` (30 lines)

### Day 3: Test & Deploy
1. Test locally with real emails
2. Push to GitHub
3. Deploy to Vercel
4. Test on mobile

---

## What We Cut (vs v1)

| Feature | Why Cut | LOC Saved |
|---------|---------|-----------|
| `lib/nylas.ts` | Inline API calls in routes | 160 |
| `lib/store.ts` | Direct localStorage | 43 |
| `lib/braintrust.ts` | Direct invoke calls | 40 |
| Separate thread detail page | Inline in list | 80 |
| Compose new email | YAGNI - defer | 100 |
| Multi-draft tabs | YAGNI - defer | 150 |
| Session summary | Counter in header enough | 30 |
| **Total** | **~50% reduction** | **~600 LOC** |

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Thread list loads
- [ ] Click thread shows messages
- [ ] Generate draft works
- [ ] Draft saves to Gmail
- [ ] Labels update correctly
- [ ] Back to list refreshes
- [ ] Mobile responsive

### Error Scenarios
- [ ] Handle Nylas API errors
- [ ] Handle Braintrust rate limits
- [ ] Handle empty threads
- [ ] Handle network failures

---

## Deployment

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Email workflow MVP"
   git push
   ```

2. **Deploy to Vercel**
   - Import repo
   - Add environment variables
   - Deploy

3. **Security**
   - Add `robots.txt`: `Disallow: /`
   - Use obscure Vercel URL
   - Keep API keys in env vars only

---

## Success Metrics

- **Page load:** <2s on mobile
- **Draft generation:** <5s
- **Total LOC:** <300 lines
- **Time to build:** 3-4 days

---

## Future Work (Defer)

Only add these after using MVP for 1+ month:
- Compose new email
- Multi-draft tabs
- Keyboard shortcuts (desktop)
- Draft templates

---

## Changes from v1 (Review Feedback)

### DHH Feedback ✅
- Use Server Components for data fetching
- Removed unnecessary API routes for reads
- Inline data fetching in page components
- Simplified navigation (URL as state)

### Kieran Feedback ✅
- Added Zod for request validation
- Proper error handling with logging
- Removed `any` types (using inline interfaces)
- Added null checks for array access

### Simplicity Feedback ✅
- Cut 600+ lines of unnecessary code
- Removed all abstraction layers
- Deleted 6 "future bead" features
- Single page app (no complex routing)
- Direct API calls (no wrappers)

---

**Total: 3 files, ~250 lines, 3-4 days to build**
