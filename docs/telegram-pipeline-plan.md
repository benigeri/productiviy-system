# Telegram → Linear Triage Pipeline

## Goal
Send voice notes or text messages from phone via Telegram → automatically create Linear triage items.

---

## Development Workflow

### TDD Approach
1. **Write test first** - Define expected behavior before implementation
2. **Red** - Run test, confirm it fails
3. **Green** - Write minimal code to pass
4. **Refactor** - Clean up while keeping tests green

### Pre-commit Hooks (via lint-staged + husky)
```bash
# On every commit:
- deno fmt --check      # Format check
- deno lint             # Lint TypeScript
- deno test             # Run all tests
```

### Pull Request Workflow
All changes go through PRs for review - never commit directly to `main`.

1. **Create feature branch**: `git checkout -b feature/description`
2. **Make changes** following TDD process
3. **Push branch**: `git push -u origin feature/description`
4. **Create PR** with clear summary of changes
5. **User reviews** - can see diff, leave comments
6. **Merge** after approval

### Agent Workflow (Beads Process)
When working on any task:
1. **Create feature branch** from `main`
2. **Update todo to `in_progress`** before starting
3. **Write/update tests first** (TDD)
4. **Implement the feature**
5. **Run tests locally** - confirm passing
6. **Commit with descriptive message**
7. **Push and create PR** for review
8. **Update todo to `completed`** only after PR is merged

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

---

## Task Breakdown (Beads)

### Milestone 1 Tasks
1. [ ] Create Telegram bot via @BotFather, get token
2. [ ] Create new Supabase project
3. [ ] Get API keys: Deepgram + Anthropic
4. [ ] Initialize Supabase in repo
5. [ ] Write tests for `telegram.ts`, then implement
6. [ ] Write tests for `deepgram.ts`, then implement
7. [ ] Write tests for `claude.ts`, then implement
8. [ ] Write tests for `linear.ts`, then implement
9. [ ] Write integration tests for `index.ts`, then implement
10. [ ] Deploy function + set Telegram webhook
11. [ ] Add secrets to Supabase
12. [ ] Test end-to-end: text + voice → Linear triage
13. [ ] Create iOS Shortcut to open bot chat

### Milestone 2 Tasks
14. [ ] Create `message_mappings` table in Supabase
15. [ ] Write tests for reply handling
16. [ ] Update Edge Function to handle replies → Linear comments
17. [ ] Test end-to-end: reply → comment on issue
