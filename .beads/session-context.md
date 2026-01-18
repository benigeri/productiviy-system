# Session Context: ps-58 Email Label Debug

## Last Updated: 2026-01-18 18:15 UTC

## Status Summary

| Item | Status |
|------|--------|
| ps-58 | IN PROGRESS - new label issues found |
| ps-60 | CLOSED - logging & error handling deployed |
| Deployed version | v31 |
| PR | #123 (open) |

---

## What Was Completed This Session

### ps-60: Logging & Error Handling (DONE)

**Deployed v31 with:**
1. **Correlation IDs** - All logs now have `cid=<8-char>` for request tracing
2. **Consistent log format** - All functions use `[functionName]` prefix
3. **Graceful Braintrust degradation** - Try/catch around import, webhook works even if classification fails
4. **Helper extraction** - `clearThreadWorkflowLabels()` reduces duplication
5. **Zod validation** - Payload structure validated before processing
6. **Better config logging** - Logs when Braintrust not configured

**Commits:**
- `66acd97` - Initial logging and error handling
- `abf63be` - Review improvements
- `82cd8ac` - Close ps-60 bead

---

## Previous Investigation (Reference)

### Issue 1: 500 Errors Causing Missed Classifications (RESOLVED)
- 11am EST emails missed due to 500 errors during cold start
- Root cause: Braintrust import crashing before logging
- Fix: Try/catch around Braintrust import (deployed v31)

### Issue 2: wf_respond Stuck on Sent Message (RESOLVED)
- Maria thread had stuck wf_respond on sent message
- Root cause: Webhook crashed before clearing labels
- Fix: Better error handling + logging (deployed v31)

---

## NEW ISSUES TO INVESTIGATE

*User found new label issues - document below:*

### Issue 3: [DESCRIBE NEW ISSUE HERE]

**Thread/Message IDs:**
- Thread:
- Message:

**Symptoms:**
-

**Observed behavior:**
-

**Expected behavior:**
-

---

## Useful Commands

### Query Recent Logs (with correlation IDs)
```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' /Users/benigeri/Projects/productiviy-system/.env | cut -d'=' -f2)
SQL="SELECT timestamp, event_message FROM function_logs WHERE event_message LIKE '%cid=%' ORDER BY timestamp DESC LIMIT 50"
curl -s "https://api.supabase.com/v1/projects/aadqqdsclktlyeuweqrv/analytics/endpoints/logs.all?iso_timestamp_start=$(date -u -v-2H '+%Y-%m-%dT%H:%M:%SZ')&iso_timestamp_end=$(date -u '+%Y-%m-%dT%H:%M:%SZ')&sql=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$SQL'''))")" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '.result'
```

### Filter by Correlation ID
```bash
SQL="SELECT timestamp, event_message FROM function_logs WHERE event_message LIKE '%cid=XXXXXXXX%' ORDER BY timestamp"
```

### Check Function Deployment
```bash
curl -s 'https://api.supabase.com/v1/projects/aadqqdsclktlyeuweqrv/functions/nylas-webhook' \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '{version, updated_at: (.updated_at/1000 | strftime("%Y-%m-%d %H:%M:%S UTC"))}'
```

### Get Thread Labels
```bash
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/threads/THREAD_ID" \
  -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '.data | {id, subject, folders}'
```

### Get Message Labels
```bash
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/messages/MSG_ID" \
  -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '.data | {id, subject, folders, from: .from[0].email}'
```

### Update Message Labels
```bash
curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/messages/MSG_ID" \
  -X PUT -H "Authorization: Bearer ${NYLAS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"folders": ["Label_xxx"]}'
```

## Label IDs Reference

| Label | ID |
|-------|-----|
| wf_respond | Label_5390221056707111040 |
| wf_drafted | Label_3309485003314594938 |
| wf_review | Label_8668817829415378097 |
| ai_tool | Label_7966796316876587226 |
| ai_calendar | Label_8735095166587479100 |
| ai_group_cc | Label_5834171559644994330 |
| NAI: Tool Notifications | Label_206 |

## Resume Instructions

After `/clear` or new session:
1. Run `bd prime` to load beads context
2. Run `bd show ps-58` for full issue details
3. Read this file for session context
4. Check logs with the commands above
5. Document new issues in "NEW ISSUES TO INVESTIGATE" section
