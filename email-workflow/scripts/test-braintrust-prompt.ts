#!/usr/bin/env tsx
/**
 * Test script for Braintrust email draft generation prompt
 *
 * Usage: npx tsx scripts/test-braintrust-prompt.ts
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { invoke, wrapTraced } from 'braintrust';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env.local') });

const PROJECT_NAME = process.env.BRAINTRUST_PROJECT_NAME!;
const DRAFT_SLUG = process.env.BRAINTRUST_DRAFT_SLUG!;

// Test inputs
const testInput = {
  thread_subject: "Q4 Budget Review Meeting",
  messages: [
    {
      from: "alice@example.com",
      to: "paul@archive.com",
      date: "Wed, Jan 8, 2026 at 2:30 PM",
      body: "Hi Paul,\n\nI wanted to follow up on the Q4 budget discussion. Can we schedule a meeting next week to review the numbers?\n\nAlice"
    },
    {
      from: "paul@archive.com",
      to: "alice@example.com",
      date: "Wed, Jan 8, 2026 at 3:15 PM",
      body: "Sure Alice, I'm available Tuesday or Thursday afternoon. Let me know what works for you."
    },
    {
      from: "alice@example.com",
      to: "paul@archive.com",
      date: "Thu, Jan 9, 2026 at 10:00 AM",
      body: "Thursday at 2pm works great. I'll send a calendar invite."
    }
  ],
  user_instructions: "Reply confirming Thursday and CC bob@example.com since he needs to be in the loop on budget decisions"
};

// Wrapped test function for tracing
const runPromptTest = wrapTraced(async function runPromptTest(input: typeof testInput) {
  const startTime = Date.now();

  const result = await invoke({
    projectName: PROJECT_NAME,
    slug: DRAFT_SLUG,
    input: {
      user_input: JSON.stringify(input)
    },
  });

  const duration = Date.now() - startTime;

  console.log(`\n⏱️  Duration: ${duration}ms`);

  return result;
});

async function testBraintrustPrompt() {
  console.log('Testing Braintrust Prompt...\n');
  console.log('Environment:', {
    projectName: PROJECT_NAME || '✗ Missing',
    slug: DRAFT_SLUG || '✗ Missing',
  });

  if (!PROJECT_NAME || !DRAFT_SLUG) {
    console.error('\n❌ Missing required environment variables');
    process.exit(1);
  }

  console.log('\nTest Input:');
  console.log(JSON.stringify(testInput, null, 2));

  try {
    console.log('\nCalling Braintrust SDK invoke() with tracing...');

    const result = await runPromptTest(testInput);

    console.log('\n✓ Braintrust Response (raw):');
    console.log(typeof result);
    console.log(result);

    // Try to parse as JSON (for structured output)
    if (typeof result === 'string') {
      console.log('\n📝 Response is a string, attempting JSON parse...');
      try {
        const parsed = JSON.parse(result);
        console.log('\n✓ Parsed as JSON:');
        console.log(JSON.stringify(parsed, null, 2));

        // Validate structure
        const hasTo = Array.isArray(parsed.to);
        const hasCc = Array.isArray(parsed.cc);
        const hasBody = typeof parsed.body === 'string';

        console.log('\n📋 Validation:');
        console.log(`  to array: ${hasTo ? '✓' : '✗'}`);
        console.log(`  cc array: ${hasCc ? '✓' : '✗'}`);
        console.log(`  body string: ${hasBody ? '✓' : '✗'}`);

        if (hasCc && parsed.cc.length > 0) {
          console.log(`\n🎯 CC Detection: Found ${parsed.cc.length} CC recipient(s)`);
          console.log(`  CC: ${parsed.cc.join(', ')}`);
        } else {
          console.log('\n⚠️  CC Detection: No CC recipients extracted');
        }

        if (hasTo && hasBody) {
          console.log('\n✅ Success! Response matches expected schema');
        } else {
          console.log('\n❌ Response structure is incorrect');
        }

      } catch (e) {
        console.log('\n⚠️  Response is not JSON (plain text output)');
        console.log('This means the prompt is returning plain text instead of structured JSON.');
        console.log('The prompt needs to be updated to return JSON format.');
      }
    } else if (typeof result === 'object') {
      console.log('\n✓ Response is already an object (good!)');
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testBraintrustPrompt();
