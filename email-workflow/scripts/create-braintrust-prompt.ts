import * as braintrust from 'braintrust';

const project = braintrust.projects.create({
  name: 'Email_Workflow',
});

export const emailDraftGeneration = project.prompts.create({
  name: 'Email Draft Generation',
  slug: 'email-draft-generation',
  description: 'Generate professional email replies based on thread context and user instructions',
  model: 'claude-sonnet-4-5-20250929',
  messages: [
    {
      role: 'system',
      content: `You are an email assistant helping to draft professional replies to emails.

Your task is to generate a professional email reply based on:
1. The thread subject and previous messages
2. The user's instructions on what to say

Guidelines:
- Keep the tone professional but friendly
- Be concise and clear
- Match the formality level of the previous messages
- Address all points mentioned in the user's instructions
- Return ONLY the email body text (no subject line, no salutation unless specifically requested)`,
    },
    {
      role: 'user',
      content: `Thread Subject: {{thread_subject}}

Previous Messages:
{{#each messages}}
From: {{this.from}}
To: {{this.to}}
Date: {{this.date}}

{{this.body}}

---
{{/each}}

User Instructions: {{user_instructions}}

Generate a professional email reply based on the user's instructions. Return only the email body text.`,
    },
  ],
});

async function main() {
  console.log('Creating/updating Braintrust prompt...');
  await project.publish();
  console.log('✓ Prompt published successfully!');
  console.log('  Project: Email_Workflow');
  console.log('  Slug: email-draft-generation');
  console.log('  Model: claude-sonnet-4-5-20250929');
}

main().catch((error) => {
  console.error('Error creating prompt:', error);
  process.exit(1);
});
