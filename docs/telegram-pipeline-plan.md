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

## Components

### 1. Telegram Bot
- Create bot via @BotFather
- Get bot token
- Set webhook URL to Supabase Edge Function

### 2. Supabase Edge Function (`telegram-webhook`)
- Receives Telegram webhook POST requests
- Handles two message types:
  - **Text**: Extract text → create Linear issue
  - **Voice**: Download file → Whisper API transcription → create Linear issue
- Returns 200 OK to Telegram

### 3. iOS Shortcut
- Opens Telegram directly to bot chat: `tg://resolve?domain=BOT_USERNAME`
- Add to home screen for quick access

## File Structure
```
/Users/benigeri/Projects/productiviy-system/
├── linear_triage.py              # Existing: view triage
├── supabase/
│   └── functions/
│       └── telegram-webhook/
│           └── index.ts          # Edge function
├── requirements.txt
└── .env
```

### Environment Variables (Supabase secrets)
- `TELEGRAM_BOT_TOKEN` - from BotFather
- `LINEAR_API_KEY` - existing key
- `DEEPGRAM_API_KEY` - for voice transcription
- `ANTHROPIC_API_KEY` - for Claude title/description cleanup

## Setup Steps
1. Create Telegram bot via @BotFather, get token
2. Create Supabase project (or use existing)
3. Deploy edge function
4. Set webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<SUPABASE_FUNCTION_URL>`
5. Add secrets to Supabase
6. Create iOS Shortcut to open bot chat

### Edge Function Logic (pseudocode)
```typescript
// Handle incoming Telegram update
let content: string

if (message.text) {
  content = message.text
} else if (message.voice) {
  const audioUrl = await getTelegramFileUrl(message.voice.file_id)
  content = await deepgramTranscribe(audioUrl)
}

// Claude cleans up into title + description
const { title, description } = await claudeCleanup(content)
await createLinearIssue(title, description)

return new Response("ok", { status: 200 })
```

### iOS Shortcut
- URL: `tg://resolve?domain=BOT_USERNAME`
- Create in Shortcuts app → "Open URLs" action
- Add to Home Screen for one-tap access

---

## Milestone 2: Reply Follow-ups (later)

### Goal
Reply to a Telegram message → adds a comment to the existing Linear issue.

### Requirements
- Supabase table: `message_mappings (telegram_msg_id, linear_issue_id)`
- On new issue creation: store the mapping
- On reply: look up parent message → find Linear issue → add comment

### Not blocking Milestone 1 - ship core first.
