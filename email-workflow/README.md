# Email Workflow Web App

Mobile-responsive web application for AI-powered email drafting workflow.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Copy `.env.local` and update with your API keys:

- `NYLAS_API_KEY`: Your Nylas API key
- `NYLAS_GRANT_ID`: Your Nylas grant ID
- `BRAINTRUST_API_KEY`: Your Braintrust API key
- `BRAINTRUST_PROJECT_NAME`: Set to `Email_Workflow`
- `BRAINTRUST_DRAFT_SLUG`: Set to `email-draft-generation`

### 3. Create Braintrust Prompt

1. Go to https://www.braintrust.dev and sign in
2. Navigate to your project: `Email_Workflow`
3. Go to "Prompts" section
4. Click "Create Prompt"
5. Set the following:
   - **Name**: `Email Draft Generation`
   - **Slug**: `email-draft-generation`
   - **Model**: `claude-sonnet-4-5-20250929` (or your preferred Claude model)
   - **Prompt Template**:
     ```
     You are an email assistant helping to draft professional replies to emails.

     Thread Subject: {{thread_subject}}

     Previous Messages:
     {{#each messages}}
     From: {{this.from}}
     To: {{this.to}}
     Date: {{this.date}}

     {{this.body}}

     ---
     {{/each}}

     User Instructions: {{user_instructions}}

     Generate a professional email reply based on the user's instructions. Keep it concise and clear. Return ONLY the email body text, no subject line.
     ```
6. Save the prompt

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Tech Stack

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Braintrust**: LLM API wrapper for Claude
- **Nylas API**: Email integration
- **Zod**: Runtime validation

## Project Structure

```
email-workflow/
├── app/
│   ├── inbox/
│   │   └── page.tsx        # Inbox view (to be built)
│   ├── api/
│   │   ├── drafts/
│   │   │   └── route.ts    # Draft generation API (to be built)
│   │   └── threads/
│   │       └── route.ts    # Label update API (to be built)
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home (redirects to /inbox)
│   └── globals.css         # Tailwind imports
├── .env.local              # Environment variables (gitignored)
└── package.json            # Dependencies
```

## Development

This is the MVP setup. Subsequent beads will implement:
- Inbox page with thread list and message display
- Draft generation API route
- Label update API route
- Full mobile-responsive UI

## Deployment

Deploy to Vercel:

1. Push to GitHub
2. Import repo in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The app will be accessible via an obscure Vercel URL (no auth needed for MVP).
