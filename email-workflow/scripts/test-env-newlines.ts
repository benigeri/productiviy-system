#!/usr/bin/env tsx
/**
 * Test if env vars have trailing newlines
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env.local') });

const projectName = process.env.BRAINTRUST_PROJECT_NAME!;
const slug = process.env.BRAINTRUST_DRAFT_SLUG!;

console.log('=== Environment Variable Check ===\n');

console.log('BRAINTRUST_PROJECT_NAME:');
console.log(`  Value: "${projectName}"`);
console.log(`  Length: ${projectName.length}`);
console.log(`  Expected: 18 (for "2026_01 Email Flow")`);
console.log(`  Char codes: [${Array.from(projectName).map(c => c.charCodeAt(0)).join(', ')}]`);
console.log(`  Has newline at end: ${projectName.endsWith('\n')}`);

console.log('\nBRAINTRUST_DRAFT_SLUG:');
console.log(`  Value: "${slug}"`);
console.log(`  Length: ${slug.length}`);
console.log(`  Expected: 27 (for "email-writer-like-paul-bb66")`);
console.log(`  Char codes: [${Array.from(slug).map(c => c.charCodeAt(0)).join(', ')}]`);
console.log(`  Has newline at end: ${slug.endsWith('\n')}`);

if (projectName.length === 18 && slug.length === 27) {
  console.log('\n✅ Both values are CLEAN (no trailing newlines)');
} else {
  console.log('\n❌ Values have extra characters (likely newlines)');
  if (projectName.length !== 18) {
    console.log(`  Project name should be 18 chars, is ${projectName.length}`);
  }
  if (slug.length !== 27) {
    console.log(`  Slug should be 27 chars, is ${slug.length}`);
  }
}
