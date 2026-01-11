# Braintrust Best Practices

*Compiled from production usage in the Email Workflow project*

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Setup](#project-setup)
3. [Creating Prompts](#creating-prompts)
4. [Invoking Prompts in Production](#invoking-prompts-in-production)
5. [Testing Prompts](#testing-prompts)
6. [Prompt Design Patterns](#prompt-design-patterns)
7. [Error Handling & Validation](#error-handling--validation)
8. [Observability & Logging](#observability--logging)
9. [Environment Variables](#environment-variables)
10. [Common Pitfalls](#common-pitfalls)
11. [Example Code](#example-code)

---

## Quick Start

```bash
# 1. Install Braintrust
npm install braintrust

# 2. Set environment variables
echo "BRAINTRUST_API_KEY=sk-..." >> .env.local
echo "BRAINTRUST_PROJECT_NAME=Your_Project_Name" >> .env.local
echo "BRAINTRUST_YOUR_PROMPT_SLUG=your-prompt-slug" >> .env.local

# 3. Create a prompt (see Creating Prompts section)
# 4. Invoke the prompt (see Invoking Prompts section)
```

---

## Project Setup

### Installation

```bash
npm install braintrust dotenv zod
```

**Dependencies:**
- `braintrust` - Core SDK for prompt management and invocation
- `dotenv` - Load environment variables from `.env` files
- `zod` - Runtime validation for inputs and outputs

### TypeScript Configuration

Ensure your `tsconfig.json` allows ES modules:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "node"
  }
}
```

---

## Creating Prompts

### Programmatic Prompt Creation

**Use Case:** Version-controlled prompts, easy to replicate across environments

```typescript
// scripts/create-your-prompt.ts
import * as braintrust from 'braintrust';

const project = braintrust.projects.create({
  name: 'Your_Project_Name',
});

export const yourPrompt = project.prompts.create({
  name: 'Human-Readable Prompt Name',
  slug: 'your-prompt-slug',
  description: 'Clear description of what this prompt does',
  model: 'claude-sonnet-4-5-20250929', // or gpt-4, etc.
  messages: [
    {
      role: 'system',
      content: `You are an expert assistant...

Guidelines:
- Guideline 1
- Guideline 2

Return ONLY valid JSON in this format:
{
  "field1": "value",
  "field2": ["array", "of", "values"]
}`,
    },
    {
      role: 'user',
      content: `Input: {{input_variable}}

Additional context: {{context}}

Process this and return the result.`,
    },
  ],
});

async function main() {
  console.log('Creating/updating Braintrust prompt...');
  await project.publish();
  console.log('✓ Prompt published successfully!');
  console.log(`  Project: ${project.name}`);
  console.log(`  Slug: ${yourPrompt.slug}`);
}

main().catch((error) => {
  console.error('Error creating prompt:', error);
  process.exit(1);
});
```

**Run it:**
```bash
npx tsx scripts/create-your-prompt.ts
```

### Template Variables

**Handlebars Syntax:**

```typescript
// Simple variable
`User input: {{user_input}}`

// Loop through array
`{{#each messages}}
From: {{this.from}}
To: {{this.to}}
Body: {{this.body}}
---
{{/each}}`

// Conditional
`{{#if has_context}}
Context: {{context}}
{{/if}}`
```

### Structured Output

**Always ask for JSON explicitly:**

```typescript
content: `Return ONLY valid JSON in this exact format (no additional text):

{
  "field1": "string",
  "field2": ["array"],
  "field3": { "nested": "object" }
}

Do not include markdown code fences, explanations, or any text outside the JSON.`
```

---

## Invoking Prompts in Production

### Basic Invocation

```typescript
import { invoke } from 'braintrust';

const result = await invoke({
  projectName: process.env.BRAINTRUST_PROJECT_NAME,
  slug: process.env.BRAINTRUST_PROMPT_SLUG,
  input: {
    user_input: "Hello world",
    context: "Some additional context"
  },
});
```

### With Tracing (Recommended)

**Always use `wrapTraced()` for observability:**

```typescript
import { invoke, wrapTraced } from 'braintrust';

const generateResponse = wrapTraced(async function generateResponse(input: {
  user_input: string;
  context: string;
}) {
  const projectName = process.env.BRAINTRUST_PROJECT_NAME;
  const slug = process.env.BRAINTRUST_PROMPT_SLUG;

  if (!projectName || !slug) {
    throw new Error('Missing Braintrust configuration');
  }

  const result = await invoke({
    projectName,
    slug,
    input: {
      user_input: input.user_input,
      context: input.context,
    },
  });

  return result;
});

// Use it
const response = await generateResponse({
  user_input: "Hello",
  context: "This is a test"
});
```

**Why `wrapTraced()`?**
- Automatically logs all invocations to Braintrust
- Tracks latency and performance
- Captures inputs and outputs for debugging
- Enables A/B testing different prompts

---

## Testing Prompts

### Standalone Test Script

**Location:** `scripts/test-your-prompt.ts`

```typescript
#!/usr/bin/env tsx
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { invoke, wrapTraced, initLogger } from 'braintrust';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env.local') });

const PROJECT_NAME = process.env.BRAINTRUST_PROJECT_NAME!;
const PROMPT_SLUG = process.env.BRAINTRUST_PROMPT_SLUG!;

// Initialize logger
const logger = initLogger({
  projectName: PROJECT_NAME,
});

// Test input
const testInput = {
  user_input: "Test input here",
  context: "Test context"
};

// Wrapped test function
const runTest = wrapTraced(async function runTest(input: typeof testInput) {
  const startTime = Date.now();

  const result = await invoke({
    projectName: PROJECT_NAME,
    slug: PROMPT_SLUG,
    input,
  });

  const duration = Date.now() - startTime;
  console.log(`⏱️  Duration: ${duration}ms`);

  return result;
});

async function testPrompt() {
  console.log('Testing Braintrust Prompt...\n');

  if (!PROJECT_NAME || !PROMPT_SLUG) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  console.log('Test Input:', JSON.stringify(testInput, null, 2));

  try {
    const result = await runTest(testInput);

    console.log('✓ Response:', result);

    // Validate JSON structure if expecting JSON
    if (typeof result === 'string') {
      const parsed = JSON.parse(result);
      console.log('✓ Parsed JSON:', parsed);

      // Validate schema
      const isValid = validateResponseSchema(parsed);
      console.log(isValid ? '✅ Valid schema' : '❌ Invalid schema');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function validateResponseSchema(data: any): boolean {
  // Add your schema validation here
  return true;
}

testPrompt();
```

**Run it:**
```bash
npx tsx scripts/test-your-prompt.ts
```

### Testing Checklist

- [ ] Test with minimal valid input
- [ ] Test with maximum complexity input
- [ ] Test with edge cases (empty strings, null, etc.)
- [ ] Verify JSON structure (if structured output)
- [ ] Check response time (should be < 5s for most prompts)
- [ ] Test with different prompt versions
- [ ] Verify tracing appears in Braintrust UI

---

## Prompt Design Patterns

### System Message Structure

```typescript
content: `You are [role description].

[Overall objective and context]

**Key Behaviors:**
- Behavior 1
- Behavior 2

<Steps>
  <Step number="1">
    <Title>Step Title</Title>
    <Details>
      - Detail 1
      - Detail 2
    </Details>
  </Step>
  <Step number="2">
    <Title>Next Step</Title>
    <Details>
      - Detail 1
    </Details>
  </Step>
</Steps>

<OutputInstructions>
  Return ONLY valid JSON in this exact format:

  {
    "field": "value"
  }

  Do not include any text outside the JSON object.
</OutputInstructions>

<Examples>
  [Show 2-3 examples of good outputs]
</Examples>

<Summary>
  Brief recap of key points
</Summary>`
```

### User Message Structure

```typescript
content: `Context: {{context}}

Input Data:
{{#each items}}
- {{this.name}}: {{this.value}}
{{/each}}

User Request: {{user_request}}

Generate the output following the instructions above.`
```

### Structured Output Best Practices

1. **Always specify exact JSON schema**
2. **Use `type: object` with required fields**
3. **Provide example outputs**
4. **Explicitly state "no additional text"**
5. **Test that LLM actually returns valid JSON**

**Example:**

```typescript
<OutputInstructions>
Return ONLY valid JSON (no markdown code fences):

```yaml
type: object
required: [to, cc, body]
properties:
  to:
    type: array
    items:
      type: string
      format: email
  cc:
    type: array
    items:
      type: string
      format: email
  body:
    type: string
```

Example:
```json
{
  "to": ["user@example.com"],
  "cc": ["other@example.com"],
  "body": "Email content here"
}
```
</OutputInstructions>
```

---

## Error Handling & Validation

### Input Validation (Zod)

```typescript
import { z } from 'zod';

const InputSchema = z.object({
  user_input: z.string().min(1),
  context: z.string().optional(),
  items: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })),
});

type Input = z.infer<typeof InputSchema>;

export async function handler(rawInput: unknown) {
  // Validate input
  const result = InputSchema.safeParse(rawInput);

  if (!result.success) {
    console.error('Input validation failed:', result.error.issues);
    throw new Error('Invalid input');
  }

  const input = result.data;

  // Now input is type-safe
  return await generateResponse(input);
}
```

### Output Validation (Zod)

```typescript
const OutputSchema = z.object({
  to: z.array(z.string()),
  cc: z.array(z.string()),
  body: z.string(),
});

type Output = z.infer<typeof OutputSchema>;

const generateResponse = wrapTraced(async function generateResponse(
  input: Input
): Promise<Output> {
  const rawResult = await invoke({
    projectName: process.env.BRAINTRUST_PROJECT_NAME,
    slug: process.env.BRAINTRUST_PROMPT_SLUG,
    input,
  });

  // Validate output
  const validation = OutputSchema.safeParse(rawResult);

  if (!validation.success) {
    console.error('Invalid Braintrust response:', {
      issues: validation.error.issues,
      rawResult,
    });
    throw new Error('Invalid response from AI model');
  }

  return validation.data;
});
```

### Error Handling Pattern

```typescript
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Parse request
    const body = await request.json();

    // Validate input
    const input = InputSchema.parse(body);

    // Generate response
    const response = await generateResponse(input);

    // Log success
    const duration = Date.now() - startTime;
    console.log('Success:', { duration });

    return NextResponse.json({
      success: true,
      data: response,
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      duration,
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Request failed',
      },
      { status: 500 }
    );
  }
}
```

---

## Observability & Logging

### Initialize Logger

```typescript
import { initLogger } from 'braintrust';

const logger = initLogger({
  projectName: process.env.BRAINTRUST_PROJECT_NAME,
});
```

### Log Performance Metrics

```typescript
const generateResponse = wrapTraced(async function generateResponse(input: Input) {
  const startTime = Date.now();

  const result = await invoke({
    projectName: process.env.BRAINTRUST_PROJECT_NAME,
    slug: process.env.BRAINTRUST_PROMPT_SLUG,
    input,
  });

  const duration = Date.now() - startTime;

  console.log('Response generated:', {
    duration,
    inputLength: JSON.stringify(input).length,
    outputLength: JSON.stringify(result).length,
    hasErrors: false,
  });

  return result;
});
```

### Structured Logging

```typescript
console.log('Draft generation request:', {
  requestId: crypto.randomUUID(),
  threadId: input.threadId,
  messageCount: input.messages.length,
  instructionsLength: input.instructions.length,
  timestamp: new Date().toISOString(),
});
```

### What to Log

**Always log:**
- Request/response timing (duration in ms)
- Input size (character count, array lengths)
- Validation failures with error details
- Successful completions

**Never log:**
- API keys
- User PII (emails, names) unless necessary
- Full prompt content (too verbose)

---

## Environment Variables

### Required Variables

```bash
# .env.local (never commit this!)
BRAINTRUST_API_KEY=sk-your-api-key-here
BRAINTRUST_PROJECT_NAME=Your_Project_Name

# Per-prompt slugs
BRAINTRUST_DRAFT_SLUG=email-draft-generation
BRAINTRUST_COMPOSE_SLUG=email-compose-v1
BRAINTRUST_SUMMARY_SLUG=email-summary
```

### .env.example (commit this!)

```bash
# Braintrust AI Platform
BRAINTRUST_API_KEY=sk-your-braintrust-api-key
BRAINTRUST_PROJECT_NAME=Your_Project_Name

# Prompt slugs
BRAINTRUST_DRAFT_SLUG=your-draft-prompt-slug
BRAINTRUST_COMPOSE_SLUG=your-compose-prompt-slug
```

### Loading Environment Variables

```typescript
// For scripts
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env.local') });
```

```typescript
// For Next.js API routes
// Automatically loaded by Next.js, just use process.env
const projectName = process.env.BRAINTRUST_PROJECT_NAME;
```

### Environment Validation

```typescript
function validateBraintrustConfig() {
  const required = [
    'BRAINTRUST_API_KEY',
    'BRAINTRUST_PROJECT_NAME',
    'BRAINTRUST_DRAFT_SLUG',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Call this at app startup
validateBraintrustConfig();
```

---

## Common Pitfalls

### 1. Not Using `wrapTraced()`

**❌ Bad:**
```typescript
const result = await invoke({ projectName, slug, input });
```

**✅ Good:**
```typescript
const generateResponse = wrapTraced(async function generateResponse(input) {
  return await invoke({ projectName, slug, input });
});

const result = await generateResponse(input);
```

**Why?** Without tracing, you lose observability into prompt performance, can't debug issues, and can't compare prompt versions.

---

### 2. Not Validating Outputs

**❌ Bad:**
```typescript
const result = await invoke({ projectName, slug, input });
return result; // Assumes result is correct format
```

**✅ Good:**
```typescript
const rawResult = await invoke({ projectName, slug, input });
const validated = OutputSchema.parse(rawResult);
return validated;
```

**Why?** LLMs are non-deterministic. Even with structured output, they can return unexpected formats. Always validate.

---

### 3. Not Handling JSON Parsing Errors

**❌ Bad:**
```typescript
const result = await invoke({ projectName, slug, input });
const parsed = JSON.parse(result); // Can throw
```

**✅ Good:**
```typescript
const result = await invoke({ projectName, slug, input });

if (typeof result === 'string') {
  try {
    const parsed = JSON.parse(result);
    return OutputSchema.parse(parsed);
  } catch (e) {
    console.error('JSON parse failed:', { result, error: e });
    throw new Error('Invalid JSON response from AI');
  }
}

return OutputSchema.parse(result);
```

---

### 4. Missing Environment Variables

**❌ Bad:**
```typescript
const result = await invoke({
  projectName: process.env.BRAINTRUST_PROJECT_NAME, // undefined!
  slug: process.env.BRAINTRUST_SLUG,
  input,
});
```

**✅ Good:**
```typescript
const projectName = process.env.BRAINTRUST_PROJECT_NAME;
const slug = process.env.BRAINTRUST_SLUG;

if (!projectName || !slug) {
  throw new Error('Missing Braintrust configuration');
}

const result = await invoke({ projectName, slug, input });
```

---

### 5. Not Testing Prompts Independently

**❌ Bad:** Testing prompts only through the full application flow

**✅ Good:** Create standalone test scripts (see [Testing Prompts](#testing-prompts))

**Why?** Debugging prompt issues is much faster when you can test them in isolation.

---

### 6. Vague Prompt Instructions

**❌ Bad:**
```typescript
content: `Generate an email based on this input: {{input}}`
```

**✅ Good:**
```typescript
content: `You are an email assistant. Generate a professional email reply.

Guidelines:
- Keep tone friendly but professional
- Address all points in the user's instructions
- Be concise (2-3 paragraphs maximum)

Return ONLY valid JSON:
{
  "to": ["email@example.com"],
  "body": "Email content here"
}

Input: {{input}}`
```

**Why?** LLMs perform better with clear, specific instructions.

---

### 7. Not Logging Performance

**❌ Bad:**
```typescript
const result = await invoke({ projectName, slug, input });
return result;
```

**✅ Good:**
```typescript
const startTime = Date.now();
const result = await invoke({ projectName, slug, input });
const duration = Date.now() - startTime;

console.log('Prompt invocation:', { duration, slug });

return result;
```

**Why?** Latency matters. Always track how long prompts take.

---

## Example Code

### Complete API Route Example

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { invoke, wrapTraced } from 'braintrust';
import { z } from 'zod';

// Input validation
const RequestSchema = z.object({
  user_input: z.string().min(1),
  context: z.string().optional(),
});

// Output validation
const ResponseSchema = z.object({
  result: z.string(),
  confidence: z.number().min(0).max(1),
});

type ResponseType = z.infer<typeof ResponseSchema>;

// Wrapped function with tracing
const generateResult = wrapTraced(async function generateResult(input: {
  user_input: string;
  context?: string;
}): Promise<ResponseType> {
  const projectName = process.env.BRAINTRUST_PROJECT_NAME;
  const slug = process.env.BRAINTRUST_YOUR_SLUG;

  if (!projectName || !slug) {
    throw new Error('Missing Braintrust configuration');
  }

  const startTime = Date.now();

  const rawResult = await invoke({
    projectName,
    slug,
    input: {
      user_input: input.user_input,
      context: input.context || '',
    },
  });

  // Validate response
  const validation = ResponseSchema.safeParse(rawResult);
  if (!validation.success) {
    console.error('Invalid Braintrust response:', {
      issues: validation.error.issues,
      rawResult,
    });
    throw new Error('Invalid response from AI model');
  }

  const result = validation.data;
  const duration = Date.now() - startTime;

  console.log('Result generated:', {
    duration,
    inputLength: input.user_input.length,
    confidence: result.confidence,
  });

  return result;
});

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const validation = RequestSchema.safeParse(body);

    if (!validation.success) {
      console.error('Request validation failed:', validation.error.issues);
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const input = validation.data;

    console.log('Request received:', {
      inputLength: input.user_input.length,
      hasContext: !!input.context,
    });

    // Generate result with tracing
    const result = await generateResult(input);

    const duration = Date.now() - startTime;

    console.log('Request completed:', {
      duration,
      confidence: result.confidence,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('Request failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      duration,
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Request failed',
      },
      { status: 500 }
    );
  }
}
```

---

## Additional Resources

- **Braintrust Documentation**: https://www.braintrust.dev/docs
- **Braintrust API Reference**: https://www.braintrust.dev/docs/api-reference
- **Example Project**: See `email-workflow/` in this repository

---

## Changelog

- **2026-01-11**: Initial version based on Email Workflow project learnings
