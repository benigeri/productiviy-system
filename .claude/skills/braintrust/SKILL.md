# Braintrust Prompt Management Skill

A CLI utility for managing Braintrust prompts via REST API. Create, update, list prompts, and generate TypeScript usage code following the wrapTraced/initLogger pattern.

## Quick Start

### Setup

Add your Braintrust credentials to `.env`:

```bash
# Add to .env
BRAINTRUST_API_KEY=sk-...
BRAINTRUST_PROJECT_ID=183dc023-466f-4dd9-8a33-ccfdf798a0e5  # UUID from project settings
BRAINTRUST_PROJECT_NAME=2026_01 Email Flow  # Human-readable name from dashboard
```

**IMPORTANT: Project ID vs Project Name**
- **Project ID** (UUID like `183dc023-...`): Used by this CLI tool for REST API operations (create, update, list). Find it in your Braintrust project settings URL or project details.
- **Project Name** (string like `2026_01 Email Flow`): Used by the Braintrust SDK's `invoke()` function for testing prompts. This is the human-readable name you see in the dashboard.
- **Both are required**: Set both environment variables for full functionality.

Get your API key from: https://www.braintrust.dev/app/settings/api-keys

### Common Commands

```bash
# List all prompts in your project
python3 .claude/skills/braintrust/braintrust.py list

# Create a new prompt
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "email-draft" \
  --name "Email Draft Generation" \
  --system "You are a helpful email assistant." \
  --user "Write an email about: {{topic}}"

# Update an existing prompt
python3 .claude/skills/braintrust/braintrust.py update \
  --slug "email-draft" \
  --system "You are an expert email writer."

# Generate TypeScript usage code
python3 .claude/skills/braintrust/braintrust.py generate \
  --slug "email-draft" > invoke-email-draft.ts
```

### Use in Claude Code

```
/braintrust
```

This loads the full documentation into context.

## Commands

### `create`

Create a new prompt in Braintrust.

**Usage:**
```bash
python3 .claude/skills/braintrust/braintrust.py create \
  --slug SLUG \
  --name NAME \
  [--project PROJECT] \
  [--system SYSTEM_MESSAGE] \
  [--user USER_MESSAGE]
```

**Arguments:**
- `--slug` (required): Unique identifier for the prompt (e.g., "email-draft")
- `--name` (required): Display name for the prompt (e.g., "Email Draft Generation")
- `--project` (optional): Project name (defaults to `BRAINTRUST_PROJECT_ID` env var)
- `--system` (optional): System message content
- `--user` (optional): User message content (supports `{{variable}}` syntax)

**Examples:**

Create a simple prompt:
```bash
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "summarize" \
  --name "Text Summarization" \
  --system "You are a summarization assistant." \
  --user "Summarize this text: {{text}}"
```

Create with multiple variables:
```bash
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "translate" \
  --name "Language Translation" \
  --system "You are a translator." \
  --user "Translate '{{text}}' from {{source_lang}} to {{target_lang}}"
```

**Output:**
```
✓ Created prompt 'email-draft' in project 'Your_Project'
  ID: prompt_abc123xyz
  View at: https://www.braintrust.dev/app/Your_Project/prompts/email-draft
```

### `update`

Update an existing prompt.

**Usage:**
```bash
python3 .claude/skills/braintrust/braintrust.py update \
  --slug SLUG \
  [--project PROJECT] \
  [--name NEW_NAME] \
  [--system SYSTEM_MESSAGE] \
  [--user USER_MESSAGE]
```

**Arguments:**
- `--slug` (required): Slug of the prompt to update
- `--project` (optional): Project name (defaults to `BRAINTRUST_PROJECT_ID` env var)
- `--name` (optional): New display name
- `--system` (optional): New system message
- `--user` (optional): New user message

**Examples:**

Update system message:
```bash
python3 .claude/skills/braintrust/braintrust.py update \
  --slug "email-draft" \
  --system "You are an expert professional email writer with 10 years of experience."
```

Update both messages:
```bash
python3 .claude/skills/braintrust/braintrust.py update \
  --slug "email-draft" \
  --system "You are helpful." \
  --user "Draft an email about: {{topic}} for {{recipient}}"
```

**Output:**
```
✓ Updated prompt 'email-draft' in project 'Your_Project'
  ID: prompt_abc123xyz
  View at: https://www.braintrust.dev/app/Your_Project/prompts/email-draft
```

### `list`

List all prompts, optionally filtered by project.

**Usage:**
```bash
python3 .claude/skills/braintrust/braintrust.py list [--project PROJECT]
```

**Arguments:**
- `--project` (optional): Filter by project name

**Examples:**

List all prompts in default project:
```bash
python3 .claude/skills/braintrust/braintrust.py list
```

List prompts in specific project:
```bash
python3 .claude/skills/braintrust/braintrust.py list --project "My_Other_Project"
```

**Output:**
```
Found 3 prompt(s):

  • email-draft
    Name: Email Draft Generation
    Project: Your_Project
    ID: prompt_abc123
    URL: https://www.braintrust.dev/app/Your_Project/prompts/email-draft

  • summarize
    Name: Text Summarization
    Project: Your_Project
    ID: prompt_def456
    URL: https://www.braintrust.dev/app/Your_Project/prompts/summarize

  • translate
    Name: Language Translation
    Project: Your_Project
    ID: prompt_ghi789
    URL: https://www.braintrust.dev/app/Your_Project/prompts/translate
```

### `generate`

Generate TypeScript usage code for a prompt following the wrapTraced/initLogger pattern.

**Usage:**
```bash
python3 .claude/skills/braintrust/braintrust.py generate \
  --slug SLUG \
  [--project PROJECT]
```

**Arguments:**
- `--slug` (required): Slug of the prompt to generate code for
- `--project` (optional): Project name (defaults to `BRAINTRUST_PROJECT_ID` env var)

**Examples:**

Generate code to stdout:
```bash
python3 .claude/skills/braintrust/braintrust.py generate --slug "email-draft"
```

Save to file:
```bash
python3 .claude/skills/braintrust/braintrust.py generate \
  --slug "email-draft" > src/lib/invoke-email-draft.ts
```

**Generated Code Example:**

For a prompt with `{{topic}}` variable:
```typescript
import dotenv from 'dotenv';
import { login, invoke, wrapTraced, initLogger } from 'braintrust';

dotenv.config();

const emailDraft = wrapTraced(async function emailDraft(input: { topic: string }) {
  return await invoke({
    projectName: process.env.BRAINTRUST_PROJECT_ID,
    slug: 'email-draft',
    input: { topic: input.topic || '' },
  });
});

// Example usage
(async () => {
  initLogger({ projectName: process.env.BRAINTRUST_PROJECT_ID });
  await login({ apiKey: process.env.BRAINTRUST_API_KEY });

  const result = await emailDraft({
    topic: "example value"
  });

  console.log(result);
})();
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAINTRUST_API_KEY` | Yes | Your Braintrust API key (starts with `sk-`) |
| `BRAINTRUST_PROJECT_ID` | For create/update/list | Default project UUID for REST API operations (can override with `--project` flag) |
| `BRAINTRUST_PROJECT_NAME` | For test/invoke | Default project name for SDK invoke operations (can override with `--project-name` flag) |

**Setup:**
```bash
# Add to .env file
echo "BRAINTRUST_API_KEY=sk-your-key-here" >> .env
echo "BRAINTRUST_PROJECT_ID=183dc023-466f-4dd9-8a33-ccfdf798a0e5" >> .env
echo "BRAINTRUST_PROJECT_NAME=2026_01 Email Flow" >> .env
```

**Get API Key:**
https://www.braintrust.dev/app/settings/api-keys

**Get Project ID:**
1. Go to your project in Braintrust dashboard
2. Look at the URL: `https://www.braintrust.dev/app/[org]/p/[project-name]`
3. Click project settings to see the UUID
4. Or check the project details page for "Project ID"

## API Reference

### Braintrust REST API

The script uses the Braintrust REST API v1:

**Base URL:** `https://api.braintrust.dev/v1`

**Authentication:** Bearer token in `Authorization` header

**Endpoints used:**
- `GET /prompt` - List prompts
- `POST /prompt` - Create prompt
- `PATCH /prompt/{id}` - Update prompt

**Prompt Object Structure:**
```json
{
  "id": "prompt_abc123",
  "slug": "email-draft",
  "name": "Email Draft Generation",
  "project_name": "Your_Project",
  "prompt_data": {
    "prompt": {
      "messages": [
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Draft email: {{topic}}"}
      ]
    }
  }
}
```

## Troubleshooting

### Error: BRAINTRUST_API_KEY environment variable not set

**Solution:** Add your API key to `.env`:
```bash
echo "BRAINTRUST_API_KEY=sk-your-key-here" >> .env
```

### Error: --project or BRAINTRUST_PROJECT_ID required

**Solution:** Either set the env var or use `--project` flag:
```bash
# Option 1: Set env var
echo "BRAINTRUST_PROJECT_ID=Your_Project" >> .env

# Option 2: Use flag
python3 .claude/skills/braintrust/braintrust.py create --project "Your_Project" ...
```

### Error: Prompt 'xyz' already exists

**Solution:** Use `update` command instead of `create`:
```bash
python3 .claude/skills/braintrust/braintrust.py update --slug "xyz" ...
```

### Error: Prompt 'xyz' not found

**Solution:** Check the slug name with `list` command:
```bash
python3 .claude/skills/braintrust/braintrust.py list
```

### HTTP 401 - Unauthorized

**Solution:** Your API key is invalid or expired. Get a new one from:
https://www.braintrust.dev/app/settings/api-keys

### HTTP 404 - Not Found

**Solution:** The project ID doesn't exist or you don't have access. Verify:
1. Check the Project ID (UUID) in Braintrust dashboard project settings
2. Ensure it's the UUID (like `183dc023-...`), not the project name
3. Verify you have access to this project

https://www.braintrust.dev/app

### Error: Function not found when invoking

**Symptom:** When running generated TypeScript invoke code, you get:
```
404: Function not found (searching for {"project_name":"...", "slug":"..."})
```

**Cause:** The `invoke()` SDK function requires the **project name** (human-readable string), not the **project ID** (UUID).

**Solution:**
1. Check the project name in Braintrust dashboard (e.g., "2026_01 Email Flow")
2. The `test` command uses the API to fetch the correct project name
3. If still failing, verify the prompt exists by running `list` command

**Understanding the Difference:**
- **REST API** (this CLI tool): Uses `project_id` (UUID like `183dc023-...`)
- **SDK invoke()**: Uses `projectName` (string like `"2026_01 Email Flow"`)
- The CLI's `test` command automatically handles this conversion

### Error: No model specified when invoking

**Symptom:** When running invoke, you get:
```
400: Bad Request (No model specified. Either specify it in the prompt or as a default)
```

**Cause:** The Braintrust project doesn't have any AI providers configured.

**Solution:**
1. Go to Braintrust dashboard: https://www.braintrust.dev/app
2. Select your project ("2026_01 Email Flow")
3. Navigate to Settings > AI Providers
4. Configure Anthropic (or another provider) with your API key
5. Set a default model for the project (optional but recommended)

Once providers are configured, prompts can use models specified in their configuration or you can pass models directly to `invoke()`.

## Advanced Usage

### Working with Multiple Projects

Override the default project per command:

```bash
# List prompts in Project A
python3 .claude/skills/braintrust/braintrust.py list --project "Project_A"

# Create prompt in Project B
python3 .claude/skills/braintrust/braintrust.py create \
  --project "Project_B" \
  --slug "test" \
  --name "Test Prompt" \
  --user "{{input}}"
```

### Using Variables in Prompts

Variables use `{{variable_name}}` syntax:

```bash
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "multi-var" \
  --name "Multiple Variables" \
  --system "You are helpful." \
  --user "Task: {{task}}, Context: {{context}}, Output format: {{format}}"
```

The `generate` command will automatically detect all variables and include them in the TypeScript interface.

### Pipeline Example

Create a prompt and immediately generate usage code:

```bash
# Create prompt
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "analyze" \
  --name "Code Analysis" \
  --system "You analyze code." \
  --user "Analyze: {{code}}"

# Generate usage code
python3 .claude/skills/braintrust/braintrust.py generate \
  --slug "analyze" > src/lib/analyze-code.ts

# Use it in your app
# (edit the generated file as needed)
```

## Tips

1. **Use descriptive slugs:** Use kebab-case for slugs (e.g., "email-draft", "code-review")
2. **Test prompts in UI first:** Create/test in Braintrust UI, then use CLI for automation
3. **Version control generated code:** Check generated `.ts` files into git
4. **One prompt per task:** Keep prompts focused on single responsibilities
5. **Document variables:** Use clear variable names that explain their purpose

## Links

- **Braintrust Dashboard:** https://www.braintrust.dev/app
- **API Keys:** https://www.braintrust.dev/app/settings/api-keys
- **Braintrust Docs:** https://www.braintrust.dev/docs
- **Braintrust SDK:** https://www.npmjs.com/package/braintrust
