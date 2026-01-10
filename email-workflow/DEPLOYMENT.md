# Email Workflow - Deployment Guide

## Prerequisites

✅ **Already completed** (by Claude):
- Next.js app built and tested locally
- Braintrust prompt created (`email-draft-generation`)
- Environment variables configured in `.env.local`
- All code committed and pushed to GitHub

## Deploy to Vercel

### Option 1: Automated Deployment Script (Recommended)

```bash
# 1. Login to Vercel (one-time setup)
vercel login

# 2. Run the deployment script
./scripts/deploy-to-vercel.sh
```

The script will:
- ✅ Deploy the app to Vercel
- ✅ Set all environment variables automatically
- ✅ Deploy to production
- ✅ Give you the deployment URL

### Option 2: Manual Deployment via Vercel Dashboard

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard

2. **Import GitHub Repository**:
   - Click "Add New" → "Project"
   - Import `benigeri/productiviy-system`
   - Set Root Directory to: `email-workflow`

3. **Configure Environment Variables**:
   Add these in the Vercel project settings:

   ```
   NYLAS_API_KEY=nyk_v0_CCNV9W8TKSHpIp8vwA1EeWHUjutGpwLc4dezcevYK0PnMUEarBSEvpUGhdmaRrzV
   NYLAS_GRANT_ID=a77fe5e2-a71e-4d77-8d33-484c01b97d54
   BRAINTRUST_API_KEY=sk-1fHWK3DiFvA1tgR4qmumNoQ3UMtIa1DyRMpQB94aVTqJ3nSp
   BRAINTRUST_PROJECT_NAME=Email_Workflow
   BRAINTRUST_DRAFT_SLUG=email-draft-generation
   ```

4. **Deploy**:
   - Click "Deploy"
   - Wait for deployment to complete
   - You'll get a URL like: `https://email-workflow-xxxxx.vercel.app`

## Testing the Deployment

### 1. Desktop Test

```bash
# Open deployment URL
open https://your-deployment-url.vercel.app
```

**Test flow**:
1. ✅ Inbox loads with your emails (Label: to-respond-paul)
2. ✅ Click a thread to view messages
3. ✅ Enter instructions: "Thank them and say I'll get back to them tomorrow"
4. ✅ Click "Generate Draft"
5. ✅ Draft appears in green success box
6. ✅ Redirects back to inbox (email removed from list)
7. ✅ Check Gmail - draft should be in Drafts folder
8. ✅ Check labels - should have "drafted" label, not "to-respond-paul"

### 2. Mobile Test

**On your iPhone**:
1. Open Safari or Chrome
2. Navigate to your Vercel deployment URL
3. Add to Home Screen (optional, for app-like experience)
4. Test the same flow as desktop

**Mobile-specific checks**:
- ✅ Layout is responsive (single column)
- ✅ Buttons are large enough to tap
- ✅ Text is readable without zooming
- ✅ Draft form sticky at bottom
- ✅ No horizontal scrolling

## Security Notes

**No Authentication (By Design)**:
- This MVP intentionally has no auth
- Security through obscurity (obscure Vercel URL)
- For production, consider adding:
  - Basic auth
  - Magic link login
  - OAuth

**API Keys**:
- ✅ Stored securely in Vercel environment variables
- ✅ Never exposed to client-side code
- ✅ Only accessible from server components/API routes

**Add to robots.txt**:
The app includes `robots.txt` to prevent indexing:
```
User-agent: *
Disallow: /
```

## Monitoring

### Check Logs

**Via Vercel Dashboard**:
1. Go to your project
2. Click "Deployments" → Your deployment
3. Click "Functions" tab
4. View real-time logs

**Via CLI**:
```bash
vercel logs https://your-deployment-url.vercel.app
```

### Braintrust Monitoring

1. Go to https://braintrust.dev
2. Navigate to "Email_Workflow" project
3. View all LLM calls and prompts
4. Check performance and cost

## Troubleshooting

### Issue: "Failed to fetch threads"

**Cause**: Nylas API key or grant ID incorrect

**Fix**:
1. Check environment variables in Vercel dashboard
2. Verify API key is correct
3. Redeploy

### Issue: "Failed to generate draft"

**Possible causes**:
- Braintrust API key incorrect
- Braintrust prompt not created
- Incorrect project name or slug

**Fix**:
1. Run `npm run create-prompt` to ensure prompt exists
2. Check Braintrust dashboard for prompt
3. Verify environment variables

### Issue: "Deployment failed"

**Check**:
```bash
# Verify build works locally
npm run build

# Check for TypeScript errors
npm run type-check  # or npx tsc --noEmit
```

## Next Steps

After successful deployment:

1. **Test thoroughly** on both desktop and mobile
2. **Monitor usage** via Braintrust dashboard
3. **Iterate** based on feedback
4. **Consider adding**:
   - Authentication
   - Compose new email feature
   - Email templates
   - Keyboard shortcuts (desktop)

## Support

**Deployment Issues**:
- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord

**App Issues**:
- Check this repository's issues
- Review server logs in Vercel dashboard
- Check Braintrust logs for LLM call failures
