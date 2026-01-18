# Session Context: ps-56 Workflow Labels

## Date: 2026-01-18

## Problem

When saving a draft on a thread with `wf_review`, the thread ends up with `["wf_review", "wf_drafted"]`. The webhook's priority-based dedup incorrectly keeps `wf_review` (higher priority) when we want `wf_drafted`.

**Root cause:** Draft save API only removes `wf_respond`, not all workflow labels.

## Decision from Previous Session Reviews

Three reviewers (DHH, Kieran, Simplification) all concluded: **Don't add a database. Fix the algorithm.**

The atomic label update approach is the right solution:
- Draft save should remove ALL workflow labels, not just `wf_respond`
- Archive/send already clear all workflow labels (implemented)
- Priority dedup is acceptable for manual label conflicts

## Plan: Fix Draft Save + Clean Up Workflow Labels

### Changes

1. **Remove `triage` from PRIORITY_ORDER** (unused, cleanup)
   - File: `supabase/functions/_shared/lib/nylas-types.ts`

2. **Add `getLabelReview()` to gmail-labels.ts**
   - File: `email-workflow/lib/gmail-labels.ts`

3. **Update draft save to remove ALL workflow labels**
   - File: `email-workflow/app/api/drafts/save/route.ts`
   - Change: `removeLabels: [getLabelRespond(), getLabelReview()]`

### Environment Variable Needed

```
GMAIL_LABEL_REVIEW=Label_XXX
```

To find: `curl -s "https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/folders" -H "Authorization: Bearer ${NYLAS_API_KEY}" | jq '.data[] | select(.name == "wf_review") | .id'`

### What's Already Working

- Archive clears all workflow labels from thread ✓
- Send clears all workflow labels from thread ✓
- Priority dedup handles manual conflicts ✓

## Key Learnings

1. Gmail labels ARE your state - don't add a database to track what's already there
2. Make label updates atomic (remove ALL workflow labels, add new one) to avoid race conditions
3. Priority-based dedup is acceptable for human error (manual label conflicts)
