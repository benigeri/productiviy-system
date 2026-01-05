# Telegram → Linear Triage Pipeline

## Goal
Send voice notes or text messages from phone via Telegram → automatically create Linear triage items.

---

## Milestone 1: Core Pipeline (ship first)

### Architecture
```
Phone → Telegram Bot → Webhook → Supabase Edge Function → Linear API
                                        ↓
                    Deepgram (voice) → Claude (cleanup title/description)
```

### File Structure
```
/Users/benigeri/Projects/productiviy-system/
├── linear_triage.py                    # Existing: view triage
├── supabase/
│   └── functions/
│       └── telegram-webhook/
│           ├── index.ts                # Main handler
│           ├── index.test.ts           # Handler tests
│           ├── lib/
│           │   ├── telegram.ts         # Telegram API helpers
│           │   ├── telegram.test.ts
│           │   ├── deepgram.ts         # Voice transcription
│           │   ├── deepgram.test.ts
│           │   ├── claude.ts           # Title/desc cleanup
│           │   ├── claude.test.ts
│           │   ├── linear.ts           # Linear API client
│           │   └── linear.test.ts
│           └── deno.json               # Deno config
├── docs/
│   └── telegram-pipeline-plan.md       # This plan
├── requirements.txt
└── .env
```

### Components & Tests

#### 1. `telegram.ts` - Telegram API helpers
```typescript
// Functions to test:
- parseWebhookUpdate(body) → { type: 'text' | 'voice', content, messageId }
- getFileUrl(fileId) → string
- validateWebhookSignature(headers, body) → boolean
```

#### 2. `deepgram.ts` - Voice transcription
```typescript
// Functions to test:
- transcribeAudio(audioUrl) → string
- handles errors gracefully (timeout, invalid audio)
```

#### 3. `claude.ts` - Title/description cleanup
```typescript
// Functions to test:
- cleanupContent(rawText) → { title: string, description: string }
- handles edge cases (empty, very long, special chars)
```

#### 4. `linear.ts` - Linear API client
```typescript
// Functions to test:
- createTriageIssue(title, description) → { id, identifier }
- uses correct team (BEN)
```

#### 5. `index.ts` - Main handler
```typescript
// Integration tests:
- text message → creates Linear issue
- voice message → transcribes → creates Linear issue
- returns 200 OK to Telegram
- handles errors without crashing
```

### Environment Variables (Supabase secrets)
- `TELEGRAM_BOT_TOKEN` - from BotFather
- `LINEAR_API_KEY` - existing key
- `DEEPGRAM_API_KEY` - for voice transcription
- `ANTHROPIC_API_KEY` - for Claude title/description cleanup

### Setup Steps
1. Create Telegram bot via @BotFather, get token
2. Create Supabase project
3. Initialize Supabase in repo: `supabase init`
4. Create edge function: `supabase functions new telegram-webhook`
5. Write tests first, then implement
6. Deploy: `supabase functions deploy telegram-webhook`
7. Set webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTION_URL>`
8. Add secrets: `supabase secrets set TELEGRAM_BOT_TOKEN=xxx ...`
9. Create iOS Shortcut to open bot chat

### iOS Shortcut
- URL: `tg://resolve?domain=BOT_USERNAME`
- Create in Shortcuts app → "Open URLs" action
- Add to Home Screen for one-tap access

---

## Milestone 2: Reply Follow-ups (later)

### Goal
Reply to a Telegram message → adds a comment to the existing Linear issue.

### Requirements
- Supabase table: `message_mappings (telegram_msg_id, linear_issue_id, created_at)`
- On new issue creation: store the mapping
- On reply: look up parent message → find Linear issue → add comment

### Additional Tests
```typescript
// linear.ts additions:
- addComment(issueId, comment) → { id }

// index.ts additions:
- reply to existing message → adds comment (not new issue)
- reply to unknown message → creates new issue (fallback)
```

### Not blocking Milestone 1 - ship core first.
