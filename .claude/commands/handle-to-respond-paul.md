# Handle To-Respond-Paul Emails

Process emails labeled `to-respond-paul`. Shows each email, gets your dictated response, generates a draft reply, and updates labels.

## Instructions

Read the skill file for workflow and API reference:
${{file:.claude/skills/email-respond/SKILL.md}}

## Writing Style

Follow these guidelines for drafting responses:
${{file:.claude/skills/email-respond/email-writing-guidelines.md}}

## Your Task

$ARGUMENTS

Start by fetching emails with the `to-respond-paul` label (Label_139) and show:
1. Total count of emails needing response
2. First email's details (from, subject, date, body)

Then wait for user input:
- User dictates response → generate draft, create via API, update labels
- User says "skip" → move to next email without changes
- User says "done" → exit workflow

After each draft is created, automatically show the next email.

## Quick Start

If no arguments provided, start the workflow:

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/messages?in=Label_139&limit=50" \
  -H "Authorization: Bearer $NYLAS_API_KEY"'
```

Then process results and begin the interactive session.
