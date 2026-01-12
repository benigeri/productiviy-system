# Braintrust Prompt Management Skill

Manage Braintrust prompts via CLI. Create, update, diff, and generate usage code.

## Quick Start

```bash
# Set environment variables
export BRAINTRUST_API_KEY="sk-..."
export BRAINTRUST_PROJECT_NAME="Your_Project"

# List all prompts
python3 .claude/skills/braintrust/braintrust.py list

# Get prompt details
python3 .claude/skills/braintrust/braintrust.py get --slug "my-prompt"

# Create a prompt
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "my-prompt" \
  --name "My Prompt" \
  --system "You are helpful." \
  --user "Question: {{question}}"

# CRITICAL: Always diff before updating
python3 .claude/skills/braintrust/braintrust.py diff \
  --slug "my-prompt" \
  --system "Updated system message"

# Update prompt
python3 .claude/skills/braintrust/braintrust.py update \
  --slug "my-prompt" \
  --system "Updated system message"

# Generate TypeScript code
python3 .claude/skills/braintrust/braintrust.py generate --slug "my-prompt"
```

## Commands

### `list`
List all prompts in a project.

```bash
python3 .claude/skills/braintrust/braintrust.py list
python3 .claude/skills/braintrust/braintrust.py list --project "My Project"
```

### `get`
View prompt details including system and user messages.

```bash
python3 .claude/skills/braintrust/braintrust.py get --slug "email-draft"
```

### `create`
Create a new prompt.

```bash
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "email-draft" \
  --name "Email Draft Generator" \
  --description "Generates professional email drafts" \
  --system "You are an email assistant..." \
  --user "Write an email about: {{topic}}" \
  --model "claude-sonnet-4-5-20250929"
```

**Parameters:**
- `--slug` (required): URL-safe identifier
- `--name`: Human-readable name (defaults to slug)
- `--description`: What the prompt does
- `--system`: System message content
- `--user`: User message template (use `{{variable}}` for inputs)
- `--model`: Model name (default: claude-sonnet-4-5-20250929)
- `--project`: Project name (or use BRAINTRUST_PROJECT_NAME)

### `diff`
**CRITICAL: Always diff before updating.** Shows what will change.

```bash
python3 .claude/skills/braintrust/braintrust.py diff \
  --slug "my-prompt" \
  --system "New system message here"
```

Output shows unified diff:
```diff
--- current
+++ proposed
@@ -1,3 +1,3 @@
-You are helpful.
+New system message here.
```

### `update`
Update an existing prompt.

```bash
python3 .claude/skills/braintrust/braintrust.py update \
  --slug "my-prompt" \
  --system "Updated system message" \
  --user "Updated user template: {{input}}"
```

**Workflow:**
1. `diff` - Review changes
2. `update` - Apply changes
3. Test - Verify behavior

### `generate`
Generate TypeScript code for invoking the prompt.

```bash
python3 .claude/skills/braintrust/braintrust.py generate --slug "my-prompt"
```

Output:
```typescript
import { invoke, wrapTraced, initLogger } from 'braintrust';

const logger = initLogger({
  projectName: process.env.BRAINTRUST_PROJECT_NAME!,
  apiKey: process.env.BRAINTRUST_API_KEY,
  asyncFlush: false, // CRITICAL for serverless
});

export const myPrompt = wrapTraced(async function myPrompt(
  input: { question: string }
) {
  // ... full implementation
});
```

## Environment Variables

```bash
# Required
BRAINTRUST_API_KEY=sk-your-api-key

# Optional (can use --project flag instead)
BRAINTRUST_PROJECT_NAME=Your_Project_Name
```

Add to `.env` or export in shell.

## Template Variables

Use Handlebars syntax in user messages:

```
# Simple variable
Question: {{question}}

# Multiple variables
Subject: {{subject}}
From: {{sender}}
Body: {{body}}

# Loop (in prompt UI, not CLI)
{{#each messages}}
From: {{this.from}}
Body: {{this.body}}
{{/each}}
```

## Standard Workflow

### Creating a New Prompt

1. **Create prompt:**
   ```bash
   python3 .claude/skills/braintrust/braintrust.py create \
     --slug "my-new-prompt" \
     --system "..." \
     --user "..."
   ```

2. **Generate code:**
   ```bash
   python3 .claude/skills/braintrust/braintrust.py generate \
     --slug "my-new-prompt" > invoke.ts
   ```

3. **Test the prompt:**
   - Use generated code
   - Check Braintrust dashboard for traces
   - Verify output format

### Updating a Prompt

1. **Get current state:**
   ```bash
   python3 .claude/skills/braintrust/braintrust.py get --slug "my-prompt"
   ```

2. **Diff changes:**
   ```bash
   python3 .claude/skills/braintrust/braintrust.py diff \
     --slug "my-prompt" \
     --system "New system message"
   ```

3. **Apply update:**
   ```bash
   python3 .claude/skills/braintrust/braintrust.py update \
     --slug "my-prompt" \
     --system "New system message"
   ```

4. **Test and verify:**
   - Run test cases
   - Check Braintrust dashboard
   - Compare outputs with previous version

## Debugging

### Check Braintrust Dashboard

View traces at: `https://www.braintrust.dev/app/{org}/p/{project}/logs`

### Common Issues

**"Project not found"**
- Check BRAINTRUST_PROJECT_NAME is correct
- Run `list` to see available projects/prompts

**"Prompt not found"**
- Verify slug spelling
- Check you're in the right project

**No traces appearing**
- Ensure `initLogger()` is called before invoke
- Use `asyncFlush: false` in serverless environments
- Check API key is valid

### API Key Validation

```bash
curl -H "Authorization: Bearer $BRAINTRUST_API_KEY" \
  https://api.braintrust.dev/v1/project
```

## Best Practices

1. **Always diff before update** - Prevents accidental changes
2. **Use meaningful slugs** - `email-draft-v2` not `prompt-1`
3. **Document template variables** - List expected inputs
4. **Test in isolation** - Use standalone scripts before integration
5. **Track versions** - Use slug naming (`-v2`, `-v3`) or Braintrust versioning

## See Also

- [Braintrust Best Practices](../../../docs/braintrust-best-practices.md) - Comprehensive patterns guide
- [Braintrust Docs](https://www.braintrust.dev/docs) - Official documentation
