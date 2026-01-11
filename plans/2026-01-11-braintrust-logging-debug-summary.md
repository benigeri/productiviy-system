# Braintrust Logging Debug Summary
**Date:** 2026-01-11
**Issue:** Braintrust traces not appearing in dashboard after PR #77 merge

## Root Causes Found

### 1. Vercel Deployment Failures (PRIMARY ISSUE)
**Problem:** Most recent automatic deployments from GitHub were failing with "Error" status, completing in ~5 seconds (build failures).

**Evidence:**
- `vercel list` showed 19 of 20 recent deployments with "● Error" status
- Only 1 deployment from 25 minutes ago showed "● Ready"
- Latest production deployment (10m ago): "● Error"
- Deployment duration: 5-6 seconds (normal is ~16-28 seconds)

**Root Cause:** Unknown GitHub webhook/integration issue causing builds to fail immediately.

**Resolution:** Manual deployment succeeded:
```bash
vercel deploy --prod --yes
```
- New URL: https://email-workflow-njahiszwc-paul-archivecoms-projects.vercel.app
- Aliased to: https://email-workflow-phi.vercel.app
- Build time: 16 seconds (normal)
- Status: ● Ready

### 2. Code Was Correct
**PR #77 Changes:** Added `initLogger()` correctly in `app/api/drafts/route.ts`

```typescript
// Lines 3 & 7-11 (added in PR #77)
import { invoke, wrapTraced, initLogger } from 'braintrust';

const logger = initLogger({
  projectName: process.env.BRAINTRUST_PROJECT_NAME!,
  apiKey: process.env.BRAINTRUST_API_KEY,
  asyncFlush: false, // CRITICAL: Prevents log loss in serverless
});
```

**Verification:**
- Code is in main branch (commit ca8c5d8)
- Local build succeeds
- Environment variables confirmed set in Vercel

## Testing Results

### Production API Test
**Script:** `scripts/test-production-api.ts`

**Results:**
```
Status: 200 OK
Duration: 3555ms
✓ Success! Valid response structure
To: alice@example.com
CC: bob@example.com
Body: "Perfect! Thursday at 2pm works for me..."
```

✅ **API endpoint works correctly**
✅ **Draft generation succeeds**
✅ **CC detection works**
✅ **Response validation passes**

## Current Status

### ✅ Completed
1. PR #77 code merged to main
2. Fresh deployment to production successful
3. API endpoint tested and working
4. Environment variables verified in Vercel

### ⚠️ Pending Verification
**User must check Braintrust dashboard to confirm traces are appearing:**

**Dashboard URL:** https://www.braintrust.dev/app/paul-9461/p/Email_Workflow/logs

**What to look for:**
1. New trace from test (timestamp ~2026-01-11 09:06:xx)
2. Function name: `generateEmailDraft`
3. Input/output logged
4. Duration ~3.5 seconds

**If traces NOT appearing:**
- Check BRAINTRUST_API_KEY is correct in Vercel
- Verify project name matches: "Email_Workflow"
- Check Braintrust account has access to logs

## Action Items

### For User (IMMEDIATE)
1. **Check Braintrust dashboard** at: https://www.braintrust.dev/app/paul-9461/p/Email_Workflow/logs
2. **Verify traces** from the test run (timestamp ~09:06 UTC)
3. **Report back** if traces are visible or not

### If Traces Not Visible
1. Run test again: `npx tsx scripts/test-production-api.ts`
2. Check Vercel function logs in dashboard
3. Verify environment variables in Vercel UI
4. Check Braintrust API key is valid

### GitHub Deployment Issue
**Recommendation:** Investigate why GitHub automatic deployments are failing

**Possible causes:**
- GitHub webhook misconfigured
- Build command changed
- Node version mismatch
- Missing build environment variables

**Action:** Check Vercel dashboard → Settings → Git Integration

## Files Created
- `scripts/test-production-api.ts` - Production API test script
- `plans/2026-01-11-braintrust-logging-debug-summary.md` - This file

## Commands Reference

**Test production API:**
```bash
npx tsx scripts/test-production-api.ts
```

**Check deployments:**
```bash
vercel list
```

**Manual deploy:**
```bash
vercel deploy --prod --yes
```

**View logs:**
```bash
vercel logs https://email-workflow-phi.vercel.app
```

**Check environment variables:**
```bash
vercel env ls
```

## Summary

The Braintrust logging code is **correct** and **deployed**. The issue was that automatic GitHub deployments were failing, so the new code never reached production. After manual deployment, the API works perfectly.

**Next step:** User must verify traces appear in Braintrust dashboard. If they do, issue is resolved. If not, we need to investigate environment variables or Braintrust configuration.
