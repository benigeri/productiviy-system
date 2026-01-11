---
status: pending
priority: p1
issue_id: "005"
tags: [code-review, agent-native, architecture]
dependencies: []
---

# Add Agent-Native Conversation API

## Problem Statement

**Critical agent-native architecture violation**: Conversation state is stored exclusively in browser localStorage, making it completely inaccessible to agents. This violates the core principle that "agents and users must work in the same data space."

**Why it matters**:
- Users iterate on drafts in web UI, building conversation history
- User switches to agent workflow (CLI)
- Agent has NO IDEA previous drafts exist
- Agent generates from scratch, losing all context
- Multi-turn conversations are broken between modalities
- Users can do things agents cannot (view history, manage state)

## Findings

**From Agent-Native Review:**
- Capability parity score: 1/7 (14%) - FAILING
- 6 out of 7 capabilities are agent-inaccessible
- Web UI and CLI operate in isolated data spaces
- No shared workspace between modalities

**Current Architecture (Broken):**
```
Web UI → localStorage → ISOLATED
CLI    → /tmp/*.json → ISOLATED
```

**Required Architecture:**
```
Web UI  ↘
          → Shared API/DB → Conversation State
CLI     ↗
```

**Missing Capabilities:**
- Agents cannot view conversation history
- Agents cannot add messages to conversations
- Agents cannot update drafts
- Agents cannot clear conversations
- Agents cannot access context from web iterations

## Proposed Solutions

### Solution 1: File-Based Shared Storage (Recommended)
**Pros:**
- Simple to implement
- No database required
- Accessible from both web and CLI
- Atomic file operations
- Easy to backup/restore
- Follows existing patterns in the project

**Cons:**
- File I/O overhead
- Not suitable for multi-user scenarios
- Requires file system access

**Effort:** Medium (3-4 hours)
**Risk:** Low

**Implementation:**
```typescript
// email-workflow/lib/conversation-storage.ts
const STORAGE_DIR = '/Users/benigeri/Projects/productiviy-system/email-workflow/.conversations';

export function getConversation(threadId: string): Conversation | null {
  const filePath = `${STORAGE_DIR}/${threadId}.json`;

  try {
    if (!fs.existsSync(filePath)) return null;

    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load conversation for ${threadId}:`, error);
    return null;
  }
}

export function saveConversation(threadId: string, conversation: Conversation): void {
  const filePath = `${STORAGE_DIR}/${threadId}.json`;

  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));
  } catch (error) {
    console.error(`Failed to save conversation for ${threadId}:`, error);
    throw error;
  }
}
```

**API Endpoints:**
```typescript
// email-workflow/app/api/conversations/[threadId]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  const conversation = getConversation(params.threadId);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(conversation);
}

export async function POST(request: Request, { params }: { params: { threadId: string } }) {
  const { role, content } = await request.json();
  const conversation = addMessage(params.threadId, role, content);
  return NextResponse.json(conversation);
}

export async function DELETE(request: Request, { params }: { params: { threadId: string } }) {
  clearConversation(params.threadId);
  return NextResponse.json({ success: true });
}
```

**CLI Integration:**
```python
# draft-email.py
import requests

def get_conversation_context(thread_id: str) -> dict:
    """Fetch conversation history from API"""
    response = requests.get(f'http://localhost:3000/api/conversations/{thread_id}')
    if response.status_code == 404:
        return {'messages': [], 'currentDraft': ''}
    return response.json()

def save_draft_to_conversation(thread_id: str, draft: str):
    """Save generated draft to conversation"""
    requests.post(
        f'http://localhost:3000/api/conversations/{thread_id}',
        json={'role': 'assistant', 'content': draft}
    )
```

### Solution 2: SQLite Database
**Pros:**
- More robust than file-based
- Better concurrency handling
- Query capabilities
- ACID transactions

**Cons:**
- Requires SQLite setup
- More complex
- Overkill for current needs

**Effort:** High (6-8 hours)
**Risk:** Medium

### Solution 3: Keep localStorage + Add Export/Import
**Pros:**
- Minimal changes to existing code
- Quick fix

**Cons:**
- Manual process (poor UX)
- Doesn't solve agent-native problem
- Still isolated workspaces

**Effort:** Low (1 hour)
**Risk:** High (doesn't fix root cause)

## Recommended Action

**Use Solution 1 (File-Based Shared Storage)**. This aligns with existing project patterns (email-workflow already uses file system for temp files) and provides immediate agent parity without over-engineering.

## Technical Details

**Implementation Plan:**

**Phase 1: Add API Endpoints**
1. Create conversation storage directory: `.conversations/`
2. Implement file-based get/save/clear functions
3. Add API routes: GET/POST/DELETE `/api/conversations/[threadId]`
4. Test API with curl

**Phase 2: Update Web UI**
1. Replace localStorage calls with API calls
2. Update useConversation hook to use fetch
3. Handle async operations (loading states)
4. Maintain same UX

**Phase 3: Update CLI Tools**
1. Add conversation API client to draft-email.py
2. Fetch conversation context before generating
3. Include conversation history in LLM prompt
4. Save generated drafts to conversation

**Phase 4: Documentation**
1. Update .claude/skills/email-respond/SKILL.md
2. Document conversation API for agents
3. Add usage examples

**Affected Files:**
- New: `email-workflow/lib/conversation-storage.ts` (file-based storage)
- New: `email-workflow/app/api/conversations/[threadId]/route.ts` (API)
- Update: `email-workflow/hooks/useConversation.ts` (use API not localStorage)
- Update: `draft-email.py` (add conversation context)

## Acceptance Criteria

- [ ] File-based storage implemented in `.conversations/` directory
- [ ] API endpoints created: GET/POST/DELETE `/api/conversations/[threadId]`
- [ ] Web UI uses API instead of localStorage
- [ ] CLI tools can fetch conversation history
- [ ] CLI tools save drafts to conversation
- [ ] Conversation context included in LLM prompts
- [ ] Tests verify file operations work correctly
- [ ] Tests verify API endpoints work correctly
- [ ] Multi-turn conversations work across web and CLI
- [ ] Agent capability parity: 7/7 (100%)

**Test Scenario:**
```bash
# 1. User generates draft in web UI
open http://localhost:3000/inbox?thread=ABC123
# Enter instructions: "Write a polite reply"
# Click "Generate Draft" → draft v1 created

# 2. Agent continues iteration via CLI
python3 draft-email.py ABC123 --dictation "Make it shorter"
# Agent should:
# - Fetch conversation history (draft v1, user instructions)
# - Include context in prompt
# - Generate draft v2
# - Save to conversation

# 3. User returns to web UI
open http://localhost:3000/inbox?thread=ABC123
# User should see full conversation history:
# - "Write a polite reply"
# - Draft v1
# - "Make it shorter"
# - Draft v2
```

## Work Log

**2026-01-10**: Issue identified in PR #60 agent-native architecture review

## Resources

- **PR #60**: https://github.com/benigeri/productiviy-system/pull/60
- **Agent-Native Principles**: Agents must have same capabilities as users
- **File**: `/Users/benigeri/Projects/productiviy-system/email-workflow/lib/conversation.ts`
- **CLI Tool**: `/Users/benigeri/Projects/productiviy-system/draft-email.py`
