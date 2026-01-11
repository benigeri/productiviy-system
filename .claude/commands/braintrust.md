# Braintrust Prompt Management

Manage Braintrust prompts via REST API. Create, update, list prompts, and generate TypeScript usage code following the wrapTraced/initLogger pattern.

## Instructions

Read the skill file for detailed documentation and API reference:
${{file:.claude/skills/braintrust/SKILL.md}}

## Your Task

Based on the user's request: $ARGUMENTS

If no specific request provided, ask what they need help with:
- Creating a new prompt
- Updating an existing prompt
- Listing all prompts in a project
- Generating TypeScript usage code for a prompt
- Setting up Braintrust environment variables

For all operations, ensure BRAINTRUST_API_KEY is set in .env.
Default project comes from BRAINTRUST_PROJECT_NAME env var (can be overridden with --project flag).
