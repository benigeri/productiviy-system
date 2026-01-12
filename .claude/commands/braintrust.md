# Braintrust Prompt Management

Manage Braintrust prompts via CLI. Create, update, diff, and generate TypeScript code for your prompts.

## Instructions

Read the skill file for commands and patterns:
${{file:~/.claude/skills/braintrust/SKILL.md}}

## Your Task

Based on the user's request: $ARGUMENTS

If no specific request provided, ask what Braintrust operation they need:
- **List prompts** - See all prompts in project
- **Get prompt** - View details of a specific prompt
- **Create prompt** - Create a new prompt with system/user messages
- **Diff prompt** - Preview changes before updating
- **Update prompt** - Modify an existing prompt
- **Generate code** - Get TypeScript invocation code

## Important Reminders

1. **Always diff before updating** - Use the `diff` command to preview changes
2. **Environment variables** - Ensure `BRAINTRUST_API_KEY` is set
3. **Test after changes** - Verify prompt behavior after updates
4. **Check traces** - Use Braintrust dashboard to verify logging works

## Quick Reference

```bash
# List prompts
python3 ~/.claude/skills/braintrust/braintrust.py list

# Get prompt details
python3 ~/.claude/skills/braintrust/braintrust.py get --slug "prompt-slug"

# Diff before update (CRITICAL)
python3 ~/.claude/skills/braintrust/braintrust.py diff --slug "prompt-slug" --system "new content"

# Update prompt
python3 ~/.claude/skills/braintrust/braintrust.py update --slug "prompt-slug" --system "new content"

# Generate TypeScript code
python3 ~/.claude/skills/braintrust/braintrust.py generate --slug "prompt-slug"
```
