# Session Context - Email Label Debugging

## Current State (2026-01-18)

The nylas-webhook has:
- Correlation IDs for request tracing
- Detailed logging at each decision point
- Improved error logging that captures full Nylas API error body (just deployed)

## Active Investigation

### Superhuman "Done" → Label Removal
**Status**: FIXED ✓

**Root cause**: When clearing workflow labels from sent messages, we were including
SENT in the folder update request. Gmail doesn't allow setting read-only system labels.

**Fix**: Filter out read-only system labels (SENT, DRAFT, TRASH, SPAM) from folder
update requests. Gmail maintains these automatically.

**Deployed**: fdc53ed

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
