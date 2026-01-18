# Session Context: ps-58 Email Label Debug

## Session Date: 2026-01-18

## Problem Investigated

User reported 2 emails around 11am EST didn't trigger classifier - no runs visible in logs.

## Key Findings

### Issue 1: 500 Errors Causing Missed Classifications (11am emails)

**Timeline:**
- 10:58am EST: 500 errors started, caused ~5 min gap in webhook processing
- 11:00am EST: TikTok email arrived (19bd1d601ecfaa54) - NO webhook activity
- 11:03am EST: Usage email arrived (19bd1d88775ea84b) - NO webhook activity
- 11:15am EST: Burst of queued webhooks hit, many crashed with 500s
- 11:20am EST: PR #119 merged, fixing the issue
- 11:25am EST: Function redeployed (version 27), 500s stopped

**Resolution:** Manually added `ai_tool` label to both emails via Nylas API.

### Issue 2: wf_respond Stuck on Sent Message (Maria thread)

**Thread:** 19bc6ec3913135c4 (Maria Biernat calendar decline)
**Problem message:** 19bc710a1e6c1180 - SENT message with stuck `wf_respond`

**Root cause chain:**
1. User sends reply email `19bd21dd9680c30a` at 17:18:50 UTC
2. `message.created` webhook fires for the sent email
3. **Webhook crashes (500 error)** before clearing workflow labels
4. Labels never cleared from thread
5. Later `message.updated` webhooks fire but DON'T clear labels from SENT messages (by design - line 174 checks `!isSent`)

**Evidence from logs:**
```
17:18:51.333 - Sent message processed, has wf_respond
17:18:51.447 - Archive detected for thread (triggered by received msg)
17:18:52.065 - 500 ERROR
17:18:54.891 - 500 ERROR
17:18:56.095 - Sent message STILL has wf_respond
17:18:56.850 - 500 ERROR
```

**Key insight:** No "Cleared workflow labels from X/Y" log appears after archive detection - the clearing is crashing.

**Resolution:** Manually removed `wf_respond` via Nylas API.

## Code Issues Identified

### 1. No Logging in processMessageCreated for Sent Messages

**File:** `supabase/functions/nylas-webhook/index.ts`
**Location:** Lines 347-386

The `processMessageCreated` function has NO console.log statements for sent message handling:
- No log when dedup triggers (line 369-371)
- No log when clearing starts
- No log for clearing results

Compare to `processMessageUpdate` which has detailed logging (lines 169, 177, 181, 191).

### 2. 500 Errors During Webhook Processing

Crashes happening before any logging. Likely causes:
- Braintrust dynamic import (`await import("npm:braintrust@2.0.2")`) race condition
- Cold start issues with concurrent webhooks
- Multiple webhooks hitting fresh instances simultaneously

### 3. Dedup Map Not Shared Across Instances

`recentlyProcessedThreads` Map (line 35) is in-memory and doesn't persist across serverless invocations. Each webhook might hit a fresh instance with empty Map.

## Files Changed This Session

1. **CLAUDE.md** - Added Supabase log query documentation
2. **.beads/issues.jsonl** - Closed ps-54, ps-56

## Beads Status

| Bead | Status | Notes |
|------|--------|-------|
| ps-54 | CLOSED | Vercel deployment fixes |
| ps-56 | CLOSED | PR #119 merged - workflow labels cleared from entire thread |
| ps-58 | This session | Investigation complete |
| ps-60 | OPEN (P1) | Add logging to processMessageCreated and fix 500 errors |

## Next Steps (ps-60)

### 1. Add Logging to processMessageCreated

```typescript
// After line 360 (isSent check)
console.log(`[processMessageCreated] messageId=${messageId} isSent=${isSent}`);

// After line 369-371 (dedup check)
if (wasRecentlyProcessed(message.thread_id)) {
  console.log(`[processMessageCreated] Skipping - thread ${message.thread_id} recently processed (dedup)`);
  return false;
}

console.log(`[processMessageCreated] Sent message - clearing workflow labels from thread ${message.thread_id}`);

// After line 383 (clearing results)
const cleared = results.filter(Boolean).length;
console.log(`[processMessageCreated] Cleared workflow labels from ${cleared}/${allMessages.length} messages`);
```

### 2. Investigate 500 Errors

Check if Braintrust dynamic import is causing issues:
```typescript
// Line 438-439 in production handler
const braintrustModule = await import("npm:braintrust@2.0.2");
const { invoke, initLogger } = braintrustModule;
```

Possible fixes:
- Move import outside request handler
- Add try/catch around import
- Add initialization status logging

### 3. Consider Resilience Improvements

- Add retry logic for label clearing failures
- Consider using external dedup (Redis/KV) instead of in-memory Map
- Add error boundary around Braintrust initialization

## Useful Commands

### Query Supabase Logs
```bash
source .env
SQL="SELECT timestamp, event_message FROM function_logs WHERE event_message LIKE '%pattern%' ORDER BY timestamp DESC LIMIT 50"
curl -s "https://api.supabase.com/v1/projects/aadqqdsclktlyeuweqrv/analytics/endpoints/logs.all?iso_timestamp_start=2026-01-18T16:00:00Z&iso_timestamp_end=2026-01-18T20:00:00Z&sql=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$SQL'''))")" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '.result'
```

### Check Function Deployment
```bash
curl -s 'https://api.supabase.com/v1/projects/aadqqdsclktlyeuweqrv/functions/nylas-webhook' \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '{updated_at: (.updated_at/1000 | strftime("%Y-%m-%d %H:%M:%S UTC")), version}'
```

### Update Message Labels via Nylas
```bash
# Get message
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/messages/{MSG_ID}" \
  -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '.data.folders'

# Update (don't include system labels like SENT, INBOX)
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/messages/{MSG_ID}" \
  -X PUT -H "Authorization: Bearer ${NYLAS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"folders": ["Label_xxx"]}'
```

## Label IDs Reference

| Label | ID |
|-------|-----|
| wf_respond | Label_5390221056707111040 |
| ai_tool | Label_7966796316876587226 |
| ai_calendar | Label_8735095166587479100 |
| ai_group_cc | Label_5834171559644994330 |
| NAI: Tool Notifications | Label_206 |
