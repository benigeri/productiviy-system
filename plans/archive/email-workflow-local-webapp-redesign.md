# Email Workflow: Local Web App Redesign

**Created:** 2026-01-10
**Status:** Planning
**Epic:** Productivity System Modernization

---

## Executive Summary

Replace the current TMUX-based email workflow with a modern local web application that provides:
- **Better UX:** Rich UI with formatting, concurrent operations, visual state
- **Faster:** Eliminate Claude Code orchestration overhead, direct API calls
- **More capable:** Work on multiple emails at once, compose new emails
- **Lightweight:** Run locally without deployment complexity
- **Shared services:** Build reusable components for calendar, linear, email

**Recommended Stack:** FastAPI (Python backend) + Next.js 15 (frontend)

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Pain Points](#pain-points)
3. [Architectural Options](#architectural-options)
4. [Recommended Architecture](#recommended-architecture)
5. [Implementation Phases](#implementation-phases)
6. [Technical Specifications](#technical-specifications)
7. [Migration Strategy](#migration-strategy)
8. [Success Metrics](#success-metrics)

---

## Current Architecture

### System Overview

**Components:**
- **TMUX Panel Manager** (205 lines) - Creates/manages split panes
- **Email Canvas** (416 lines) - Terminal UI with box-drawing
- **Draft Generator** (329 lines) - Calls Anthropic API for drafts
- **Gmail Draft Creator** (290 lines) - Creates drafts via Nylas API
- **Email Utils** (396 lines) - Shared library for Nylas operations
- **Hotkey Manager** (84 lines) - Alt+A/S/D/V shortcuts

**Total codebase:** ~2,885 lines of Python across all email tools

### Workflow

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│ Claude Code │ ─────▶│ TMUX Panel   │◀──── │ Python CLI   │
│ (Agent)     │       │ (Display)    │      │ (API Client) │
└─────────────┘      └──────────────┘      └──────────────┘
       │                                            │
       │                                            │
       ▼                                            ▼
  Orchestration                              Nylas + Anthropic
  (bash scripts)                                  APIs
```

**Steps for each email:**
1. Claude Code sends bash command to TMUX panel
2. TMUX panel runs Python script (email-canvas.py) to display thread
3. User provides dictation via Claude Code
4. Claude Code calls draft-email.py (calls Anthropic API)
5. Claude Code sends command to update TMUX panel with draft
6. User approves → Claude Code calls create-gmail-draft.py
7. Repeat for next email

**Time per email:** 15-30 seconds (with multiple Claude Code passes)

---

## Pain Points

### 1. TMUX Complexity

**Issues:**
- Brittle pane management (must track pane IDs in temp files)
- Safety checks needed to avoid killing Agent Deck pane
- Shell quoting issues with HTML content
- Panel state lost if TMUX session crashes

**Recent bugs:**
- Pane accidentally killed (fixed with safety checks)
- Line breaks missing in drafts (HTML not converted to text)
- Labels not removed after drafting (thread vs message API)

### 2. Slow Sequential Workflow

**Issues:**
- Each action waits for Claude Code orchestration pass (2-5 seconds overhead)
- Can't pre-fetch next thread while reviewing current draft
- Can't work on multiple emails concurrently
- LLM responses not streamed (wait for full response)

**Current:** 15-30 seconds per email
**Ideal:** 5-10 seconds per email with streaming

### 3. Limited UI

**Issues:**
- Text-only (no hyperlinks, bold, italic)
- No rich formatting in draft preview
- Can't see thread context while composing
- No visual progress indicator (drafted/skipped count)
- Clipboard paste works but multi-line editing is clunky

### 4. No Concurrent Operations

**Issues:**
- Must process emails sequentially
- Can't start draft for next email while reviewing current
- Single-threaded workflow (no parallelism)

### 5. Can't Compose New Emails

**Issue:** Workflow only handles replies, no way to compose fresh emails

---

## Architectural Options

### Option 1: FastAPI + Next.js (Hybrid) ⭐ **RECOMMENDED**

**Stack:**
- **Backend:** FastAPI (Python) wraps existing code
- **Frontend:** Next.js 15 (App Router)
- **Real-time:** Server-Sent Events for LLM streaming
- **State:** In-memory (FastAPI) + Zustand (React)
- **Deployment:** Local (`npm run dev` + `uvicorn`)

**Pros:**
- ✅ Reuse existing Python code (~2,885 lines)
- ✅ Modern web UI with rich formatting
- ✅ Type-safe with OpenAPI schema generation
- ✅ Fast development (Next.js hot reload)
- ✅ Concurrent operations (FastAPI async + React)
- ✅ No database needed (stateless)
- ✅ Easy to add calendar/linear UIs later

**Cons:**
- ❌ Two codebases (Python + TypeScript)
- ❌ CORS configuration for local development
- ❌ Slightly more complex setup than pure Next.js

**Architecture:**
```
┌───────────────────┐
│   Next.js 15      │  localhost:3000
│   (Frontend)      │
└─────────┬─────────┘
          │ HTTP/SSE
          ▼
┌───────────────────┐
│   FastAPI         │  localhost:8000
│   (Backend)       │
│   - draft-email   │
│   - create-draft  │
│   - list-threads  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│   External APIs   │
│   - Nylas         │
│   - Anthropic     │
└───────────────────┘
```

**Development workflow:**
```bash
# Terminal 1: Python backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2: Next.js frontend
cd frontend
npm run dev  # localhost:3000
```

---

### Option 2: Next.js Only (Full JavaScript)

**Stack:**
- **Backend:** Next.js API Routes
- **Frontend:** Next.js 15 (App Router)
- **Real-time:** Server-Sent Events
- **State:** Zustand (React)
- **Deployment:** Local (`npm run dev`)

**Pros:**
- ✅ Single codebase (TypeScript everywhere)
- ✅ Simplest setup (one `npm run dev`)
- ✅ No CORS issues
- ✅ Unified deployment (Vercel if needed)

**Cons:**
- ❌ Must rewrite Python code to TypeScript (~2,885 lines)
- ❌ Lose Python ecosystem (some ML libraries)
- ❌ Requires porting email_utils, draft logic, etc.

**Not recommended:** Too much rewriting for marginal simplicity gain.

---

### Option 3: Electron Desktop App

**Stack:**
- **Backend:** Node.js (Electron main process)
- **Frontend:** React (Electron renderer)
- **State:** Zustand + IPC
- **Deployment:** Packaged .app file

**Pros:**
- ✅ True desktop app (system tray, notifications)
- ✅ Offline-first
- ✅ No browser needed

**Cons:**
- ❌ High resource usage (150+ MB)
- ❌ Complex build process
- ❌ Must rewrite Python code
- ❌ Overkill for local web app

**Not recommended:** Overhead not justified for single-user productivity tool.

---

### Option 4: Keep TMUX, Improve UX

**Approach:**
- Add progress indicators to panel header
- Pre-fetch next thread (parallel)
- Show recipients before generating draft
- Improve HTML → text conversion

**Pros:**
- ✅ Minimal changes to existing code
- ✅ Fast to implement (already planned in IMPROVEMENT-PLAN.md)

**Cons:**
- ❌ Still text-only UI
- ❌ Still sequential (no concurrent operations)
- ❌ TMUX complexity remains
- ❌ No rich formatting

**Not recommended:** Band-aid solution, doesn't address core issues.

---

## Recommended Architecture

### FastAPI + Next.js Hybrid

**Why this is the winner:**
1. **Leverage existing Python code** - Don't throw away 2,885 lines
2. **Modern web UI** - Rich formatting, concurrent operations
3. **Type-safe** - OpenAPI schema → auto-generated TypeScript client
4. **Fast development** - Next.js hot reload, FastAPI auto-reload
5. **No deployment needed** - Run locally with two commands
6. **Extensible** - Easy to add calendar/linear UIs later
7. **No database** - Stateless, idempotent operations

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 15 (localhost:3000)             │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐   │
│  │ Thread List   │  │ Thread View   │  │ Draft Editor │   │
│  │ (Inbox)       │  │ (Detail)      │  │ (Compose)    │   │
│  └───────────────┘  └───────────────┘  └──────────────┘   │
│         │                   │                   │           │
│         └───────────────────┴───────────────────┘           │
│                             │                               │
│                    State (Zustand)                          │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP + SSE
┌─────────────────────────────┼───────────────────────────────┐
│                    FastAPI (localhost:8000)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ API Endpoints:                                       │  │
│  │  GET  /api/threads         - List email threads     │  │
│  │  GET  /api/threads/{id}    - Get thread detail      │  │
│  │  POST /api/drafts          - Generate draft (SSE)   │  │
│  │  POST /api/drafts/create   - Create Gmail draft     │  │
│  │  POST /api/compose         - Compose new email      │  │
│  └──────────────────────────────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Existing Python Modules:                            │  │
│  │  - email_utils.py (Nylas client)                    │  │
│  │  - draft-email.py logic (LLM draft generation)      │  │
│  │  - create-gmail-draft.py logic                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                        External APIs                        │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Nylas API        │  │ Anthropic API    │               │
│  │ - List threads   │  │ - Draft gen      │               │
│  │ - Get messages   │  │ - Claude Sonnet  │               │
│  │ - Create drafts  │  │   4.5 streaming  │               │
│  │ - Update labels  │  │                  │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### Technology Choices

#### Backend: FastAPI

**Why FastAPI:**
- Modern async Python framework (perfect for concurrent operations)
- Automatic OpenAPI schema generation (type-safe frontend)
- Built-in SSE support (stream LLM responses)
- Fast (comparable to Node.js with async)
- Excellent developer experience

**Key features:**
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio

app = FastAPI()

@app.get("/api/threads")
async def get_threads():
    """List email threads (to-respond-paul label)"""
    threads = email_utils.nylas_get("/threads?in=Label_139&limit=20")
    return {"threads": threads}

@app.post("/api/drafts")
async def generate_draft(email_id: str, instructions: str):
    """Generate draft with streaming (SSE)"""
    async def stream():
        # Stream tokens as they arrive from Anthropic
        async for token in draft_email_stream(email_id, instructions):
            yield f"data: {token}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

#### Frontend: Next.js 15

**Why Next.js:**
- React 19 with concurrent features
- App Router with native streaming support
- Excellent developer experience (hot reload, error overlay)
- Built-in API proxy (avoid CORS in development)
- Easy to add more pages (calendar, linear) later

**Key features:**
```typescript
// app/inbox/page.tsx
'use client'
import { useEffect, useState } from 'react'

export default function InboxPage() {
  const [threads, setThreads] = useState([])

  useEffect(() => {
    fetch('/api/py/threads')
      .then(r => r.json())
      .then(data => setThreads(data.threads))
  }, [])

  return (
    <div className="grid grid-cols-3 gap-4">
      <ThreadList threads={threads} />
      <ThreadView />
      <DraftEditor />
    </div>
  )
}
```

#### State Management: Zustand

**Why Zustand:**
- Minimal boilerplate (no Redux ceremony)
- Hook-based (fits React 19 patterns)
- DevTools support
- Persist middleware (optional localStorage)

**Example store:**
```typescript
// stores/email.ts
import { create } from 'zustand'

interface EmailStore {
  threads: Thread[]
  currentThread: Thread | null
  draft: string
  setCurrentThread: (thread: Thread) => void
  updateDraft: (text: string) => void
}

export const useEmailStore = create<EmailStore>((set) => ({
  threads: [],
  currentThread: null,
  draft: '',
  setCurrentThread: (thread) => set({ currentThread: thread }),
  updateDraft: (text) => set({ draft: text }),
}))
```

#### Real-time: Server-Sent Events (SSE)

**Why SSE over WebSocket:**
- Simpler protocol (HTTP-based)
- Perfect for one-way streaming (LLM tokens → UI)
- Automatic reconnection
- Works with FastAPI and Next.js natively

**FastAPI streaming:**
```python
@app.post("/api/drafts")
async def generate_draft_stream(thread_id: str, instructions: str):
    async def stream():
        # Call Anthropic with streaming
        async with anthropic.AsyncAnthropic() as client:
            async with client.messages.stream(
                model="claude-sonnet-4-5",
                messages=[...],
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {text}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

**React hook:**
```typescript
function useDraftStream(threadId: string, instructions: string) {
  const [draft, setDraft] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  useEffect(() => {
    setIsStreaming(true)
    const es = new EventSource(`/api/drafts?thread_id=${threadId}&instructions=${instructions}`)

    es.onmessage = (e) => setDraft(prev => prev + e.data)
    es.onerror = () => { es.close(); setIsStreaming(false) }

    return () => es.close()
  }, [threadId, instructions])

  return { draft, isStreaming }
}
```

---

## Implementation Phases

### Phase 0: Setup & Architecture (Week 1)

**Goal:** Set up monorepo with FastAPI + Next.js

**Tasks:**

1. **Create monorepo structure**
   ```
   productivity-system/
   ├── backend/              # FastAPI
   │   ├── main.py
   │   ├── routers/
   │   │   ├── threads.py
   │   │   ├── drafts.py
   │   │   └── compose.py
   │   ├── services/
   │   │   ├── email_service.py   # Wraps email_utils
   │   │   ├── draft_service.py   # Wraps draft-email logic
   │   │   └── nylas_service.py
   │   ├── requirements.txt
   │   └── pyproject.toml
   ├── frontend/             # Next.js
   │   ├── app/
   │   │   ├── inbox/
   │   │   ├── compose/
   │   │   └── layout.tsx
   │   ├── components/
   │   │   ├── thread-list.tsx
   │   │   ├── thread-view.tsx
   │   │   └── draft-editor.tsx
   │   ├── stores/
   │   │   └── email.ts       # Zustand store
   │   ├── package.json
   │   └── next.config.js
   ├── shared/               # Shared types (optional)
   │   └── types.ts
   └── README.md
   ```

2. **Port email_utils.py to FastAPI service**
   - Create `backend/services/nylas_service.py`
   - Wrap existing functions as async methods
   - Add type hints (Pydantic models)

3. **Setup Next.js with API proxy**
   ```javascript
   // next.config.js
   module.exports = {
     async rewrites() {
       return [
         {
           source: '/api/py/:path*',
           destination: 'http://localhost:8000/:path*',
         },
       ]
     },
   }
   ```

4. **Generate OpenAPI client**
   ```bash
   # After FastAPI is running
   npx @hey-api/openapi-ts \
     -i http://localhost:8000/openapi.json \
     -o frontend/src/client
   ```

**Acceptance Criteria:**
- [ ] Monorepo structure created
- [ ] FastAPI serves `/docs` OpenAPI UI
- [ ] Next.js proxies `/api/py/*` to FastAPI
- [ ] TypeScript client auto-generated from OpenAPI
- [ ] Both servers run with hot reload

**Files to create:**
- `backend/main.py` - FastAPI app entry point
- `backend/services/nylas_service.py` - Nylas API wrapper
- `frontend/next.config.js` - Proxy configuration
- `frontend/app/inbox/page.tsx` - Inbox page (placeholder)

---

### Phase 1: Thread List (Week 2)

**Goal:** Display email threads in web UI

**Tasks:**

1. **FastAPI: Thread list endpoint**
   ```python
   # backend/routers/threads.py
   from fastapi import APIRouter
   from ..services import nylas_service

   router = APIRouter()

   @router.get("/api/threads")
   async def list_threads():
       threads = await nylas_service.get_threads(label="Label_139", limit=20)
       return {"threads": threads}

   @router.get("/api/threads/{thread_id}")
   async def get_thread(thread_id: str):
       thread = await nylas_service.get_thread(thread_id)
       messages = await nylas_service.clean_messages(thread["message_ids"])
       return {"thread": thread, "messages": messages}
   ```

2. **Next.js: Thread list component**
   ```typescript
   // components/thread-list.tsx
   'use client'
   import { useEffect } from 'react'
   import { useEmailStore } from '@/stores/email'

   export function ThreadList() {
     const { threads, fetchThreads, setCurrentThread } = useEmailStore()

     useEffect(() => {
       fetchThreads()
     }, [])

     return (
       <div className="h-screen overflow-y-auto border-r">
         <h2 className="p-4 font-bold">Inbox ({threads.length})</h2>
         {threads.map(thread => (
           <div
             key={thread.id}
             onClick={() => setCurrentThread(thread)}
             className="p-4 cursor-pointer hover:bg-gray-100"
           >
             <div className="font-medium">{thread.subject}</div>
             <div className="text-sm text-gray-600">
               {thread.latest_draft_or_message.from[0].name}
             </div>
           </div>
         ))}
       </div>
     )
   }
   ```

3. **Zustand store**
   ```typescript
   // stores/email.ts
   import { create } from 'zustand'

   interface EmailStore {
     threads: Thread[]
     currentThread: Thread | null
     fetchThreads: () => Promise<void>
     setCurrentThread: (thread: Thread) => void
   }

   export const useEmailStore = create<EmailStore>((set) => ({
     threads: [],
     currentThread: null,

     fetchThreads: async () => {
       const res = await fetch('/api/py/threads')
       const data = await res.json()
       set({ threads: data.threads })
     },

     setCurrentThread: (thread) => set({ currentThread: thread }),
   }))
   ```

**Acceptance Criteria:**
- [ ] Thread list displays in sidebar
- [ ] Shows thread count (e.g., "12 threads")
- [ ] Clicking thread selects it
- [ ] Auto-fetches on page load
- [ ] Hover states work

**Files to create:**
- `backend/routers/threads.py` - Thread API routes
- `backend/services/nylas_service.py` - Nylas client wrapper
- `frontend/components/thread-list.tsx` - Thread list UI
- `frontend/stores/email.ts` - Zustand store

---

### Phase 2: Thread Detail View (Week 3)

**Goal:** Show full thread conversation with all messages

**Tasks:**

1. **Thread view component**
   ```typescript
   // components/thread-view.tsx
   'use client'
   import { useEmailStore } from '@/stores/email'
   import ReactMarkdown from 'react-markdown'

   export function ThreadView() {
     const { currentThread, messages } = useEmailStore()

     if (!currentThread) {
       return <div className="p-8">Select a thread</div>
     }

     return (
       <div className="h-screen overflow-y-auto p-8">
         <h1 className="text-2xl font-bold mb-4">
           {currentThread.subject}
         </h1>

         {messages.map((msg, i) => (
           <div key={msg.id} className="mb-8 border-l-4 pl-4">
             <div className="flex items-center justify-between mb-2">
               <div className="font-medium">{msg.from[0].name}</div>
               <div className="text-sm text-gray-500">
                 {formatDate(msg.date)}
               </div>
             </div>

             <div className="prose">
               <ReactMarkdown>{msg.conversation}</ReactMarkdown>
             </div>

             {i < messages.length - 1 && (
               <div className="border-t mt-6" />
             )}
           </div>
         ))}
       </div>
     )
   }
   ```

2. **Fetch messages when thread selected**
   ```typescript
   // stores/email.ts
   setCurrentThread: async (thread) => {
     set({ currentThread: thread, messages: [], isLoading: true })

     const res = await fetch(`/api/py/threads/${thread.id}`)
     const data = await res.json()

     set({ messages: data.messages, isLoading: false })
   }
   ```

**Acceptance Criteria:**
- [ ] Full thread conversation displays
- [ ] Messages sorted oldest → newest
- [ ] Markdown formatting works (bold, links, lists)
- [ ] Shows sender, date for each message
- [ ] Loading state while fetching

**Files to create:**
- `frontend/components/thread-view.tsx` - Thread detail UI

---

### Phase 3: Draft Generation with Streaming (Week 4)

**Goal:** Generate drafts with real-time token streaming

**Tasks:**

1. **FastAPI: Streaming draft endpoint**
   ```python
   # backend/routers/drafts.py
   from fastapi import APIRouter
   from fastapi.responses import StreamingResponse
   from ..services import draft_service

   router = APIRouter()

   @router.post("/api/drafts")
   async def generate_draft(thread_id: str, instructions: str):
       async def stream():
           async for token in draft_service.generate_stream(thread_id, instructions):
               yield f"data: {token}\n\n"

       return StreamingResponse(stream(), media_type="text/event-stream")
   ```

2. **Port draft-email.py logic to service**
   ```python
   # backend/services/draft_service.py
   import anthropic
   from . import nylas_service

   async def generate_stream(thread_id: str, instructions: str):
       # Fetch thread and messages
       thread = await nylas_service.get_thread(thread_id)
       messages = await nylas_service.clean_messages(thread["message_ids"])

       # Build prompt (same logic as draft-email.py)
       prompt = build_prompt(thread, messages, instructions)

       # Stream from Anthropic
       async with anthropic.AsyncAnthropic() as client:
           async with client.messages.stream(
               model="claude-sonnet-4-5-20250929",
               messages=[{"role": "user", "content": prompt}],
               max_tokens=2000,
           ) as stream:
               async for text in stream.text_stream:
                   yield text
   ```

3. **React: Draft editor with streaming**
   ```typescript
   // components/draft-editor.tsx
   'use client'
   import { useState, useEffect } from 'react'
   import { useEmailStore } from '@/stores/email'

   export function DraftEditor() {
     const { currentThread } = useEmailStore()
     const [instructions, setInstructions] = useState('')
     const [draft, setDraft] = useState('')
     const [isStreaming, setIsStreaming] = useState(false)

     const generateDraft = () => {
       setIsStreaming(true)
       setDraft('')

       const es = new EventSource(
         `/api/py/drafts?thread_id=${currentThread.id}&instructions=${instructions}`
       )

       es.onmessage = (e) => {
         setDraft(prev => prev + e.data)
       }

       es.onerror = () => {
         es.close()
         setIsStreaming(false)
       }
     }

     return (
       <div className="h-screen flex flex-col p-8">
         <h2 className="text-xl font-bold mb-4">Your Reply</h2>

         <textarea
           value={instructions}
           onChange={(e) => setInstructions(e.target.value)}
           placeholder="Tell me what to say..."
           className="border p-2 mb-4"
           rows={3}
         />

         <button
           onClick={generateDraft}
           disabled={isStreaming}
           className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
         >
           {isStreaming ? 'Generating...' : 'Generate Draft'}
         </button>

         <div className="prose border p-4 flex-1 overflow-y-auto">
           {draft || 'Draft will appear here...'}
         </div>

         <div className="flex gap-2 mt-4">
           <button className="bg-green-500 text-white px-4 py-2 rounded">
             Approve
           </button>
           <button className="border px-4 py-2 rounded">
             Skip
           </button>
         </div>
       </div>
     )
   }
   ```

**Acceptance Criteria:**
- [ ] Draft streams token-by-token (visible to user)
- [ ] Uses same prompt as current draft-email.py
- [ ] Handles errors gracefully
- [ ] Can generate multiple drafts (iteration)
- [ ] Streaming is smooth (no UI jank)

**Files to create:**
- `backend/routers/drafts.py` - Draft generation routes
- `backend/services/draft_service.py` - Draft logic wrapper
- `frontend/components/draft-editor.tsx` - Draft editor UI

---

### Phase 4: Create Gmail Draft (Week 5)

**Goal:** Save approved draft to Gmail

**Tasks:**

1. **FastAPI: Create draft endpoint**
   ```python
   # backend/routers/drafts.py
   @router.post("/api/drafts/create")
   async def create_gmail_draft(
       thread_id: str,
       draft_body: str,
       to: list[dict],
       cc: list[dict],
       subject: str
   ):
       # Use existing create-gmail-draft.py logic
       draft = await nylas_service.create_draft(
           thread_id=thread_id,
           body=draft_body,
           to=to,
           cc=cc,
           subject=subject
       )

       # Update labels
       await nylas_service.update_thread_labels(
           thread_id,
           add=["Label_215"],  # drafted
           remove=["Label_139"]  # to-respond-paul
       )

       return {"draft_id": draft["id"], "subject": subject}
   ```

2. **React: Approve button handler**
   ```typescript
   const approveDraft = async () => {
     const res = await fetch('/api/py/drafts/create', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         thread_id: currentThread.id,
         draft_body: draft,
         to: recipients.to,
         cc: recipients.cc,
         subject: currentThread.subject,
       })
     })

     const data = await res.json()

     // Show success message
     toast.success('Draft saved to Gmail')

     // Move to next thread
     nextThread()
   }
   ```

**Acceptance Criteria:**
- [ ] Approve button saves draft to Gmail
- [ ] Labels updated (to-respond → drafted)
- [ ] Success notification shown
- [ ] Advances to next thread
- [ ] Error handling for API failures

**Files to modify:**
- `backend/routers/drafts.py` - Add create endpoint
- `frontend/components/draft-editor.tsx` - Add approve handler

---

### Phase 5: Keyboard Shortcuts (Week 6)

**Goal:** Replicate TMUX hotkeys (Alt+A/S/D/V) in web UI

**Tasks:**

1. **Keyboard shortcut hook**
   ```typescript
   // hooks/use-keyboard-shortcuts.ts
   import { useEffect } from 'react'

   export function useKeyboardShortcuts() {
     useEffect(() => {
       const handleKey = (e: KeyboardEvent) => {
         // Alt+A: Approve
         if (e.altKey && e.key === 'a') {
           e.preventDefault()
           approveDraft()
         }

         // Alt+S: Skip
         if (e.altKey && e.key === 's') {
           e.preventDefault()
           skipThread()
         }

         // Alt+D: Done
         if (e.altKey && e.key === 'd') {
           e.preventDefault()
           closeWorkflow()
         }

         // Cmd+K: Command palette
         if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
           e.preventDefault()
           openCommandPalette()
         }

         // J/K: Navigate threads
         if (e.key === 'j') moveDown()
         if (e.key === 'k') moveUp()
       }

       window.addEventListener('keydown', handleKey)
       return () => window.removeEventListener('keydown', handleKey)
     }, [])
   }
   ```

2. **Command palette (Cmd+K)**
   ```typescript
   // components/command-palette.tsx
   import { Command } from 'cmdk'

   export function CommandPalette() {
     return (
       <Command.Dialog open={open} onOpenChange={setOpen}>
         <Command.Input placeholder="Type a command..." />
         <Command.List>
           <Command.Group heading="Actions">
             <Command.Item onSelect={approveDraft}>
               Approve Draft <kbd>Alt+A</kbd>
             </Command.Item>
             <Command.Item onSelect={skipThread}>
               Skip Thread <kbd>Alt+S</kbd>
             </Command.Item>
             <Command.Item onSelect={composeNew}>
               Compose New Email <kbd>C</kbd>
             </Command.Item>
           </Command.Group>
         </Command.List>
       </Command.Dialog>
     )
   }
   ```

**Acceptance Criteria:**
- [ ] Alt+A approves draft
- [ ] Alt+S skips thread
- [ ] Alt+D closes workflow
- [ ] Cmd+K opens command palette
- [ ] J/K navigate up/down threads
- [ ] Visual hint shows shortcuts

**Files to create:**
- `frontend/hooks/use-keyboard-shortcuts.ts` - Shortcut hook
- `frontend/components/command-palette.tsx` - Command palette

---

### Phase 6: Concurrent Operations (Week 7)

**Goal:** Work on multiple emails at once

**Tasks:**

1. **Tab-based UI**
   ```typescript
   // components/draft-tabs.tsx
   'use client'
   import { useEmailStore } from '@/stores/email'

   export function DraftTabs() {
     const { openDrafts, activeTab, setActiveTab, closeDraft } = useEmailStore()

     return (
       <div className="flex border-b">
         {openDrafts.map(draft => (
           <button
             key={draft.thread_id}
             onClick={() => setActiveTab(draft.thread_id)}
             className={`px-4 py-2 ${
               activeTab === draft.thread_id ? 'border-b-2 border-blue-500' : ''
             }`}
           >
             {draft.subject}
             <button onClick={() => closeDraft(draft.thread_id)}>
               ×
             </button>
           </button>
         ))}
       </div>
     )
   }
   ```

2. **Background draft generation**
   ```typescript
   // stores/email.ts
   interface DraftTab {
     thread_id: string
     subject: string
     draft: string
     status: 'generating' | 'ready' | 'approved'
   }

   interface EmailStore {
     openDrafts: DraftTab[]
     activeTab: string | null

     startDraft: (thread: Thread, instructions: string) => void
     setActiveTab: (thread_id: string) => void
     closeDraft: (thread_id: string) => void
   }

   export const useEmailStore = create<EmailStore>((set, get) => ({
     openDrafts: [],
     activeTab: null,

     startDraft: (thread, instructions) => {
       // Add new tab
       set(state => ({
         openDrafts: [...state.openDrafts, {
           thread_id: thread.id,
           subject: thread.subject,
           draft: '',
           status: 'generating'
         }],
         activeTab: thread.id
       }))

       // Start streaming in background
       const es = new EventSource(`/api/py/drafts?...`)
       es.onmessage = (e) => {
         set(state => ({
           openDrafts: state.openDrafts.map(d =>
             d.thread_id === thread.id
               ? { ...d, draft: d.draft + e.data }
               : d
           )
         }))
       }
     },

     setActiveTab: (thread_id) => set({ activeTab: thread_id }),
     closeDraft: (thread_id) => set(state => ({
       openDrafts: state.openDrafts.filter(d => d.thread_id !== thread_id)
     }))
   }))
   ```

**Acceptance Criteria:**
- [ ] Can open multiple drafts in tabs
- [ ] Each draft generates independently
- [ ] Switch between tabs without losing state
- [ ] Close tabs with × button
- [ ] Active draft highlighted

**Files to create:**
- `frontend/components/draft-tabs.tsx` - Tab UI
- Modify `frontend/stores/email.ts` - Add multi-draft state

---

### Phase 7: Compose New Emails (Week 8)

**Goal:** Compose fresh emails (not just replies)

**Tasks:**

1. **Compose modal**
   ```typescript
   // components/compose-modal.tsx
   'use client'
   import { useState } from 'react'

   export function ComposeModal({ open, onClose }) {
     const [to, setTo] = useState('')
     const [cc, setCc] = useState('')
     const [subject, setSubject] = useState('')
     const [instructions, setInstructions] = useState('')
     const [draft, setDraft] = useState('')

     const generateDraft = async () => {
       const res = await fetch('/api/py/compose', {
         method: 'POST',
         body: JSON.stringify({ to, cc, subject, instructions })
       })

       const reader = res.body.getReader()
       while (true) {
         const { done, value } = await reader.read()
         if (done) break
         setDraft(prev => prev + new TextDecoder().decode(value))
       }
     }

     return (
       <Dialog open={open} onOpenChange={onClose}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Compose New Email</DialogTitle>
           </DialogHeader>

           <div className="space-y-4">
             <Input
               placeholder="To: email@example.com"
               value={to}
               onChange={(e) => setTo(e.target.value)}
             />
             <Input
               placeholder="Cc: (optional)"
               value={cc}
               onChange={(e) => setCc(e.target.value)}
             />
             <Input
               placeholder="Subject"
               value={subject}
               onChange={(e) => setSubject(e.target.value)}
             />
             <Textarea
               placeholder="What would you like to say?"
               value={instructions}
               onChange={(e) => setInstructions(e.target.value)}
               rows={3}
             />

             <Button onClick={generateDraft}>Generate Draft</Button>

             {draft && (
               <div className="prose border p-4">
                 {draft}
               </div>
             )}
           </div>
         </DialogContent>
       </Dialog>
     )
   }
   ```

2. **FastAPI: Compose endpoint**
   ```python
   # backend/routers/compose.py
   @router.post("/api/compose")
   async def compose_email(
       to: str,
       cc: str,
       subject: str,
       instructions: str
   ):
       async def stream():
           prompt = build_compose_prompt(to, cc, subject, instructions)

           async with anthropic.AsyncAnthropic() as client:
               async with client.messages.stream(
                   model="claude-sonnet-4-5",
                   messages=[{"role": "user", "content": prompt}],
               ) as stream:
                   async for text in stream.text_stream:
                       yield text

       return StreamingResponse(stream(), media_type="text/plain")
   ```

**Acceptance Criteria:**
- [ ] "Compose" button opens modal
- [ ] Fill in to, cc, subject, instructions
- [ ] Generate draft streams like replies
- [ ] Can approve and send
- [ ] Keyboard shortcut (C) to compose

**Files to create:**
- `frontend/components/compose-modal.tsx` - Compose UI
- `backend/routers/compose.py` - Compose endpoint

---

### Phase 8: Progress & Session Summary (Week 9)

**Goal:** Visual progress tracking and session summary

**Tasks:**

1. **Progress bar in header**
   ```typescript
   // components/inbox-header.tsx
   'use client'
   import { useEmailStore } from '@/stores/email'

   export function InboxHeader() {
     const { threads, draftedCount, skippedCount } = useEmailStore()
     const total = threads.length
     const processed = draftedCount + skippedCount
     const remaining = total - processed

     return (
       <div className="border-b p-4">
         <div className="flex items-center justify-between mb-2">
           <h1 className="text-2xl font-bold">Inbox</h1>
           <div className="text-sm text-gray-600">
             {processed} / {total} processed
           </div>
         </div>

         <div className="flex gap-4 text-sm">
           <span className="text-green-600">✓ {draftedCount} drafted</span>
           <span className="text-gray-500">→ {skippedCount} skipped</span>
           <span className="text-blue-600">⏳ {remaining} remaining</span>
         </div>

         <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
           <div
             className="bg-blue-500 h-2 rounded-full transition-all"
             style={{ width: `${(processed / total) * 100}%` }}
           />
         </div>
       </div>
     )
   }
   ```

2. **Session summary modal**
   ```typescript
   // components/session-summary.tsx
   'use client'

   export function SessionSummary({ open, onClose }) {
     const { draftedCount, draftedThreads, skippedCount } = useEmailStore()

     return (
       <Dialog open={open} onOpenChange={onClose}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>✅ Session Complete!</DialogTitle>
           </DialogHeader>

           <div className="space-y-4">
             <div className="text-center text-lg">
               📊 {draftedCount} drafted, {skippedCount} skipped
             </div>

             <div className="border-t pt-4">
               <h3 className="font-medium mb-2">Drafts Created:</h3>
               <ul className="space-y-1">
                 {draftedThreads.map(t => (
                   <li key={t.id} className="text-sm">
                     • {t.subject}
                   </li>
                 ))}
               </ul>
             </div>

             <Button asChild className="w-full">
               <a href="https://mail.google.com/mail/u/0/#drafts" target="_blank">
                 📝 Review in Gmail
               </a>
             </Button>
           </div>
         </DialogContent>
       </Dialog>
     )
   }
   ```

**Acceptance Criteria:**
- [ ] Progress bar shows % processed
- [ ] Live update (drafted/skipped counts)
- [ ] "Done" button shows summary modal
- [ ] Summary lists all drafted threads
- [ ] Link to Gmail drafts

**Files to create:**
- `frontend/components/inbox-header.tsx` - Header with progress
- `frontend/components/session-summary.tsx` - Summary modal

---

### Phase 9: Calendar & Linear Integration (Week 10-11)

**Goal:** Add calendar and linear UIs using shared patterns

**Tasks:**

1. **Calendar week view**
   ```typescript
   // app/calendar/page.tsx
   'use client'
   import { useEffect, useState } from 'react'
   import { CalendarWeekView } from '@/components/calendar-week-view'

   export default function CalendarPage() {
     const [events, setEvents] = useState([])

     useEffect(() => {
       fetch('/api/py/calendar/events?week=2026-01-17')
         .then(r => r.json())
         .then(data => setEvents(data.events))
     }, [])

     return (
       <div>
         <h1 className="text-2xl font-bold p-4">Calendar</h1>
         <CalendarWeekView events={events} />
       </div>
     )
   }
   ```

2. **FastAPI: Calendar endpoints**
   ```python
   # backend/routers/calendar.py
   @router.get("/api/calendar/events")
   async def get_events(week: str):
       # Parse week (e.g., "2026-01-17")
       start = parse_week_start(week)
       end = start + timedelta(days=7)

       events = await nylas_service.get_events(start, end)
       return {"events": events}

   @router.post("/api/calendar/events")
   async def create_event(title: str, start: int, end: int):
       event = await nylas_service.create_event(title, start, end)
       return {"event": event}
   ```

3. **Linear triage view**
   ```typescript
   // app/linear/page.tsx
   'use client'
   import { useEffect, useState } from 'react'

   export default function LinearPage() {
     const [issues, setIssues] = useState([])

     useEffect(() => {
       fetch('/api/py/linear/triage')
         .then(r => r.json())
         .then(data => setIssues(data.issues))
     }, [])

     return (
       <div>
         <h1 className="text-2xl font-bold p-4">Linear Triage</h1>
         <div className="space-y-2 p-4">
           {issues.map(issue => (
             <div key={issue.id} className="border p-4 rounded">
               <div className="font-medium">{issue.title}</div>
               <div className="text-sm text-gray-600">
                 {issue.priority} • {issue.team}
               </div>
             </div>
           ))}
         </div>
       </div>
     )
   }
   ```

**Acceptance Criteria:**
- [ ] Calendar week view displays events
- [ ] Can create/edit/delete events
- [ ] Linear triage shows issues
- [ ] Navigation between email/calendar/linear
- [ ] Shared FastAPI + Next.js patterns

**Files to create:**
- `frontend/app/calendar/page.tsx` - Calendar page
- `frontend/app/linear/page.tsx` - Linear page
- `backend/routers/calendar.py` - Calendar routes
- `backend/routers/linear.py` - Linear routes

---

## Technical Specifications

### Directory Structure

```
productivity-system/
├── backend/                    # FastAPI (Python)
│   ├── main.py                 # App entry point
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── threads.py          # Thread list/detail
│   │   ├── drafts.py           # Draft generation/creation
│   │   ├── compose.py          # New email composition
│   │   ├── calendar.py         # Calendar events
│   │   └── linear.py           # Linear issues
│   ├── services/
│   │   ├── __init__.py
│   │   ├── nylas_service.py    # Nylas API wrapper
│   │   ├── draft_service.py    # Draft generation logic
│   │   ├── calendar_service.py
│   │   └── linear_service.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── thread.py           # Pydantic models
│   │   ├── draft.py
│   │   └── calendar.py
│   ├── requirements.txt
│   └── pyproject.toml
├── frontend/                   # Next.js (TypeScript)
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home (inbox)
│   │   ├── inbox/
│   │   │   └── page.tsx
│   │   ├── calendar/
│   │   │   └── page.tsx
│   │   └── linear/
│   │       └── page.tsx
│   ├── components/
│   │   ├── ui/                 # Shadcn components
│   │   ├── thread-list.tsx
│   │   ├── thread-view.tsx
│   │   ├── draft-editor.tsx
│   │   ├── compose-modal.tsx
│   │   ├── command-palette.tsx
│   │   └── inbox-header.tsx
│   ├── stores/
│   │   ├── email.ts            # Zustand store
│   │   ├── calendar.ts
│   │   └── linear.ts
│   ├── hooks/
│   │   └── use-keyboard-shortcuts.ts
│   ├── lib/
│   │   └── utils.ts
│   ├── package.json
│   ├── next.config.js
│   └── tsconfig.json
├── shared/                     # Shared types (optional)
│   └── types.ts
├── .env                        # Environment variables
├── .env.example
├── README.md
└── docker-compose.yml          # Optional: Docker setup
```

### API Routes

**Backend (FastAPI):**

```
GET    /api/threads                 - List threads (to-respond-paul)
GET    /api/threads/{id}            - Get thread detail + messages
POST   /api/drafts                  - Generate draft (SSE streaming)
POST   /api/drafts/create           - Create Gmail draft
POST   /api/compose                 - Compose new email (SSE streaming)
GET    /api/calendar/events         - List calendar events
POST   /api/calendar/events         - Create event
PUT    /api/calendar/events/{id}    - Update event
DELETE /api/calendar/events/{id}    - Delete event
GET    /api/linear/triage           - List triage issues
POST   /api/linear/issues           - Create issue
```

**Frontend (Next.js):**

```
/                   - Home (redirects to /inbox)
/inbox              - Email workflow
/calendar           - Calendar week view
/linear             - Linear triage
```

### State Management (Zustand)

```typescript
// stores/email.ts
interface EmailStore {
  // Thread list
  threads: Thread[]
  currentThread: Thread | null
  messages: Message[]

  // Multi-draft tabs
  openDrafts: DraftTab[]
  activeTab: string | null

  // Progress tracking
  draftedCount: number
  skippedCount: number
  draftedThreads: Thread[]

  // Actions
  fetchThreads: () => Promise<void>
  setCurrentThread: (thread: Thread) => Promise<void>
  startDraft: (thread: Thread, instructions: string) => void
  approveDraft: (thread_id: string) => Promise<void>
  skipThread: (thread_id: string) => void
  setActiveTab: (thread_id: string) => void
}
```

### Environment Variables

```bash
# .env
NYLAS_API_KEY=your_key
NYLAS_GRANT_ID=your_grant_id
ANTHROPIC_API_KEY=your_key

# Frontend (optional)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Type Safety (OpenAPI)

**Generate TypeScript client from FastAPI:**

```bash
# Auto-generate on backend changes
npx @hey-api/openapi-ts \
  -i http://localhost:8000/openapi.json \
  -o frontend/src/client

# Use generated client
import { getThreads, generateDraft } from '@/client'

const threads = await getThreads({ label: 'Label_139' })
```

---

## Migration Strategy

### Phase 1: Build New, Keep Old (Weeks 1-4)

**Approach:** Build new web app in parallel, don't touch TMUX workflow yet

**Steps:**
1. Create new directories `backend/` and `frontend/`
2. Port Python code to FastAPI services
3. Build Next.js UI with same features
4. Test new workflow thoroughly

**Risk:** None - old workflow still works

---

### Phase 2: A/B Testing (Weeks 5-6)

**Approach:** Use both workflows, compare UX

**User can choose:**
```bash
# Old workflow (TMUX)
/email-respond

# New workflow (web app)
cd backend && uvicorn main:app --reload &
cd frontend && npm run dev
open http://localhost:3000/inbox
```

**Gather feedback:**
- Speed comparison (old vs new)
- UI/UX preference
- Bug reports

---

### Phase 3: Deprecate TMUX (Week 7)

**Approach:** Once new workflow is validated, archive old code

**Steps:**
1. Move TMUX scripts to `archive/tmux-workflow/`
2. Update SKILL.md to point to web app
3. Add deprecation notice to old scripts
4. Keep `email_utils.py` (shared library)

**Fallback:** Old workflow still in archive if needed

---

## Success Metrics

### Performance

- **Email processing time:** <10 seconds per email (down from 15-30s)
- **Draft streaming:** Tokens appear in <500ms (vs waiting for full response)
- **Concurrent drafts:** Handle 3+ emails in tabs without slowdown

### User Experience

- **Keyboard shortcuts:** 100% parity with TMUX (Alt+A/S/D/V)
- **Visual state:** Progress bar shows drafted/skipped/remaining
- **Rich formatting:** Hyperlinks, bold, italic preserved in drafts
- **Error handling:** Graceful failures with retry options

### Reliability

- **No pane crashes:** Web app doesn't lose state (vs TMUX crashes)
- **No shell quoting:** HTML content handled correctly
- **Idempotent:** Starting workflow doesn't create duplicate drafts

### Extensibility

- **Calendar UI:** Added with same patterns (weeks 10-11)
- **Linear UI:** Added with same patterns (weeks 10-11)
- **New features:** Easy to add (command palette, templates, etc.)

---

## Future Enhancements (Post-MVP)

### Phase 10: Advanced Features

**Draft Templates:**
- Save commonly used responses as templates
- Insert template with keyboard shortcut
- Variables: `{{name}}`, `{{date}}`, etc.

**Smart Recipients:**
- Auto-suggest CC recipients based on thread history
- Warn if key stakeholder missing from CC

**Email Analytics:**
- Response time tracking
- Most common topics (sentiment analysis)
- Draft quality feedback (too long, too formal, etc.)

### Phase 11: Mobile Support

**Responsive design:**
- Mobile-friendly layout (stack columns)
- Touch-friendly buttons (larger targets)
- Swipe gestures (swipe to skip)

**PWA (Progressive Web App):**
- Install on iPhone/iPad
- Offline support (cache drafts)
- Push notifications (new emails)

### Phase 12: Collaboration

**Multi-user:**
- Share inbox access (e.g., support team)
- Assign threads to team members
- Comment on drafts before sending

**Integrations:**
- Slack notifications (new draft ready)
- Linear issue creation (from email thread)
- Notion page creation (from important emails)

---

## Risks & Mitigation

### Risk 1: Rewriting Python Code Takes Longer Than Expected

**Likelihood:** Medium
**Impact:** High (delays timeline)

**Mitigation:**
- Don't rewrite - wrap existing code in FastAPI routes
- Use subprocess calls if needed (e.g., `draft-email.py`)
- Refactor incrementally (not all at once)

**Fallback:** Keep calling Python scripts as subprocesses from FastAPI

---

### Risk 2: Streaming Doesn't Work Smoothly

**Likelihood:** Low
**Impact:** Medium (poor UX)

**Mitigation:**
- Test SSE early (Phase 3)
- Use FastAPI's built-in `StreamingResponse`
- Handle network interruptions (auto-reconnect)

**Fallback:** Non-streaming (full response) with loading spinner

---

### Risk 3: User Prefers TMUX Workflow

**Likelihood:** Low
**Impact:** Low (just keep old workflow)

**Mitigation:**
- A/B test both workflows (Phase 2)
- Gather feedback early
- Keep old workflow as fallback

**Fallback:** Archive new web app, continue with TMUX

---

### Risk 4: CORS Issues in Local Development

**Likelihood:** High
**Impact:** Low (known solution)

**Mitigation:**
- Use Next.js proxy (`next.config.js` rewrites)
- OR: FastAPI CORS middleware for `/api/*`

**Solution:**
```javascript
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/py/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ]
  },
}
```

---

## Questions for Clarification

### 1. Deployment

**Question:** Do you want to deploy to Vercel + Supabase eventually, or keep it local forever?

**Options:**
- **Local only:** Run `npm run dev` + `uvicorn` every time
- **Deploy to Vercel:** Access from any device (laptop, phone, iPad)
- **Hybrid:** Local for development, deploy for production

**Recommendation:** Start local, add deployment later if needed

---

### 2. Database

**Question:** Do you want to store any historical data (past drafts, analytics)?

**Options:**
- **No database:** Fully stateless (idempotent)
- **Redis cache:** Temporary session state (24h TTL)
- **Supabase:** Full historical data (drafts, threads, analytics)

**Recommendation:** Start without database (stateless), add Redis if needed

---

### 3. Multi-User

**Question:** Is this just for you, or will others use it (team, assistant)?

**Options:**
- **Single user:** No auth, just run locally
- **Multi-user:** Add authentication (NextAuth.js + Supabase)

**Recommendation:** Start single-user, add auth later if needed

---

## References

### Research Documents

1. **Repository Research** (`agentId: a870f4a`)
   - Current architecture analysis
   - Pain points and bugs
   - Shared services patterns
   - CLI vs UI recommendations

2. **Best Practices Research** (`agentId: a95182a`)
   - Local web app architectures
   - Lightweight deployment strategies
   - Speed optimization techniques
   - Modern email client UI/UX patterns

3. **Framework Documentation** (`agentId: accd463`)
   - Next.js 15 App Router
   - FastAPI async patterns
   - React 19 features
   - Zustand state management
   - SSE streaming for LLMs

### External Resources

- [FastAPI + Next.js Template](https://github.com/vintasoftware/nextjs-fastapi-template)
- [Superhuman Keyboard Shortcuts](https://help.superhuman.com/hc/en-us/articles/45191759067411)
- [Command Palette Library (cmdk)](https://github.com/pacocoursey/cmdk)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)

---

## Next Steps

### Immediate (This Week)

1. **Review this plan** - Discuss with user, adjust priorities
2. **Decide on deployment** - Local only or eventual Vercel?
3. **Decide on database** - Stateless or Redis/Supabase?
4. **Create branch** - `feature/email-webapp-redesign`

### Week 1 (Setup)

1. **Create monorepo structure** - `backend/` + `frontend/`
2. **Setup FastAPI** - Port `email_utils.py` to service
3. **Setup Next.js** - Install Shadcn UI, configure proxy
4. **Test integration** - Verify FastAPI ↔ Next.js works

### Week 2+ (Build)

Follow implementation phases above (Phase 1-9)

---

## Appendix A: UI Mockups

### Inbox Layout (Three-column)

```
┌────────────────────────────────────────────────────────────────┐
│  📧 Inbox: to-respond-paul (12)        [👤 Paul]  [⚙️ Settings] │
│  ✓ 2 drafted | → 1 skipped | ⏳ 9 remaining                     │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░ 25%                         │
├──────────────┬────────────────────┬────────────────────────────┤
│              │                    │                            │
│ 📂 Folders   │ 📩 Thread List     │ 📧 Thread Detail          │
│              │ (12 threads)       │ + Draft Editor            │
│              │                    │                            │
│ • Inbox (12) │ [✓] 1. Meeting...  │ Subject: Contract Q's     │
│ • Drafts (5) │ [✓] 2. Product...  │ From: Bob Wilson          │
│ • Sent       │ [→] 3. Contract... │ Date: Jan 10, 10:30 AM    │
│ • Archive    │ [ ] 4. Feature...  │                            │
│              │ [ ] 5. Pricing...  │ [Latest message body...]  │
│              │ ...                │                            │
│              │                    │ ─────────────────────────  │
│              │                    │ Your Draft:               │
│              │                    │                            │
│              │                    │ [Draft preview or editor] │
│              │                    │                            │
│              │                    │ [Approve] [Skip] [Revise] │
│              │                    │                            │
└──────────────┴────────────────────┴────────────────────────────┘
Cmd+K: Commands | Alt+A: Approve | Alt+S: Skip | Alt+D: Done
```

### Draft Editor (Streaming)

```
┌────────────────────────────────────────────────────────────────┐
│ ✏️  Your Draft                                     [Streaming...]│
├────────────────────────────────────────────────────────────────┤
│ To: bob@company.com                                            │
│ Cc: jane@company.com                                           │
│ Subject: Re: Contract questions for Q1 renewal                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Hi Bob,                                                        │
│                                                                │
│ Thanks for reaching out about the Q1 renewal. For the first   │
│ report, we'll provide a static PDF with the key metrics you   │
│ requested. Once you're ready for full engagement tracking,    │
│ we can grant workspace access with real-time dashboards.█     │
│                                                                │
│ [Streaming token-by-token from Claude...]                     │
│                                                                │
│                                                                │
│                                                                │
│                                                                │
│                                                                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ [✓ Approve]  [→ Skip]  [↻ Revise...]                          │
└────────────────────────────────────────────────────────────────┘
```

### Command Palette (Cmd+K)

```
┌────────────────────────────────────────────────┐
│ Type a command or search...                    │
│ ┌────────────────────────────────────────────┐ │
│ │ approve                                    │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ Actions                                        │
│ ▸ Approve Draft                   Alt+A       │
│ ▸ Skip Thread                     Alt+S       │
│ ▸ Done                            Alt+D       │
│ ▸ Compose New Email               C           │
│                                                │
│ Navigate                                       │
│ ▸ Go to Inbox                     G I         │
│ ▸ Go to Calendar                  G C         │
│ ▸ Go to Linear                    G L         │
│                                                │
│ Recent                                         │
│ ▸ Contract questions - Bob Wilson             │
│ ▸ Product demo request - Jane Doe             │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Appendix B: Code Snippets

### FastAPI Main App

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import threads, drafts, compose, calendar, linear

app = FastAPI(title="Productivity System API", version="1.0.0")

# CORS for Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(threads.router, prefix="/api", tags=["threads"])
app.include_router(drafts.router, prefix="/api", tags=["drafts"])
app.include_router(compose.router, prefix="/api", tags=["compose"])
app.include_router(calendar.router, prefix="/api", tags=["calendar"])
app.include_router(linear.router, prefix="/api", tags=["linear"])

@app.get("/")
async def root():
    return {"message": "Productivity System API"}

@app.get("/health")
async def health():
    return {"status": "ok"}
```

### Next.js Root Layout

```typescript
// frontend/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { CommandPalette } from '@/components/command-palette'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Productivity System',
  description: 'Email workflow, calendar, and linear integration',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <CommandPalette />
        <Toaster />
      </body>
    </html>
  )
}
```

### Zustand Store (Complete)

```typescript
// frontend/stores/email.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

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
  conversation: string
  date: number
}

interface DraftTab {
  thread_id: string
  thread: Thread
  draft: string
  status: 'generating' | 'ready' | 'approved'
  instructions: string
}

interface EmailStore {
  // Thread list
  threads: Thread[]
  currentThread: Thread | null
  messages: Message[]
  isLoading: boolean

  // Multi-draft tabs
  openDrafts: DraftTab[]
  activeTab: string | null

  // Progress tracking
  draftedCount: number
  skippedCount: number
  draftedThreads: Thread[]

  // Actions
  fetchThreads: () => Promise<void>
  setCurrentThread: (thread: Thread) => Promise<void>
  startDraft: (thread: Thread, instructions: string) => void
  approveDraft: (thread_id: string) => Promise<void>
  skipThread: (thread_id: string) => void
  setActiveTab: (thread_id: string) => void
  closeDraft: (thread_id: string) => void
  reset: () => void
}

export const useEmailStore = create<EmailStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        threads: [],
        currentThread: null,
        messages: [],
        isLoading: false,
        openDrafts: [],
        activeTab: null,
        draftedCount: 0,
        skippedCount: 0,
        draftedThreads: [],

        // Fetch threads
        fetchThreads: async () => {
          set({ isLoading: true })
          try {
            const res = await fetch('/api/py/threads')
            const data = await res.json()
            set({ threads: data.threads, isLoading: false })
          } catch (error) {
            console.error('Failed to fetch threads:', error)
            set({ isLoading: false })
          }
        },

        // Set current thread and fetch messages
        setCurrentThread: async (thread) => {
          set({ currentThread: thread, messages: [], isLoading: true })
          try {
            const res = await fetch(`/api/py/threads/${thread.id}`)
            const data = await res.json()
            set({ messages: data.messages, isLoading: false })
          } catch (error) {
            console.error('Failed to fetch thread:', error)
            set({ isLoading: false })
          }
        },

        // Start draft generation (opens new tab)
        startDraft: (thread, instructions) => {
          // Add new tab
          set(state => ({
            openDrafts: [...state.openDrafts, {
              thread_id: thread.id,
              thread,
              draft: '',
              status: 'generating',
              instructions,
            }],
            activeTab: thread.id,
          }))

          // Start streaming
          const es = new EventSource(
            `/api/py/drafts?thread_id=${thread.id}&instructions=${encodeURIComponent(instructions)}`
          )

          es.onmessage = (e) => {
            set(state => ({
              openDrafts: state.openDrafts.map(d =>
                d.thread_id === thread.id
                  ? { ...d, draft: d.draft + e.data }
                  : d
              ),
            }))
          }

          es.onerror = () => {
            es.close()
            set(state => ({
              openDrafts: state.openDrafts.map(d =>
                d.thread_id === thread.id
                  ? { ...d, status: 'ready' }
                  : d
              ),
            }))
          }
        },

        // Approve draft
        approveDraft: async (thread_id) => {
          const draft = get().openDrafts.find(d => d.thread_id === thread_id)
          if (!draft) return

          try {
            await fetch('/api/py/drafts/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                thread_id,
                draft_body: draft.draft,
                subject: draft.thread.subject,
              }),
            })

            // Update state
            set(state => ({
              draftedCount: state.draftedCount + 1,
              draftedThreads: [...state.draftedThreads, draft.thread],
              openDrafts: state.openDrafts.filter(d => d.thread_id !== thread_id),
            }))
          } catch (error) {
            console.error('Failed to approve draft:', error)
          }
        },

        // Skip thread
        skipThread: (thread_id) => {
          set(state => ({
            skippedCount: state.skippedCount + 1,
            openDrafts: state.openDrafts.filter(d => d.thread_id !== thread_id),
          }))
        },

        // Set active tab
        setActiveTab: (thread_id) => {
          set({ activeTab: thread_id })
        },

        // Close draft tab
        closeDraft: (thread_id) => {
          set(state => ({
            openDrafts: state.openDrafts.filter(d => d.thread_id !== thread_id),
          }))
        },

        // Reset session
        reset: () => {
          set({
            currentThread: null,
            messages: [],
            openDrafts: [],
            activeTab: null,
            draftedCount: 0,
            skippedCount: 0,
            draftedThreads: [],
          })
        },
      }),
      {
        name: 'email-store',
        partialize: (state) => ({
          // Only persist progress tracking (not full thread data)
          draftedCount: state.draftedCount,
          skippedCount: state.skippedCount,
          draftedThreads: state.draftedThreads,
        }),
      }
    )
  )
)
```

---

**End of Plan**
