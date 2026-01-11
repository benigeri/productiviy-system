# Email Workflow: Simple Web App (MVP)

**Created:** 2026-01-10
**Status:** Ready to implement
**Timeline:** 2-3 weeks

---

## Executive Summary

Build a simple, mobile-responsive web app for email workflow with two modes:
1. **Reply to existing threads** (with AI draft generation)
2. **Compose new emails** (future bead)

**Stack:** Next.js 15 (TypeScript-only) deployed to Vercel
**Scope:** Email only - no calendar, no linear, no fancy features
**UI:** shadcn components, simple and clean
**State:** localStorage (survive refresh, no cross-device sync)
**LLM Logging:** Braintrust invoke for all AI calls

---

## Architecture

### TypeScript-Only Stack

```
┌─────────────────────────────────────────────────────────┐
│              Next.js 15 (Vercel)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Frontend (React)                                 │  │
│  │  - app/inbox/page.tsx                            │  │
│  │  - app/compose/page.tsx                          │  │
│  │  - components/ (shadcn UI)                       │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  API Routes (Server-Side)                        │  │
│  │  - app/api/threads/route.ts                      │  │
│  │  - app/api/draft/route.ts (Braintrust invoke)    │  │
│  │  - app/api/drafts/create/route.ts                │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Lib (Shared Utils)                              │  │
│  │  - lib/nylas.ts (Nylas API client)               │  │
│  │  - lib/braintrust.ts (LLM calls)                 │  │
│  │  - lib/store.ts (localStorage wrapper)           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  External APIs                          │
│  - Nylas (email threads, messages, drafts)             │
│  - Braintrust (LLM invocation with Claude)             │
└─────────────────────────────────────────────────────────┘
```

**Why TypeScript-only:**
- Simpler: one language, one deployment
- You're rewriting TMUX orchestration anyway
- Core logic is simple (fetch → LLM → create draft)
- ~500-800 lines vs maintaining ~2,885 Python lines
- Single Vercel deployment (no separate FastAPI)

---

## Project Structure

```
productivity-system/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home (redirect to /inbox)
│   ├── inbox/
│   │   └── page.tsx            # Email workflow (reply mode)
│   ├── compose/
│   │   └── page.tsx            # Compose new email (future bead)
│   └── api/
│       ├── threads/
│       │   └── route.ts        # GET /api/threads
│       ├── thread/
│       │   └── [id]/
│       │       └── route.ts    # GET /api/thread/[id]
│       ├── draft/
│       │   └── route.ts        # POST /api/draft (Braintrust invoke)
│       └── drafts/
│           └── create/
│               └── route.ts    # POST /api/drafts/create
├── components/
│   ├── ui/                     # shadcn components
│   ├── email-list.tsx          # Thread list (mobile: full screen)
│   ├── email-detail.tsx        # Thread view (mobile: full screen)
│   └── draft-editor.tsx        # Draft composer (mobile: full screen)
├── lib/
│   ├── nylas.ts                # Nylas API client
│   ├── braintrust.ts           # Braintrust invoke wrapper
│   ├── store.ts                # localStorage utilities
│   └── utils.ts                # shadcn utils
├── .env.local
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## Implementation Phases

### Phase 1: Setup & Infrastructure (Days 1-2)

**Goal:** Create Next.js app, install dependencies, setup Braintrust

**Tasks:**

1. **Create Next.js 15 app**
   ```bash
   npx create-next-app@latest email-workflow --typescript --app --tailwind
   cd email-workflow
   ```

2. **Install dependencies**
   ```bash
   npm install braintrust dotenv
   npm install @radix-ui/react-* class-variance-authority clsx tailwind-merge
   npm install lucide-react
   ```

3. **Setup shadcn/ui**
   ```bash
   npx shadcn@latest init
   npx shadcn@latest add button input textarea card scroll-area
   ```

4. **Environment variables**
   ```bash
   # .env.local
   NYLAS_API_KEY=your_key
   NYLAS_GRANT_ID=your_grant_id

   BRAINTRUST_API_KEY=sk-...
   BRAINTRUST_PROJECT_NAME=Email_Workflow
   BRAINTRUST_DRAFT_SLUG=email-draft-generation
   BRAINTRUST_COMPOSE_SLUG=email-compose-generation
   ```

5. **Create Braintrust prompts**
   - Go to Braintrust dashboard
   - Create project: "Email_Workflow"
   - Create prompt: "email-draft-generation" (for replies)
   - Create prompt: "email-compose-generation" (for new emails)
   - Get slugs and add to `.env.local`

**Acceptance Criteria:**
- [ ] Next.js app runs (`npm run dev`)
- [ ] shadcn components render
- [ ] Environment variables loaded
- [ ] Braintrust prompts created

**Files to create:**
- `app/layout.tsx` - Root layout
- `app/page.tsx` - Home page (redirect to /inbox)
- `.env.local` - Environment variables
- `lib/utils.ts` - shadcn utils

---

### Phase 2: Nylas Integration (Days 3-4)

**Goal:** Fetch email threads and messages from Nylas

**Tasks:**

1. **Create Nylas client library**
   ```typescript
   // lib/nylas.ts
   const NYLAS_API_KEY = process.env.NYLAS_API_KEY!
   const NYLAS_GRANT_ID = process.env.NYLAS_GRANT_ID!
   const NYLAS_BASE_URL = 'https://api.us.nylas.com/v3'

   const LABEL_TO_RESPOND = 'Label_139'  // to-respond-paul
   const LABEL_DRAFTED = 'Label_215'     // drafted

   interface Thread {
     id: string
     subject: string
     message_ids: string[]
     latest_draft_or_message: any
   }

   interface Message {
     id: string
     from: Array<{ name: string; email: string }>
     to: Array<{ name: string; email: string }>
     cc: Array<{ name: string; email: string }>
     subject: string
     conversation: string  // From Clean Messages API
     date: number
   }

   export async function getThreads(): Promise<Thread[]> {
     const res = await fetch(
       `${NYLAS_BASE_URL}/grants/${NYLAS_GRANT_ID}/threads?in=${LABEL_TO_RESPOND}&limit=20`,
       {
         headers: { Authorization: `Bearer ${NYLAS_API_KEY}` },
         cache: 'no-store',  // Always fetch fresh
       }
     )
     const data = await res.json()
     return data.data || []
   }

   export async function getThread(threadId: string): Promise<Thread> {
     const res = await fetch(
       `${NYLAS_BASE_URL}/grants/${NYLAS_GRANT_ID}/threads/${threadId}`,
       {
         headers: { Authorization: `Bearer ${NYLAS_API_KEY}` },
         cache: 'no-store',
       }
     )
     const data = await res.json()
     return data.data
   }

   export async function cleanMessages(messageIds: string[]): Promise<Message[]> {
     const BATCH_SIZE = 20
     const allMessages: Message[] = []

     for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
       const batch = messageIds.slice(i, i + BATCH_SIZE)
       const res = await fetch(
         `${NYLAS_BASE_URL}/grants/${NYLAS_GRANT_ID}/messages/clean`,
         {
           method: 'PUT',
           headers: {
             Authorization: `Bearer ${NYLAS_API_KEY}`,
             'Content-Type': 'application/json',
           },
           body: JSON.stringify({
             message_id: batch,
             ignore_images: true,
             ignore_links: false,
             html_as_markdown: true,
           }),
         }
       )
       const data = await res.json()
       allMessages.push(...(data.data || []))
     }

     return allMessages
   }

   export async function createDraft(params: {
     threadId: string
     subject: string
     body: string
     to: Array<{ email: string; name?: string }>
     cc?: Array<{ email: string; name?: string }>
   }) {
     // Get latest message ID for reply_to_message_id
     const thread = await getThread(params.threadId)
     const latestMessageId = thread.message_ids[thread.message_ids.length - 1]

     const res = await fetch(
       `${NYLAS_BASE_URL}/grants/${NYLAS_GRANT_ID}/drafts`,
       {
         method: 'POST',
         headers: {
           Authorization: `Bearer ${NYLAS_API_KEY}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           subject: params.subject,
           body: params.body,
           to: params.to,
           cc: params.cc || [],
           reply_to_message_id: latestMessageId,
         }),
       }
     )
     const data = await res.json()
     return data.data
   }

   export async function updateThreadLabels(
     threadId: string,
     addLabels: string[],
     removeLabels: string[]
   ) {
     const thread = await getThread(threadId)
     const messageIds = thread.message_ids

     for (const msgId of messageIds) {
       // Get current labels
       const msgRes = await fetch(
         `${NYLAS_BASE_URL}/grants/${NYLAS_GRANT_ID}/messages/${msgId}?select=folders,labels`,
         {
           headers: { Authorization: `Bearer ${NYLAS_API_KEY}` },
         }
       )
       const msg = await msgRes.json()
       const currentLabels = msg.data.labels?.map((l: any) => l.id) || []
       const currentFolders = msg.data.folders?.map((f: any) => f.id) || []

       // Update labels
       const newLabels = currentLabels
         .filter((l: string) => !removeLabels.includes(l))
         .concat(addLabels.filter((l: string) => !currentLabels.includes(l)))

       // Filter out unsettable folders
       const UNSETTABLE = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM']
       const settableFolders = currentFolders.filter(
         (f: string) => !UNSETTABLE.includes(f.toUpperCase())
       )

       await fetch(
         `${NYLAS_BASE_URL}/grants/${NYLAS_GRANT_ID}/messages/${msgId}`,
         {
           method: 'PUT',
           headers: {
             Authorization: `Bearer ${NYLAS_API_KEY}`,
             'Content-Type': 'application/json',
           },
           body: JSON.stringify({
             labels: newLabels,
             folders: settableFolders,
           }),
         }
       )
     }
   }
   ```

2. **Create API routes**
   ```typescript
   // app/api/threads/route.ts
   import { NextResponse } from 'next/server'
   import { getThreads } from '@/lib/nylas'

   export async function GET() {
     try {
       const threads = await getThreads()
       return NextResponse.json({ threads })
     } catch (error) {
       return NextResponse.json(
         { error: 'Failed to fetch threads' },
         { status: 500 }
       )
     }
   }
   ```

   ```typescript
   // app/api/thread/[id]/route.ts
   import { NextResponse } from 'next/server'
   import { getThread, cleanMessages } from '@/lib/nylas'

   export async function GET(
     request: Request,
     { params }: { params: { id: string } }
   ) {
     try {
       const thread = await getThread(params.id)
       const messages = await cleanMessages(thread.message_ids)

       // Sort oldest to newest
       messages.sort((a, b) => a.date - b.date)

       return NextResponse.json({ thread, messages })
     } catch (error) {
       return NextResponse.json(
         { error: 'Failed to fetch thread' },
         { status: 500 }
       )
     }
   }
   ```

**Acceptance Criteria:**
- [ ] `/api/threads` returns list of threads
- [ ] `/api/thread/[id]` returns thread + messages
- [ ] Messages sorted oldest → newest
- [ ] Error handling works

**Files to create:**
- `lib/nylas.ts` - Nylas API client
- `app/api/threads/route.ts` - List threads
- `app/api/thread/[id]/route.ts` - Get thread detail

---

### Phase 3: Braintrust LLM Integration (Days 5-6)

**Goal:** Generate drafts using Braintrust invoke

**Tasks:**

1. **Create Braintrust wrapper**
   ```typescript
   // lib/braintrust.ts
   import { login, invoke, wrapTraced, initLogger } from 'braintrust'

   // Initialize once
   let initialized = false

   async function ensureInitialized() {
     if (!initialized) {
       initLogger({ projectName: process.env.BRAINTRUST_PROJECT_NAME! })
       await login({ apiKey: process.env.BRAINTRUST_API_KEY! })
       initialized = true
     }
   }

   interface DraftInput {
     thread_subject: string
     messages: Array<{
       from: string
       to: string
       cc?: string
       date: string
       body: string
     }>
     user_instructions: string
   }

   export const generateDraft = wrapTraced(async function generateDraft(
     input: DraftInput
   ) {
     await ensureInitialized()

     return await invoke({
       projectName: process.env.BRAINTRUST_PROJECT_NAME!,
       slug: process.env.BRAINTRUST_DRAFT_SLUG!,
       input: {
         thread_subject: input.thread_subject,
         messages: input.messages,
         user_instructions: input.user_instructions,
       },
     })
   })

   export const composeNewEmail = wrapTraced(async function composeNewEmail(
     input: {
       to: string
       cc?: string
       subject: string
       user_instructions: string
     }
   ) {
     await ensureInitialized()

     return await invoke({
       projectName: process.env.BRAINTRUST_PROJECT_NAME!,
       slug: process.env.BRAINTRUST_COMPOSE_SLUG!,
       input,
     })
   })
   ```

2. **Create draft generation API route**
   ```typescript
   // app/api/draft/route.ts
   import { NextResponse } from 'next/server'
   import { getThread, cleanMessages } from '@/lib/nylas'
   import { generateDraft } from '@/lib/braintrust'

   export async function POST(request: Request) {
     try {
       const { threadId, instructions } = await request.json()

       // Fetch thread and messages
       const thread = await getThread(threadId)
       const messages = await cleanMessages(thread.message_ids)

       // Sort oldest to newest
       messages.sort((a, b) => a.date - b.date)

       // Format for Braintrust
       const formattedMessages = messages.map(msg => ({
         from: msg.from.map(p => `${p.name} <${p.email}>`).join(', '),
         to: msg.to.map(p => `${p.name} <${p.email}>`).join(', '),
         cc: msg.cc?.map(p => `${p.name} <${p.email}>`).join(', '),
         date: new Date(msg.date * 1000).toLocaleString(),
         body: msg.conversation,
       }))

       // Call Braintrust
       const result = await generateDraft({
         thread_subject: thread.subject,
         messages: formattedMessages,
         user_instructions: instructions,
       })

       // Return draft
       return NextResponse.json({
         draft: result,
         recipients: {
           to: messages[messages.length - 1].from,  // Reply to sender
           cc: messages[messages.length - 1].cc || [],
         },
       })
     } catch (error) {
       console.error('Draft generation error:', error)
       return NextResponse.json(
         { error: 'Failed to generate draft' },
         { status: 500 }
       )
     }
   }
   ```

3. **Create draft save API route**
   ```typescript
   // app/api/drafts/create/route.ts
   import { NextResponse } from 'next/server'
   import { createDraft, updateThreadLabels } from '@/lib/nylas'

   export async function POST(request: Request) {
     try {
       const { threadId, subject, body, to, cc } = await request.json()

       // Create Gmail draft
       const draft = await createDraft({
         threadId,
         subject,
         body,
         to,
         cc,
       })

       // Update labels
       await updateThreadLabels(
         threadId,
         ['Label_215'],    // Add: drafted
         ['Label_139']     // Remove: to-respond-paul
       )

       return NextResponse.json({
         success: true,
         draftId: draft.id,
         subject,
       })
     } catch (error) {
       console.error('Draft creation error:', error)
       return NextResponse.json(
         { error: 'Failed to create draft' },
         { status: 500 }
       )
     }
   }
   ```

**Acceptance Criteria:**
- [ ] `/api/draft` generates draft via Braintrust
- [ ] Braintrust logs all LLM calls
- [ ] `/api/drafts/create` saves to Gmail
- [ ] Labels updated correctly

**Files to create:**
- `lib/braintrust.ts` - Braintrust wrapper
- `app/api/draft/route.ts` - Generate draft
- `app/api/drafts/create/route.ts` - Create Gmail draft

---

### Phase 4: Mobile-Responsive UI (Days 7-10)

**Goal:** Build simple, clean UI with shadcn components

**Mobile UX Pattern:**
- Single screen at a time (list → detail → draft)
- Back button to navigate
- Bottom action buttons (approve, skip)

**Tasks:**

1. **Create localStorage store**
   ```typescript
   // lib/store.ts
   interface SessionState {
     currentThreadId: string | null
     draftedCount: number
     skippedCount: number
     draftedThreads: Array<{ id: string; subject: string }>
   }

   const STORAGE_KEY = 'email-workflow-session'

   export function getSessionState(): SessionState {
     if (typeof window === 'undefined') {
       return {
         currentThreadId: null,
         draftedCount: 0,
         skippedCount: 0,
         draftedThreads: [],
       }
     }

     const stored = localStorage.getItem(STORAGE_KEY)
     if (!stored) {
       return {
         currentThreadId: null,
         draftedCount: 0,
         skippedCount: 0,
         draftedThreads: [],
       }
     }

     return JSON.parse(stored)
   }

   export function saveSessionState(state: Partial<SessionState>) {
     const current = getSessionState()
     const updated = { ...current, ...state }
     localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
   }

   export function clearSessionState() {
     localStorage.removeItem(STORAGE_KEY)
   }
   ```

2. **Thread list page**
   ```typescript
   // app/inbox/page.tsx
   'use client'
   import { useEffect, useState } from 'react'
   import { Card } from '@/components/ui/card'
   import { Button } from '@/components/ui/button'
   import { getSessionState, saveSessionState } from '@/lib/store'

   interface Thread {
     id: string
     subject: string
     latest_draft_or_message: {
       from: Array<{ name: string; email: string }>
       date: number
     }
   }

   export default function InboxPage() {
     const [threads, setThreads] = useState<Thread[]>([])
     const [loading, setLoading] = useState(true)
     const [session, setSession] = useState(getSessionState())

     useEffect(() => {
       fetchThreads()
     }, [])

     async function fetchThreads() {
       const res = await fetch('/api/threads')
       const data = await res.json()
       setThreads(data.threads)
       setLoading(false)
     }

     function selectThread(threadId: string) {
       saveSessionState({ currentThreadId: threadId })
       window.location.href = `/inbox/${threadId}`
     }

     if (loading) {
       return <div className="p-4">Loading threads...</div>
     }

     return (
       <div className="min-h-screen bg-gray-50">
         {/* Header */}
         <div className="bg-white border-b p-4">
           <h1 className="text-xl font-bold">Inbox</h1>
           <p className="text-sm text-gray-600 mt-1">
             {threads.length} threads to respond
           </p>
           {session.draftedCount > 0 && (
             <p className="text-sm text-green-600 mt-1">
               ✓ {session.draftedCount} drafted, → {session.skippedCount} skipped
             </p>
           )}
         </div>

         {/* Thread list */}
         <div className="p-4 space-y-2">
           {threads.map(thread => (
             <Card
               key={thread.id}
               className="p-4 cursor-pointer hover:bg-gray-50"
               onClick={() => selectThread(thread.id)}
             >
               <h3 className="font-medium">{thread.subject}</h3>
               <p className="text-sm text-gray-600 mt-1">
                 {thread.latest_draft_or_message.from[0].name}
               </p>
               <p className="text-xs text-gray-500 mt-1">
                 {new Date(thread.latest_draft_or_message.date * 1000).toLocaleDateString()}
               </p>
             </Card>
           ))}
         </div>
       </div>
     )
   }
   ```

3. **Thread detail + draft page**
   ```typescript
   // app/inbox/[id]/page.tsx
   'use client'
   import { useEffect, useState } from 'react'
   import { useParams, useRouter } from 'next/navigation'
   import { Card } from '@/components/ui/card'
   import { Button } from '@/components/ui/button'
   import { Textarea } from '@/components/ui/textarea'
   import { getSessionState, saveSessionState } from '@/lib/store'

   interface Message {
     from: Array<{ name: string; email: string }>
     to: Array<{ name: string; email: string }>
     date: number
     conversation: string
   }

   export default function ThreadDetailPage() {
     const params = useParams()
     const router = useRouter()
     const threadId = params.id as string

     const [thread, setThread] = useState<any>(null)
     const [messages, setMessages] = useState<Message[]>([])
     const [instructions, setInstructions] = useState('')
     const [draft, setDraft] = useState('')
     const [recipients, setRecipients] = useState<any>(null)
     const [loading, setLoading] = useState(true)
     const [generating, setGenerating] = useState(false)

     useEffect(() => {
       fetchThread()
     }, [threadId])

     async function fetchThread() {
       const res = await fetch(`/api/thread/${threadId}`)
       const data = await res.json()
       setThread(data.thread)
       setMessages(data.messages)
       setLoading(false)
     }

     async function generateDraft() {
       if (!instructions.trim()) return

       setGenerating(true)
       try {
         const res = await fetch('/api/draft', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             threadId,
             instructions: instructions.trim(),
           }),
         })

         const data = await res.json()
         setDraft(data.draft)
         setRecipients(data.recipients)
       } catch (error) {
         alert('Failed to generate draft')
       } finally {
         setGenerating(false)
       }
     }

     async function approveDraft() {
       try {
         await fetch('/api/drafts/create', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             threadId,
             subject: `Re: ${thread.subject}`,
             body: draft,
             to: recipients.to,
             cc: recipients.cc,
           }),
         })

         // Update session
         const session = getSessionState()
         saveSessionState({
           draftedCount: session.draftedCount + 1,
           draftedThreads: [
             ...session.draftedThreads,
             { id: threadId, subject: thread.subject },
           ],
         })

         // Go back to inbox
         router.push('/inbox')
       } catch (error) {
         alert('Failed to create draft')
       }
     }

     function skip() {
       const session = getSessionState()
       saveSessionState({
         skippedCount: session.skippedCount + 1,
       })
       router.push('/inbox')
     }

     if (loading) {
       return <div className="p-4">Loading thread...</div>
     }

     return (
       <div className="min-h-screen bg-gray-50">
         {/* Header */}
         <div className="bg-white border-b p-4">
           <Button
             variant="ghost"
             onClick={() => router.push('/inbox')}
             className="mb-2"
           >
             ← Back
           </Button>
           <h1 className="text-lg font-bold">{thread.subject}</h1>
         </div>

         {/* Messages */}
         <div className="p-4 space-y-4">
           {messages.map((msg, i) => (
             <Card key={i} className="p-4">
               <div className="flex justify-between items-start mb-2">
                 <div>
                   <p className="font-medium">{msg.from[0].name}</p>
                   <p className="text-xs text-gray-500">
                     {new Date(msg.date * 1000).toLocaleString()}
                   </p>
                 </div>
                 {i === messages.length - 1 && (
                   <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                     Latest
                   </span>
                 )}
               </div>
               <div className="text-sm whitespace-pre-wrap">
                 {msg.conversation}
               </div>
             </Card>
           ))}
         </div>

         {/* Draft section */}
         <div className="bg-white border-t p-4 space-y-4">
           <h2 className="font-bold">Your Reply</h2>

           {!draft ? (
             <>
               <Textarea
                 placeholder="Tell me what to say..."
                 value={instructions}
                 onChange={(e) => setInstructions(e.target.value)}
                 rows={3}
               />
               <Button
                 onClick={generateDraft}
                 disabled={generating || !instructions.trim()}
                 className="w-full"
               >
                 {generating ? 'Generating...' : 'Generate Draft'}
               </Button>
             </>
           ) : (
             <>
               <Card className="p-4">
                 <p className="text-sm text-gray-600 mb-2">
                   To: {recipients.to.map((p: any) => p.email).join(', ')}
                 </p>
                 <div className="text-sm whitespace-pre-wrap">{draft}</div>
               </Card>

               <div className="flex gap-2">
                 <Button onClick={approveDraft} className="flex-1">
                   Approve
                 </Button>
                 <Button onClick={skip} variant="outline" className="flex-1">
                   Skip
                 </Button>
                 <Button
                   onClick={() => setDraft('')}
                   variant="ghost"
                 >
                   Revise
                 </Button>
               </div>
             </>
           )}
         </div>
       </div>
     )
   }
   ```

4. **Root layout**
   ```typescript
   // app/layout.tsx
   import type { Metadata } from 'next'
   import { Inter } from 'next/font/google'
   import './globals.css'

   const inter = Inter({ subsets: ['latin'] })

   export const metadata: Metadata = {
     title: 'Email Workflow',
     description: 'Simple email workflow with AI drafts',
     viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
   }

   export default function RootLayout({
     children,
   }: {
     children: React.ReactNode
   }) {
     return (
       <html lang="en">
         <body className={inter.className}>{children}</body>
       </html>
     )
   }
   ```

**Acceptance Criteria:**
- [ ] Thread list shows all threads
- [ ] Clicking thread shows messages
- [ ] Generate draft works
- [ ] Approve saves to Gmail and updates labels
- [ ] Skip increments counter
- [ ] Session state persists on refresh
- [ ] Mobile-responsive (single column)

**Files to create:**
- `lib/store.ts` - localStorage wrapper
- `app/inbox/page.tsx` - Thread list
- `app/inbox/[id]/page.tsx` - Thread detail + draft

---

### Phase 5: Compose New Email (Future Bead)

**Goal:** Add compose mode for new emails

**Tasks:**
1. Create `/app/compose/page.tsx`
2. Add compose API route using `composeNewEmail` from Braintrust
3. Add "Compose" button in inbox header
4. Similar UI to reply mode but with to/cc/subject fields

**Estimated effort:** 1 day (straightforward after Phase 4)

---

### Phase 6: Multi-Draft Tabs (Future Bead)

**Goal:** Work on multiple emails concurrently

**Tasks:**
1. Add tabs to inbox page
2. Store multiple drafts in localStorage
3. Allow switching between drafts
4. Close tab removes from localStorage

**Estimated effort:** 2-3 days

---

## Deployment to Vercel

### Setup

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial email workflow app"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repo
   - Add environment variables:
     - `NYLAS_API_KEY`
     - `NYLAS_GRANT_ID`
     - `BRAINTRUST_API_KEY`
     - `BRAINTRUST_PROJECT_NAME`
     - `BRAINTRUST_DRAFT_SLUG`
     - `BRAINTRUST_COMPOSE_SLUG`
   - Deploy

3. **Get obscure URL**
   - Vercel gives you: `your-project-abc123.vercel.app`
   - Add to your bookmarks (mobile + desktop)

### Security Notes

- **No auth** - rely on obscure URL
- **Don't index** - Add to `robots.txt`:
  ```
  User-agent: *
  Disallow: /
  ```
- **Environment variables** - Never commit `.env.local`

---

## Development Workflow

### Local Development
```bash
npm run dev  # localhost:3000
```

### Testing Braintrust Locally
```bash
# Test draft generation
curl -X POST http://localhost:3000/api/draft \
  -H "Content-Type: application/json" \
  -d '{"threadId":"thread_123","instructions":"Tell them yes"}'
```

### Deploying Updates
```bash
git add .
git commit -m "Description of changes"
git push  # Auto-deploys to Vercel
```

---

## Success Metrics

### Performance
- **Page load:** <2s on mobile
- **Draft generation:** <5s (Braintrust invoke)
- **Thread list fetch:** <1s

### UX
- **Mobile-first:** Works great on phone
- **Simple:** No complex features, just core workflow
- **Fast:** No TMUX overhead, direct API calls

---

## Future Beads

Create these as separate beads after MVP is working:

1. **Compose New Email** (Phase 5)
   - File: `app/compose/page.tsx`
   - Estimated: 1 day

2. **Multi-Draft Tabs** (Phase 6)
   - Concurrent email handling
   - Estimated: 2-3 days

3. **Forward Email**
   - Add forward mode
   - Estimated: 1 day

4. **Draft Templates**
   - Save common responses
   - Estimated: 1-2 days

5. **Keyboard Shortcuts** (Desktop only)
   - Alt+A, Alt+S, etc.
   - Estimated: 0.5 day

6. **Session Summary**
   - Show drafted count, links to Gmail
   - Estimated: 0.5 day

---

## Appendix: Braintrust Prompt Templates

### Draft Generation Prompt (email-draft-generation)

```
You are an email assistant helping Paul respond to emails.

**Thread Subject:** {{thread_subject}}

**Conversation History:**
{{#messages}}
---
From: {{from}}
To: {{to}}
{{#cc}}Cc: {{cc}}{{/cc}}
Date: {{date}}

{{body}}
{{/messages}}

**Paul's Instructions:** {{user_instructions}}

Generate a professional, concise email reply following Paul's instructions. Return ONLY the email body (no subject line, no headers).
```

### Compose Email Prompt (email-compose-generation)

```
You are an email assistant helping Paul compose a new email.

**To:** {{to}}
{{#cc}}**Cc:** {{cc}}{{/cc}}
**Subject:** {{subject}}

**Paul's Instructions:** {{user_instructions}}

Generate a professional, concise email following Paul's instructions. Return ONLY the email body.
```

---

## Tech Stack Summary

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js 15 (App Router) | React 19, Server Components, fast |
| Styling | Tailwind + shadcn/ui | Clean, mobile-responsive components |
| State | localStorage | Simple, survives refresh |
| Backend | Next.js API Routes | No separate server needed |
| LLM | Braintrust invoke | Logging, versioning, monitoring |
| Email API | Nylas v3 | Unified email API |
| Deployment | Vercel | Zero-config, auto-deploy on push |
| Language | TypeScript | Type-safe, single language |

---

## Estimated Timeline

| Phase | Days | Status |
|-------|------|--------|
| Phase 1: Setup | 2 | Pending |
| Phase 2: Nylas | 2 | Pending |
| Phase 3: Braintrust | 2 | Pending |
| Phase 4: UI | 4 | Pending |
| **Total MVP** | **10 days** | **~2 weeks** |
| Phase 5: Compose | 1 | Future bead |
| Phase 6: Multi-draft | 3 | Future bead |

---

## Next Steps

1. **Review this plan** - Confirm this matches your vision
2. **Create Braintrust prompts** - Set up email-draft-generation and email-compose-generation
3. **Start Phase 1** - Create Next.js app, install dependencies
4. **Build incrementally** - Test each phase before moving to next

Ready to start implementation?
