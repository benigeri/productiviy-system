# Local Web App Tech Stack Documentation (2026)

**Generated:** 2026-01-10

This document provides comprehensive documentation and examples for building a local web application with modern tech stacks, focusing on Next.js 15, FastAPI, React 19, and integration patterns for streaming LLM responses.

---

## Table of Contents

1. [Next.js 15 (App Router)](#nextjs-15-app-router)
2. [FastAPI (Python Backend)](#fastapi-python-backend)
3. [React 19](#react-19)
4. [Zustand State Management](#zustand-state-management)
5. [Integration Patterns](#integration-patterns)
6. [References](#references)

---

## Next.js 15 (App Router)

### Overview

Next.js 15 with the App Router is the reference stack for building full-stack web applications in 2026. It provides server-side rendering, streaming, and seamless integration with React 19.

**Key Version:** `/vercel/next.js/v15.1.8`

### App Router Best Practices

#### Route Handlers vs API Routes

- **API Routes** (`pages/api`): Traditional approach, still supported but considered legacy
- **Route Handlers** (`app` directory): New approach using Web Request/Response APIs

Route Handlers should be used to access backend resources from Client Components, but avoid calling them from Server Components to prevent unnecessary server requests.

```ts
// app/api/chat/route.ts
export async function GET(request: Request) {
  // Handle GET request
}

export async function POST(request: Request) {
  // Handle POST request
}
```

### Server-Sent Events for Streaming

Next.js 15 supports native Web APIs for streaming responses, perfect for LLM token streaming.

```ts
// Convert async iterator to ReadableStream
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()

      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    }
  })
}

function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

const encoder = new TextEncoder()

async function* makeIterator() {
  yield encoder.encode("<p>One</p>")
  await sleep(200)
  yield encoder.encode("<p>Two</p>")
  await sleep(200)
  yield encoder.encode("<p>Three</p>")
}

export async function GET() {
  const iterator = makeIterator()
  const stream = iteratorToStream(iterator)

  return new Response(stream)
}
```

**Why Use SSE for LLM Streaming:**
- Reduces time-to-first-token
- Improves perceived wait time
- Users start reading within milliseconds
- Avoids network timeouts and proxy buffering

### Local Development

Start the development server with hot-reloading:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

The app will be available at `http://localhost:3000` with API routes accessible at `/api/*`.

### Key Differences: Local vs Production

- **Local Development**: Fast refresh, detailed error messages, unoptimized builds
- **Production Deployment**: Optimized builds, server-side rendering, edge deployment options

---

## FastAPI (Python Backend)

### Overview

FastAPI is a modern, high-performance Python web framework ideal for async operations, real-time updates, and LLM integrations.

**Key Library:** `/websites/fastapi_tiangolo` (Benchmark Score: 94.6)

### Async Request Handling

FastAPI's async nature makes it perfect for I/O-bound operations:

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def read_root():
    return {"message": "Hello World"}

@app.get("/items/{item_id}")
async def read_item(item_id: int):
    # Async database query, API call, etc.
    result = await fetch_item(item_id)
    return result
```

### CORS Configuration for Local Development

Essential for Next.js frontend to communicate with FastAPI backend:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

origins = [
    "http://localhost:3000",  # Next.js dev server
    "http://localhost:8080",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def main():
    return {"message": "Hello World"}
```

**Production Best Practice:** Replace `["*"]` with specific allowed methods/headers and specify exact domains instead of wildcards.

### Server-Sent Events (SSE)

FastAPI supports SSE through `StreamingResponse` for real-time updates:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio

app = FastAPI()

async def event_generator():
    """Async generator for SSE"""
    for i in range(10):
        # Simulate async work
        await asyncio.sleep(1)
        # SSE format: "data: {content}\n\n"
        yield f"data: Message {i}\n\n"

@app.get("/stream")
async def stream_events():
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

### WebSocket Support

For bidirectional communication:

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.send_personal_message(f"You wrote: {data}", websocket)
            await manager.broadcast(f"Client #{client_id} says: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"Client #{client_id} left the chat")
```

### File Upload & Download

#### File Upload

```python
from fastapi import FastAPI, UploadFile, File
from typing import List

app = FastAPI()

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    """Single file upload"""
    contents = await file.read()
    # Process file
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(contents)
    }

@app.post("/upload-multiple/")
async def upload_multiple_files(files: List[UploadFile] = File(...)):
    """Multiple file upload"""
    return [
        {
            "filename": file.filename,
            "content_type": file.content_type
        }
        for file in files
    ]
```

**Large File Streaming:** Files are stored in memory up to a limit, then spilled to disk. For very large files, stream in chunks:

```python
@app.post("/upload-large/")
async def upload_large_file(file: UploadFile = File(...)):
    """Stream large file to disk"""
    chunk_size = 8192  # 8KB chunks

    with open(f"./uploads/{file.filename}", "wb") as f:
        while chunk := await file.read(chunk_size):
            f.write(chunk)

    return {"filename": file.filename, "status": "saved"}
```

#### File Download

```python
from fastapi.responses import FileResponse, StreamingResponse

@app.get("/download/{filename}")
async def download_file(filename: str):
    """Download file using FileResponse"""
    file_path = f"./files/{filename}"
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream"
    )

@app.get("/stream-download/{filename}")
async def stream_download(filename: str):
    """Stream large file download"""
    async def file_iterator(file_path: str):
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                yield chunk

    return StreamingResponse(
        file_iterator(f"./files/{filename}"),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
```

### Streaming LLM Responses

FastAPI integrates seamlessly with LLM APIs for streaming responses:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import openai

app = FastAPI()

@app.post("/chat/stream")
async def stream_chat(message: str):
    """Stream OpenAI responses"""
    async def generate():
        response = await openai.ChatCompletion.acreate(
            model="gpt-4",
            messages=[{"role": "user", "content": message}],
            stream=True
        )

        async for chunk in response:
            if content := chunk.choices[0].delta.get("content"):
                # SSE format
                yield f"data: {content}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream"
    )
```

---

## React 19

### Overview

React 19 introduces powerful features for concurrent rendering, async operations, and form handling.

**Key Library:** `/websites/react_dev` (Benchmark Score: 74.5)

### Concurrent Rendering Features

React 19's concurrent features enable better performance and user experience through:
- Automatic batching of state updates
- Suspense for data fetching
- Transitions for non-urgent updates

### Suspense for Async Operations

The new `use` API allows reading promises directly in render:

```jsx
import { use, Suspense } from 'react';

function Comments({ commentsPromise }) {
  // `use` will suspend until the promise resolves
  const comments = use(commentsPromise);
  return comments.map(comment => <p key={comment.id}>{comment.text}</p>);
}

function Page({ commentsPromise }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  );
}
```

**Important:** The promise must be created outside render or through Suspense-compatible libraries.

### Form Handling with Actions

React 19 introduces `useActionState` for handling form submissions:

```jsx
import { useActionState } from 'react';

function ChangeName({ name, setName }) {
  const [error, submitAction, isPending] = useActionState(
    async (previousState, formData) => {
      const error = await updateName(formData.get("name"));
      if (error) {
        return error;
      }
      redirect("/path");
      return null;
    },
    null,
  );

  return (
    <form action={submitAction}>
      <input type="text" name="name" />
      <button type="submit" disabled={isPending}>Update</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

**Benefits:**
- Automatic form reset on success
- Built-in error handling
- Loading state management
- No manual event handlers needed

### Optimistic Updates

Use `useOptimistic` for immediate UI feedback:

```jsx
import { useOptimistic, useState, useRef, startTransition } from "react";

function Thread({ messages, sendMessageAction }) {
  const formRef = useRef();
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage) => [
      {
        text: newMessage,
        sending: true
      },
      ...state,
    ]
  );

  function formAction(formData) {
    addOptimisticMessage(formData.get("message"));
    formRef.current.reset();
    startTransition(async () => {
      await sendMessageAction(formData);
    });
  }

  return (
    <>
      <form action={formAction} ref={formRef}>
        <input type="text" name="message" placeholder="Hello!" />
        <button type="submit">Send</button>
      </form>
      {optimisticMessages.map((message, index) => (
        <div key={index}>
          {message.text}
          {!!message.sending && <small> (Sending...)</small>}
        </div>
      ))}
    </>
  );
}
```

**Use Cases:**
- Chat applications
- Social media interactions
- Form submissions
- Any UI that benefits from immediate feedback

### Keyboard Event Handling

React 19 maintains consistent event handling:

```jsx
export default function KeyboardExample() {
  return (
    <label>
      First name:
      <input
        name="firstName"
        onKeyDown={e => {
          console.log('Key:', e.key, 'Code:', e.code);

          // Handle specific keys
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }

          // Handle modifiers
          if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            handleSave();
          }
        }}
        onKeyUp={e => console.log('Released:', e.key)}
      />
    </label>
  );
}
```

---

## Zustand State Management

### Overview

Zustand is the recommended state management solution for 2026 due to its simplicity and excellent TypeScript support.

**Key Library:** `/pmndrs/zustand/v5.0.8` (Benchmark Score: 87.5)

**Why Zustand in 2026:**
- Minimal boilerplate
- Hook-based API
- No providers needed
- Excellent TypeScript support
- Works seamlessly with React 19

### Basic Store Creation

```ts
import { create } from 'zustand'

interface BearState {
  bears: number
  increase: (by: number) => void
  reset: () => void
}

const useBearStore = create<BearState>((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
  reset: () => set({ bears: 0 }),
}))

// Usage in component
function BearCounter() {
  const bears = useBearStore((state) => state.bears)
  const increase = useBearStore((state) => state.increase)

  return (
    <div>
      <h1>{bears} bears</h1>
      <button onClick={() => increase(1)}>Add bear</button>
    </div>
  )
}
```

### Next.js App Router Integration

**Critical Considerations for Next.js 15:**

1. **Use 'use client' directive** - Zustand relies on hooks
2. **Per-request stores** - Create stores per request, not as global variables
3. **Hydration handling** - Initialize on server and client with same data
4. **Server Components** - Should NOT read from or write to Zustand stores

```tsx
// store/bearStore.ts
'use client'

import { create } from 'zustand'

interface BearState {
  bears: number
  increase: (by: number) => void
}

export const useBearStore = create<BearState>((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
}))
```

```tsx
// app/components/BearCounter.tsx
'use client'

import { useBearStore } from '@/store/bearStore'

export function BearCounter() {
  const bears = useBearStore((state) => state.bears)
  const increase = useBearStore((state) => state.increase)

  return (
    <div>
      <h1>{bears} bears</h1>
      <button onClick={() => increase(1)}>Add bear</button>
    </div>
  )
}
```

### Middleware: DevTools and Persist

```ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type {} from '@redux-devtools/extension' // for typing

interface BearState {
  bears: number
  increase: (by: number) => void
}

const useBearStore = create<BearState>()(
  devtools(
    persist(
      (set) => ({
        bears: 0,
        increase: (by) => set((state) => ({ bears: state.bears + by })),
      }),
      {
        name: 'bear-storage', // localStorage key
      },
    ),
  ),
)
```

### Session Storage

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface MyState {
  bears: number
  addABear: () => void
}

export const useBearStore = create<MyState>()(
  persist(
    (set, get) => ({
      bears: 0,
      addABear: () => set({ bears: get().bears + 1 }),
    }),
    {
      name: 'food-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ bears: state.bears }), // Only persist specific fields
    },
  ),
)
```

### Best Practices for 2026

1. **Multi-store approach** - Create separate stores for different domains
2. **Selector optimization** - Use selective subscriptions to prevent re-renders
3. **Async actions** - Handle async operations within store actions
4. **TypeScript first** - Always use TypeScript for type safety

```ts
// Multiple focused stores
export const useAuthStore = create<AuthState>(...)
export const useChatStore = create<ChatState>(...)
export const useSettingsStore = create<SettingsState>(...)

// Selective subscription
function BearCounter() {
  // Only re-renders when bears changes
  const bears = useBearStore((state) => state.bears)

  // Not when other state changes
  return <h1>{bears} bears</h1>
}

// Async actions
const useDataStore = create<DataState>((set) => ({
  data: null,
  loading: false,
  fetchData: async () => {
    set({ loading: true })
    try {
      const response = await fetch('/api/data')
      const data = await response.json()
      set({ data, loading: false })
    } catch (error) {
      set({ loading: false, error })
    }
  },
}))
```

---

## Integration Patterns

### Next.js Frontend + FastAPI Backend

#### Architecture Overview

```
┌─────────────────────────────────────┐
│     Next.js Frontend (Port 3000)    │
│  - React 19 Components              │
│  - Zustand State Management         │
│  - SSE Client for Streaming         │
└──────────────┬──────────────────────┘
               │ HTTP/SSE
               │ CORS enabled
┌──────────────┴──────────────────────┐
│     FastAPI Backend (Port 8000)     │
│  - Async Route Handlers             │
│  - SSE Streaming                    │
│  - File Upload/Download             │
│  - LLM Integration                  │
└─────────────────────────────────────┘
```

#### CORS Setup

FastAPI must allow the Next.js origin:

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Next.js API Proxy (Alternative)

Instead of direct CORS, proxy requests through Next.js:

```ts
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ]
  },
}
```

Now call `/api/backend/chat` instead of `http://localhost:8000/chat`.

### Streaming LLM Responses

#### FastAPI Backend with FastAPI AI SDK

The [FastAPI AI SDK](https://github.com/doganarif/fastapi-ai-sdk) provides seamless integration with Vercel AI SDK:

```python
from fastapi import FastAPI
from fastapi_ai_sdk import AIStreamBuilder, ai_endpoint

app = FastAPI()

@app.post("/api/chat")
@ai_endpoint()
async def chat(query: str):
    """Stream AI responses with reasoning and tool calls"""
    builder = AIStreamBuilder(message_id="custom_msg_123")

    # Show reasoning process
    builder.reasoning(
        "Analyzing your query and determining the best approach...",
        chunk_size=20
    )

    # Make tool call
    weather_data = {"temperature": 72, "condition": "sunny"}
    builder.tool_call(
        tool_name="get_weather",
        input_data={"city": "San Francisco"},
        output_data=weather_data,
        tool_call_id="call_abc123"
    )

    # Stream text response
    builder.text(
        "Based on the weather data, it's a beautiful sunny day!",
        text_id="txt_001"
    )

    # Add structured data
    builder.data("weather", {
        "temperature": 72,
        "condition": "sunny",
        "humidity": 65,
    })

    return builder
```

#### Alternative: Custom Event Generator

```python
from fastapi import FastAPI
from fastapi_ai_sdk import AIStream, create_ai_stream_response
from fastapi_ai_sdk.models import (
    StartEvent, TextStartEvent, TextDeltaEvent,
    TextEndEvent, FinishEvent
)
import asyncio

app = FastAPI()

@app.get("/api/stream")
async def custom_stream():
    """Fine-grained control over event generation"""
    async def event_generator():
        yield StartEvent(message_id="msg_custom")

        text_id = "text_001"
        yield TextStartEvent(id=text_id)

        response_words = ["Hello", "from", "FastAPI", "AI", "SDK"]
        for word in response_words:
            yield TextDeltaEvent(id=text_id, delta=word + " ")
            await asyncio.sleep(0.2)

        yield TextEndEvent(id=text_id)
        yield FinishEvent()

    stream = AIStream(event_generator())
    return create_ai_stream_response(stream)
```

#### Next.js Frontend with Vercel AI SDK

```tsx
'use client';

import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error
  } = useChat({
    api: 'http://localhost:8000/api/chat',
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      {/* Messages Display */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-4 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-100 ml-auto'
                : 'bg-gray-100'
            }`}
          >
            <p className="font-semibold">{message.role}</p>
            <p className="whitespace-pre-wrap">{message.content}</p>

            {/* Display structured data if present */}
            {message.data && (
              <div className="mt-2 p-2 bg-white rounded text-xs">
                <pre>{JSON.stringify(message.data, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="text-gray-500 animate-pulse">
            AI is thinking...
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-100 text-red-700 rounded-lg">
            Error: {error.message}
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type your message..."
          className="flex-1 p-2 border rounded-lg"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:bg-gray-300"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

### File Upload Frontend to Backend

#### Next.js File Upload Component

```tsx
'use client';

import { useState } from 'react';

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-4"
      />
      <button
        type="submit"
        disabled={!file || uploading}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>

      {result && (
        <div className="mt-4">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </form>
  );
}
```

#### FastAPI File Upload Endpoint

```python
from fastapi import FastAPI, UploadFile, File

app = FastAPI()

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()

    # Process file (save, analyze, etc.)
    with open(f"./uploads/{file.filename}", "wb") as f:
        f.write(contents)

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(contents)
    }
```

### Session Management Without Database

Use Zustand with persist for client-side session state:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  userId: string | null
  sessionId: string | null
  messages: Array<{ role: string; content: string }>
  setSession: (userId: string, sessionId: string) => void
  addMessage: (role: string, content: string) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      sessionId: null,
      messages: [],
      setSession: (userId, sessionId) => set({ userId, sessionId }),
      addMessage: (role, content) =>
        set((state) => ({
          messages: [...state.messages, { role, content }]
        })),
      clearSession: () => set({
        userId: null,
        sessionId: null,
        messages: []
      }),
    }),
    {
      name: 'session-storage',
    },
  ),
)
```

---

## References

### Official Documentation

- [Next.js Documentation](https://nextjs.org/docs) (v15.1.8)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Zustand Documentation](https://zustand.docs.pmnd.rs/)

### Context7 Libraries Used

- `/vercel/next.js/v15.1.8` - Next.js 15 App Router
- `/websites/fastapi_tiangolo` - FastAPI Framework
- `/websites/react_dev` - React 19 Features
- `/pmndrs/zustand/v5.0.8` - Zustand State Management
- `/doganarif/fastapi-ai-sdk` - FastAPI AI SDK for Streaming

### Web Resources

#### Next.js Streaming

- [Using Server-Sent Events (SSE) to stream LLM responses in Next.js](https://upstash.com/blog/sse-streaming-llm-responses) - Upstash Blog
- [Powerful Guide to Streaming LLM responses in Next.js with Server-Sent Events](https://www.eaures.online/streaming-llm-responses-in-next-js) - Eaures
- [Real-Time Notifications with Server-Sent Events (SSE) in Next.js](https://www.pedroalonso.net/blog/sse-nextjs-real-time-notifications/) - Pedro Alonso
- [Next.js (App Router) — Advanced Patterns for 2026](https://medium.com/@beenakumawat002/next-js-app-router-advanced-patterns-for-2026-server-actions-ppr-streaming-edge-first-b76b1b3dcac7) - Medium

#### FastAPI Streaming & SSE

- [Implementing Server-Sent Events (SSE) with FastAPI](https://mahdijafaridev.medium.com/implementing-server-sent-events-sse-with-fastapi-real-time-updates-made-simple-6492f8bfc154) - Mahdi Jafari
- [Streaming APIs for Beginners: Python, FastAPI, and Async Generators](https://python.plainenglish.io/streaming-apis-for-beginners-python-fastapi-and-async-generators-848b73a8fc06) - Python in Plain English
- [FastAPI Using Server-Sent Events (SSE) for Streaming Responses](https://clay-atlas.com/us/blog/2024/11/02/en-python-fastapi-server-sent-events-sse/) - Clay-Technology World
- [Server-Sent Events with Python FastAPI](https://medium.com/@nandagopal05/server-sent-events-with-python-fastapi-f1960e0c8e4b) - Nanda Gopal Pattanayak
- [sse-starlette](https://github.com/sysid/sse-starlette) - Production-ready SSE library

#### Integration Patterns

- [Connecting Next frontend to Fastapi backend](https://github.com/vercel/next.js/discussions/52660) - Next.js Discussion
- [Understanding next.config.js and FastAPI CORS Configuration](https://medium.com/@saveriomazza/understanding-next-config-js-and-fastapi-cors-configuration-fb654a4c555c) - Saverio Mazza
- [Mastering CORS: Configuring Cross-Origin Resource Sharing in FastAPI and Next.js](https://medium.com/@vaibhavtiwari.945/mastering-cors-configuring-cross-origin-resource-sharing-in-fastapi-and-next-js-28c61272084b) - Vaibhav Tiwari
- [Streaming APIs with FastAPI and Next.js - Part 1](https://sahansera.dev/streaming-apis-python-nextjs-part1/) - Sahan Serasinghe

#### FastAPI File Handling

- [Request Files - FastAPI](https://fastapi.tiangolo.com/tutorial/request-files/)
- [Custom Response - HTML, Stream, File, others](https://fastapi.tiangolo.com/advanced/custom-response/)
- [Building a File Upload and Download API with Python and FastAPI](https://medium.com/@chodvadiyasaurabh/building-a-file-upload-and-download-api-with-python-and-fastapi-3de94e4d1a35) - Saurabh Chodvadiya
- [File Uploads and Downloads in FastAPI: A Comprehensive Guide](https://plainenglish.io/blog/file-uploads-and-downloads-in-fastapi-a-comprehensive-guide)

#### FastAPI LLM Integration

- [Building Real-Time AI Apps with LangGraph, FastAPI & Streamlit](https://medium.com/@dharamai2024/building-real-time-ai-apps-with-langgraph-fastapi-streamlit-streaming-llm-responses-like-04d252d4d763) - Dharmendra Pratap Singh
- [Real-time OpenAI response streaming with FastAPI](https://sevalla.com/blog/real-time-openai-streaming-fastapi/)
- [Scalable Streaming of OpenAI Model Responses with FastAPI and asyncio](https://medium.com/@mayvic/scalable-streaming-of-openai-model-responses-with-fastapi-and-asyncio-714744b13dd) - Victor May
- [OpenAI Agents Streaming API](https://github.com/ahmad2b/openai-agents-streaming-api) - GitHub
- [Streaming Responses from LLM Using LangChain + FastAPI](https://stackademic.com/blog/streaming-responses-from-llm-using-langchain-fastapi-329f588d3b40) - Stackademic

#### State Management

- [How To Use Zustand With Next Js 15](https://www.dimasroger.com/blog/how-to-use-zustand-with-next-js-15) - Dimas Roger
- [State Management with Next.js App Router](https://www.pronextjs.dev/tutorials/state-management) - ProNextJS
- [Mastering State Management with Zustand in Next.js and React](https://dev.to/mrsupercraft/mastering-state-management-with-zustand-in-nextjs-and-react-1g26) - DEV Community
- [Setup with Next.js - Zustand](https://zustand.docs.pmnd.rs/guides/nextjs)
- [React State Management in 2025: What You Actually Need](https://www.developerway.com/posts/react-state-management-2025) - Developer Way

---

## Quick Start Checklist

### Backend (FastAPI)

1. **Install FastAPI and dependencies:**
   ```bash
   pip install fastapi uvicorn python-multipart fastapi-ai-sdk
   ```

2. **Create main.py with CORS:**
   ```python
   from fastapi import FastAPI
   from fastapi.middleware.cors import CORSMiddleware

   app = FastAPI()

   app.add_middleware(
       CORSMiddleware,
       allow_origins=["http://localhost:3000"],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )

   @app.get("/")
   async def root():
       return {"message": "FastAPI backend running"}
   ```

3. **Run development server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend (Next.js)

1. **Create Next.js app:**
   ```bash
   npx create-next-app@latest my-app
   cd my-app
   ```

2. **Install dependencies:**
   ```bash
   npm install @ai-sdk/react zustand
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Access app at:** `http://localhost:3000`

### Verify Integration

Test CORS and connectivity:

```bash
# Terminal 1: Start FastAPI
uvicorn main:app --reload --port 8000

# Terminal 2: Start Next.js
npm run dev

# Terminal 3: Test backend
curl http://localhost:8000/

# Test from Next.js frontend by calling the API in a component
```

---

## Common Issues & Solutions

### CORS Errors

**Problem:** `No 'Access-Control-Allow-Origin' header present`

**Solution:** Ensure FastAPI middleware is configured correctly:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Exact origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Hydration Errors in Next.js

**Problem:** "Text content does not match server-rendered HTML"

**Solution:** Use Zustand with proper hydration:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/store'

export function Component() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (!hydrated) return null

  return <div>...</div>
}
```

### SSE Connection Issues

**Problem:** SSE streams not working

**Solution:** Ensure correct headers:
```python
return StreamingResponse(
    generate(),
    media_type="text/event-stream",
    headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Important for nginx
    }
)
```

### File Upload Errors

**Problem:** "File upload fails with large files"

**Solution:** Stream in chunks:
```python
@app.post("/upload")
async def upload(file: UploadFile):
    chunk_size = 8192
    with open(f"./uploads/{file.filename}", "wb") as f:
        while chunk := await file.read(chunk_size):
            f.write(chunk)
    return {"status": "success"}
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-10*
