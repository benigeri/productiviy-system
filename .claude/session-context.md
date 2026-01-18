# Session Context - Email Label Debugging

## Current State (2026-01-18)

The nylas-webhook has:
- Correlation IDs for request tracing
- Detailed logging at each decision point
- Improved error logging that captures full Nylas API error body (just deployed)

## Active Investigation

### Superhuman "Done" → Label Removal
**Status**: Archive detection works, but getting 400 errors when clearing labels

**Findings from logs**:
1. Superhuman "Done" removes INBOX → triggers `message.updated`
2. Webhook detects archive (no INBOX) correctly
3. Tries to clear workflow labels from thread
4. **400 Bad Request** - need to see the full error now that logging is improved

**Example from logs**:
```
message 19bc8f2b0ce61d68: ["[Superhuman]/AI/Meeting","IMPORTANT","wf_review","CATEGORY_PERSONAL"]
→ Archive detected → 400 Bad Request
```

### ps-58: Emails going unlabeled
- TikTok emails not getting ai_* labels
- Need to trace classifier calls

### ps-59: Gmail quote handling
- Lower priority

## Debug Commands

```bash
# Check for 400 errors with full details (after improved logging deployed)
SQL="SELECT timestamp, event_message FROM function_logs WHERE event_message LIKE '%400%' ORDER BY timestamp DESC LIMIT 20"

# Check archive detection flow
SQL="SELECT timestamp, event_message FROM function_logs WHERE event_message LIKE '%cid=%' ORDER BY timestamp DESC LIMIT 50"
```
