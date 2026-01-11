# Braintrust Prompt Management Skill

## Overview
Create a simple CLI-based skill for managing Braintrust prompts using REST API calls. Single Python script with all functionality.

## User Requirements
- **CLI utility** for one-off prompt management
- **Operations:** Create new prompts, Update existing prompts, Generate usage code
- **Usage Pattern:** Generate code following their preferred pattern (wrapTraced, initLogger, login, invoke)

## Architecture (SIMPLIFIED)

### Files to Create (3 files total)
```
.claude/skills/braintrust/
├── SKILL.md          # All documentation + quick start + API reference
└── braintrust.py     # Single script with all functionality (~300 lines)

.claude/commands/braintrust.md  # Slash command (loads SKILL.md)
```

**Why Simple:**
- One script does everything (no separate utils/generator)
- All docs in one place (SKILL.md)
- No templates directory (examples inline in docs)
- Inline API helpers (not separate file)

## braintrust.py - Single Script Implementation

**Environment Variables:**
```bash
BRAINTRUST_API_KEY=sk-...
BRAINTRUST_PROJECT_NAME=Email_Workflow  # Optional default
```

**Subcommands:**
```bash
# Create prompt
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "email-draft" \
  --name "Email Draft Generation" \
  --system "You are helpful..." \
  --user "{{question}}" \
  --project "Email_Workflow"

# Update prompt
python3 .claude/skills/braintrust/braintrust.py update \
  --slug "email-draft" \
  --system "UPDATED prompt..."

# List prompts
python3 .claude/skills/braintrust/braintrust.py list

# Generate TypeScript usage code
python3 .claude/skills/braintrust/braintrust.py generate \
  --slug "email-draft"
```

**Generated Code Example:**
```typescript
import dotenv from 'dotenv';
import { login, invoke, wrapTraced, initLogger } from 'braintrust';

dotenv.config();

const generateEmailDraft = wrapTraced(async function generateEmailDraft(input) {
  return await invoke({
    projectName: process.env.BRAINTRUST_PROJECT_NAME,
    slug: 'email-draft',
    input: { question: input.question || '' },
  });
});

(async () => {
  initLogger({ projectName: process.env.BRAINTRUST_PROJECT_NAME });
  await login({ apiKey: process.env.BRAINTRUST_API_KEY });
  const result = await generateEmailDraft({ question: "Hello?" });
  console.log(result);
})();
```

## SKILL.md Documentation

**Quick Start Section** (examples of all commands)
**API Reference Section** (inline, not separate file)
**Troubleshooting Section** (common errors)

## Implementation Steps (Simplified)

1. **Create braintrust.py** (~300 lines)
   - Argparse with subcommands: create, update, list, generate
   - Inline API helper functions
   - Handle env vars with dotenv

2. **Create SKILL.md** (comprehensive, all-in-one)
   - Quick start with copy-paste examples
   - All subcommands documented
   - API reference inline
   - Troubleshooting tips

3. **Create slash command** (.claude/commands/braintrust.md)
   - Load SKILL.md content

4. **Update .env.example**
   - Add BRAINTRUST_API_KEY and BRAINTRUST_PROJECT_NAME

## Files to Create (3 files)

- `.claude/skills/braintrust/braintrust.py` (~300 lines)
- `.claude/skills/braintrust/SKILL.md` (all documentation)
- `.claude/commands/braintrust.md` (slash command)

## Files to Update (1 file)

- `.env.example` (add 2 env vars)

## Quick Start Guide (Copy-Paste Ready)

**Setup:**
```bash
# Add to .env
echo "BRAINTRUST_API_KEY=sk-..." >> .env
echo "BRAINTRUST_PROJECT_NAME=Email_Workflow" >> .env
```

**Create a prompt:**
```bash
python3 .claude/skills/braintrust/braintrust.py create \
  --slug "my-prompt" \
  --name "My Prompt" \
  --system "You are helpful." \
  --user "{{question}}"
```

**Update a prompt:**
```bash
python3 .claude/skills/braintrust/braintrust.py update \
  --slug "my-prompt" \
  --system "You are VERY helpful."
```

**List all prompts:**
```bash
python3 .claude/skills/braintrust/braintrust.py list
```

**Generate TypeScript code:**
```bash
python3 .claude/skills/braintrust/braintrust.py generate \
  --slug "my-prompt" > invoke-my-prompt.ts
```

**Use in Claude Code:**
```
/braintrust
```

## Verification (Test End-to-End)

1. Create test prompt: `braintrust.py create --slug test-prompt ...`
2. Verify in Braintrust UI at https://braintrust.dev
3. Update prompt: `braintrust.py update --slug test-prompt ...`
4. List prompts: `braintrust.py list`
5. Generate code: `braintrust.py generate --slug test-prompt`
6. Copy generated code to test file, run it
7. Test `/braintrust` slash command loads docs

## Success Criteria

✓ 3 files created, 1 file updated
✓ Can create/update prompts from CLI
✓ Generated code follows wrapTraced/initLogger pattern
✓ Works across repos (portable)
✓ Documentation has copy-paste examples
