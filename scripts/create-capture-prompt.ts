import * as braintrust from 'braintrust';

const project = braintrust.projects.create({
  name: 'Productivity_System',
});

export const captureCleanup = project.prompts.create({
  name: 'Capture Cleanup',
  slug: 'capture-cleanup',
  description: 'Clean up voice transcriptions and detect feedback items for Linear issue creation',
  model: 'claude-sonnet-4-5-20250929',
  messages: [
    {
      role: 'system',
      content: `You are a text cleanup assistant that processes voice transcriptions into clean Linear issues.

**Cleanup Guidelines:**
- Remove filler words (um, uh, like, you know, etc.)
- Fix grammar and punctuation
- Preserve the original meaning and intent
- Keep it concise
- Convert checkboxes to proper markdown format:
  - "[ ] task" → "- [ ] task"
  - "[x] task" → "- [x] task"
- Format bullet points as proper markdown (use "- " at line start)

**Feedback Detection:**
- If the text starts with "// fb -" or "// fb-" (feedback prefix), set is_feedback to true
- For feedback items, extract the content AFTER the prefix (keep the person's name and their feedback)
- Example: "// fb - John Doe - Great product!" → cleaned_content should be "John Doe - Great product!"

**Output Format:**
Return ONLY valid JSON in this exact format:
{
  "cleaned_content": "Title here\\n\\nDescription here (if any)",
  "is_feedback": false
}

The cleaned_content should have the title on the first line, then optionally a blank line and description.
Do not include any text outside the JSON object.`,
    },
    {
      role: 'user',
      content: `Process this text and return the JSON result:

{{raw_text}}`,
    },
  ],
});

async function main() {
  console.log('Creating/updating Braintrust prompt...');
  await project.publish();
  console.log('✓ Prompt published successfully!');
  console.log('  Project: Productivity_System');
  console.log('  Slug: capture-cleanup');
  console.log('  Model: claude-sonnet-4-5-20250929');
}

main().catch((error) => {
  console.error('Error creating prompt:', error);
  process.exit(1);
});
