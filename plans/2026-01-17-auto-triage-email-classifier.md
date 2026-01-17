# Auto-Triage Email Classifier - Implementation Plan

**Bead**: ps-49
**Date**: 2026-01-17
**Status**: Planning (Revised after review)

---

## Overview

Build an auto-triage system that classifies incoming emails using AI. Every new email triggers classification via Nylas webhook, applies `ai_*` labels, and supports thread reclassification when new messages arrive.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Classifier location | **Extend existing `nylas-webhook`** | Avoids race condition, single handler for all email events |
| Label storage | Gmail labels via Nylas | No DB needed, Braintrust logs for history |
| Trigger | `message.created` webhook | Real-time classification |
| AI labels | `ai_*` prefix, NOT mutually exclusive | One email can have multiple classifications |
| Workflow labels | `workflow_*` prefix, mutually exclusive | Clear separation from AI labels |
| Braintrust | Project: `2026_01 Email Flow` | Same project as email drafts |
| Prompt slug | `email-classifier-v1` | Consistent naming |
| Rate limits | 20 req/s (Nylas), 600 req/min (Gmail) | No queuing needed for typical volume |
| Labeling scope | **Last 5 messages in thread** | Caps API calls, avoids N+1 problem |

---

## Label System

### Workflow Labels (mutually exclusive)
```
workflow_to_respond_paul  - Needs response (highest priority)
workflow_to_read_paul     - Reading list (medium priority)
workflow_drafted          - Draft saved (lowest priority)
```

### AI Labels (NOT mutually exclusive)
```
ai_*                      - Classifier-assigned labels
                          - Labels TBD (collaborative step)
                          - One email can have multiple ai_* labels
```

### Reclassification Logic
1. On new message in thread → reclassify entire thread
2. Remove ALL existing `ai_*` labels from last 5 messages
3. Apply new `ai_*` labels to last 5 messages
4. Idempotent: same input → same output

---

## Critical Implementation Notes (From Review)

### 1. Label ID vs Name Translation (CRITICAL)
Nylas returns folder IDs like `Label_456`, NOT names like `ai_newsletter`.

**MUST use existing `buildFolderMaps()` pattern:**
```typescript
// Fetch folders and build lookup maps
const folders = await deps.getFolders();
const { idToName, nameToId } = buildFolderMaps(folders);

// Convert message folder IDs to names for filtering
const folderNames = message.folders.map(id => idToName.get(id) ?? id);

// Filter AI labels by NAME (after translation)
const aiLabels = folderNames.filter(name => name.startsWith('ai_'));

// When updating, convert names back to IDs
const labelsToAdd = newAILabels.map(name => nameToId.get(name)).filter(Boolean);
```

### 2. Sent Email Detection (CRITICAL)
Use folder check, NOT email address matching:
```typescript
// CORRECT - matches existing pattern
const isSent = folderNames.includes("SENT");
if (isSent) return; // Skip sent messages

// WRONG - don't do this
// function isSentEmail(message, userEmail) { ... }
```

### 3. Error Handling for Braintrust (HIGH)
```typescript
async function classifyWithRetry(input: ClassifierInput, maxRetries = 3): Promise<ClassifierResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await invoke({
        projectName: BRAINTRUST_PROJECT_NAME,
        slug: CLASSIFIER_SLUG,
        input: { user_input: JSON.stringify(input) },
      });
      return validateClassifierOutput(result);
    } catch (error) {
      if (attempt === maxRetries) {
        console.error('Classification failed after retries:', error);
        return { labels: [], reason: 'Classification failed' }; // Skip labeling
      }
      await sleep(Math.pow(2, attempt) * 100); // 100ms, 200ms, 400ms
    }
  }
  return { labels: [], reason: 'Classification failed' };
}
```

### 4. Validate Classifier Output (HIGH)
```typescript
function validateClassifierOutput(result: unknown): ClassifierResult {
  // Ensure labels is array of strings starting with ai_
  if (!result || typeof result !== 'object') {
    return { labels: [], reason: 'Invalid response' };
  }

  const { labels, reason } = result as Record<string, unknown>;

  if (!Array.isArray(labels)) {
    return { labels: [], reason: 'Invalid labels array' };
  }

  const validLabels = labels.filter(
    (l): l is string => typeof l === 'string' && l.startsWith('ai_')
  );

  return {
    labels: validLabels,
    reason: typeof reason === 'string' ? reason : 'No reason provided',
  };
}
```

---

## Future Beads (Create Before Starting)

> **ACTION**: Create these beads at the start of implementation

1. **Track human label overrides for AI training**
   - When user manually removes/adds AI labels in Gmail
   - Use to improve classifier accuracy over time
   - Lower priority, create as P3 feature bead

---

## Implementation Phases

### Phase 0: Prerequisites & Setup

#### 0.1 Create Future Beads
- [ ] Create bead: "Track human label overrides for AI training" (P3 feature)

#### 0.2 Rename Workflow Labels
> **Why**: Clear separation between workflow and AI labels

**Current → New**:
| Current | New |
|---------|-----|
| `to-respond-paul` | `workflow_to_respond_paul` |
| `to-read-paul` | `workflow_to_read_paul` |
| `drafted` | `workflow_drafted` |

**Steps**:
1. Create new labels in Gmail (manually or via script)
2. Update `.env` files with new label IDs
3. Update `WORKFLOW_LABELS` constant in `supabase/functions/_shared/lib/nylas-types.ts`
4. Update all references in codebase:
   - `email-workflow/lib/gmail-labels.ts`
   - `supabase/functions/nylas-webhook/index.ts`
   - `supabase/functions/_shared/lib/workflow-labels.ts`
   - Tests
5. Migrate existing emails (script to relabel)
6. Delete old labels from Gmail (after verification)

#### 0.3 Update Braintrust Plugin
- [ ] Ensure latest Braintrust plugin installed
- [ ] Verify `invoke()` function works with project `2026_01 Email Flow`
- [ ] Test connection with project ID: `183dc023-466f-4dd9-8a33-ccfdf798a0e5`

---

### Phase 1: Design AI Labels (Collaborative)
> **This is a collaborative step** - we'll work together to define the label taxonomy

#### 1.1 Define Label Categories
Work together to define what labels the classifier should use:
- Review current email patterns
- Identify key categories (e.g., newsletter, urgent, FYI, action-required, etc.)
- Decide on naming convention within `ai_*` prefix
- Document label definitions and examples

#### 1.2 Create Classifier Prompt
> **Prompt lives in Braintrust** - uses `invoke()` function

**Braintrust Configuration**:
- Project: `2026_01 Email Flow`
- Project ID: `183dc023-466f-4dd9-8a33-ccfdf798a0e5`
- Slug: `email-classifier-v1`
- Model: TBD (likely Claude Sonnet)

**Prompt Structure**:
```
SYSTEM MESSAGE:
- Full context about classification task
- References XML variables by name
- Label definitions and examples
- Instructions to return labels + one-line reason

USER MESSAGE:
<subject>{{subject}}</subject>
<from>{{from}}</from>
<to>{{to}}</to>
<cc>{{cc}}</cc>
<bcc>{{bcc}}</bcc>
<thread_messages>
{{#each messages}}
<message>
  <from>{{this.from}}</from>
  <date>{{this.date}}</date>
  <body>{{this.body}}</body>
</message>
{{/each}}
</thread_messages>
```

**Output Schema**:
```typescript
{
  labels: string[],    // Array of ai_* labels to apply
  reason: string       // One-line explanation (for Braintrust logs only)
}
```

#### 1.3 Create Labels in Gmail
- Create each `ai_*` label in Gmail
- Document label IDs for reference
- Store label name → ID mapping (for `buildFolderMaps` compatibility)

---

### Phase 2: Extend `nylas-webhook` with Classification

> **KEY DECISION**: Add classification to existing webhook, NOT a separate function

#### 2.1 Update `nylas-webhook` Structure
**Location**: `supabase/functions/nylas-webhook/`

**New Structure**:
```
supabase/functions/nylas-webhook/
├── index.ts                    # Main handler (route by event type)
├── handlers/
│   ├── workflow.ts             # Existing workflow label logic (extract from index.ts)
│   └── classifier.ts           # NEW: classification logic
├── lib/
│   └── ai-labels.ts            # Inline utilities (or just inline in classifier.ts)
└── index.test.ts               # Updated tests
```

**Routing Logic in index.ts**:
```typescript
async function handleWebhook(payload: NylasWebhookPayload, deps: WebhookDeps) {
  const { type, data } = payload;

  if (type === "message.created") {
    // Check if sent email
    const message = await deps.getMessage(data.object.id);
    const { idToName } = buildFolderMaps(await deps.getFolders());
    const folderNames = message.folders.map(id => idToName.get(id) ?? id);

    if (folderNames.includes("SENT")) {
      // Sent email - run workflow logic (clear labels from thread)
      await handleSentMessage(message, deps);
    } else {
      // Received email - run classification
      await handleClassification(message, deps);
    }
  } else if (type === "message.updated") {
    // Existing workflow logic
    await handleMessageUpdated(data.object.id, deps);
  }
}
```

#### 2.2 Classification Handler
**File**: `supabase/functions/nylas-webhook/handlers/classifier.ts`

**Flow**:
```
1. Receive message from webhook handler
2. Fetch thread via Nylas
3. Fetch clean message content (last 10 messages for classification context)
4. Build classifier input with Nylas clean API
5. Call Braintrust invoke() with email-classifier-v1 (with retries)
6. Validate response (labels array, ai_* prefix)
7. Get last 5 messages in thread for labeling
8. For each message:
   a. Fetch current folders
   b. Translate IDs to names
   c. Remove all ai_* labels
   d. Add new ai_* labels
   e. Translate names back to IDs
   f. Update message folders
9. Log result to Braintrust for feedback
```

**Key Code**:
```typescript
export async function handleClassification(
  message: NylasMessage,
  deps: ClassifierDeps
): Promise<void> {
  // 1. Fetch thread
  const thread = await deps.getThread(message.thread_id);

  // 2. Get folder maps for ID <-> name translation
  const folders = await deps.getFolders();
  const { idToName, nameToId } = buildFolderMaps(folders);

  // 3. Fetch clean content for last 10 messages (classification context)
  const messageIds = thread.message_ids.slice(-10);
  const cleanContent = await deps.getCleanMessages(messageIds);

  // 4. Build classifier input
  const input = buildClassifierInput(thread, cleanContent);

  // 5. Classify with retries
  const result = await classifyWithRetry(input, deps);

  // 6. Skip if no labels
  if (result.labels.length === 0) {
    console.log('No labels to apply, skipping');
    return;
  }

  // 7. Apply labels to last 5 messages only
  const messagesToLabel = thread.message_ids.slice(-5);

  for (const msgId of messagesToLabel) {
    await updateMessageAILabels(msgId, result.labels, { idToName, nameToId }, deps);
  }
}

async function updateMessageAILabels(
  messageId: string,
  newLabels: string[],
  maps: { idToName: Map<string, string>; nameToId: Map<string, string> },
  deps: ClassifierDeps
): Promise<void> {
  const message = await deps.getMessage(messageId);

  // Translate current folder IDs to names
  const currentNames = message.folders.map(id => maps.idToName.get(id) ?? id);

  // Remove all ai_* labels, keep everything else
  const withoutAI = currentNames.filter(name => !name.startsWith('ai_'));

  // Add new AI labels
  const finalNames = [...withoutAI, ...newLabels];

  // Translate back to IDs
  const finalIds = finalNames
    .map(name => maps.nameToId.get(name) ?? name)
    .filter(Boolean);

  // Update if changed
  if (JSON.stringify(message.folders.sort()) !== JSON.stringify(finalIds.sort())) {
    await deps.updateMessageFolders(messageId, finalIds);
  }
}
```

#### 2.3 Nylas Clean API Call
**Important**: Use correct parameters per CLAUDE.md guidelines:
```typescript
async function getCleanMessages(messageIds: string[]): Promise<CleanedMessage[]> {
  const response = await fetch(
    `https://api.us.nylas.com/v3/grants/${grantId}/messages/clean`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message_id: messageIds,
        ignore_images: false,  // IMPORTANT: Don't ignore images
        html_as_markdown: true,
      }),
    }
  );
  return response.json();
}
```

#### 2.4 Tests
- Unit tests for label ID/name translation
- Unit tests for classifier output validation
- Integration tests for classification flow
- Test reclassification (remove old ai_* labels, apply new)
- Test skip sent emails (folder-based check)
- Test Braintrust retry logic
- Test thread with >5 messages (only last 5 labeled)

---

### Phase 3: Superhuman Configuration (Manual)
> **Manual step** - configure views in Superhuman based on AI labels

**Setup workflow**:
1. Create split views for each `ai_*` label
2. Set up workflow: AI labels inbox → review → workflow labels
3. Document the Superhuman configuration for reference

**Gmail link format** (for manual testing):
```
https://mail.google.com/mail/u/0/#label/{encodeURIComponent(labelName)}
```

---

### Phase 4: Testing & Verification

#### 4.1 End-to-End Testing
- [ ] Send test email → verify classification webhook fires
- [ ] Check Braintrust logs for classification result
- [ ] Verify `ai_*` labels applied in Gmail (last 5 messages)
- [ ] Test reclassification on thread reply (old labels removed, new applied)
- [ ] Verify Gmail label links work

#### 4.2 Edge Cases
- [ ] Thread with many messages (>10) - uses last 10 for context, last 5 for labeling
- [ ] Email with no body (calendar invite, etc.)
- [ ] Reclassification removes old labels correctly
- [ ] Sent emails are skipped (folder check)
- [ ] Braintrust timeout/failure - graceful skip
- [ ] Invalid classifier output - graceful skip
- [ ] Label that doesn't exist in Gmail - skip that label

---

## File Changes Summary

### New Files
```
supabase/functions/nylas-webhook/handlers/
├── workflow.ts              # Extracted from index.ts
└── classifier.ts            # New classification logic
```

### Modified Files
```
supabase/functions/nylas-webhook/index.ts         # Add routing, import handlers
supabase/functions/nylas-webhook/index.test.ts    # Add classification tests
supabase/functions/_shared/lib/nylas-types.ts     # Rename workflow labels
supabase/functions/_shared/lib/nylas.ts           # Add getCleanMessages if needed
supabase/functions/_shared/lib/workflow-labels.ts # Update label constants
email-workflow/lib/gmail-labels.ts                # Update label references
.env.example                                       # Document env vars
```

---

## Environment Variables

### Existing (update values for renamed labels)
```
GMAIL_LABEL_TO_RESPOND_PAUL=<new workflow_to_respond_paul ID>
GMAIL_LABEL_TO_READ_PAUL=<new workflow_to_read_paul ID>
GMAIL_LABEL_DRAFTED=<new workflow_drafted ID>
```

### Existing (verify set correctly)
```
NYLAS_WEBHOOK_SECRET=<existing webhook secret - reuse>
BRAINTRUST_PROJECT_NAME=2026_01 Email Flow
BRAINTRUST_API_KEY=<your key>
```

### New
```
BRAINTRUST_CLASSIFIER_SLUG=email-classifier-v1
```

---

## Success Criteria

- [ ] New emails automatically get `ai_*` labels
- [ ] Thread reclassification works (new message → fresh labels on last 5 messages)
- [ ] Gmail label links work (URL encoded)
- [ ] Braintrust logs show classification results for feedback
- [ ] Workflow labels renamed and working
- [ ] Sent emails are NOT classified
- [ ] Classification failures are graceful (skip, don't crash)
- [ ] All tests pass

---

## Open Questions / Notes

1. **Label list**: To be defined collaboratively in Phase 1
2. **Prompt tuning**: Iterative process via Braintrust feedback
3. **Human override tracking**: Future bead (P3)
