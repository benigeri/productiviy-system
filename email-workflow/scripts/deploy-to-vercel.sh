#!/bin/bash
# Deploy Email Workflow to Vercel
# This script deploys the app and sets up environment variables

set -e

echo "🚀 Deploying Email Workflow to Vercel..."
echo ""

# Check if user is logged in to Vercel
if ! vercel whoami &>/dev/null; then
  echo "📝 You need to login to Vercel first:"
  echo "   Run: vercel login"
  exit 1
fi

# Load environment variables from .env.local
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local not found"
  echo "   Please create .env.local with your API keys"
  exit 1
fi

# Source environment variables
export $(cat .env.local | grep -v '^#' | xargs)

echo "✓ Environment variables loaded"
echo ""

# Deploy to Vercel with environment variables
echo "📦 Deploying to Vercel..."
vercel deploy \
  --yes \
  --env NYLAS_API_KEY="${NYLAS_API_KEY}" \
  --env NYLAS_GRANT_ID="${NYLAS_GRANT_ID}" \
  --env BRAINTRUST_API_KEY="${BRAINTRUST_API_KEY}" \
  --env BRAINTRUST_PROJECT_NAME="${BRAINTRUST_PROJECT_NAME}" \
  --env BRAINTRUST_DRAFT_SLUG="${BRAINTRUST_DRAFT_SLUG}" \
  --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📱 Next steps:"
echo "   1. Open the deployment URL in your browser"
echo "   2. Test the email workflow"
echo "   3. Test on your mobile device"
echo ""
