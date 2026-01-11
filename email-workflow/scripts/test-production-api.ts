#!/usr/bin/env tsx
/**
 * Test production API endpoint and verify Braintrust logging
 */

const PRODUCTION_URL = 'https://email-workflow-phi.vercel.app';

const testPayload = {
  threadId: 'test-thread-123',
  subject: 'Q4 Budget Review Meeting',
  messages: [
    {
      from: [{ email: 'alice@example.com', name: 'Alice' }],
      to: [{ email: 'paul@archive.com', name: 'Paul' }],
      date: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
      body: 'Hi Paul,\n\nCan we schedule a meeting next week to review the Q4 budget?\n\nAlice'
    },
    {
      from: [{ email: 'paul@archive.com', name: 'Paul' }],
      to: [{ email: 'alice@example.com', name: 'Alice' }],
      date: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      body: 'Sure Alice, I\'m available Tuesday or Thursday afternoon.'
    },
    {
      from: [{ email: 'alice@example.com', name: 'Alice' }],
      to: [{ email: 'paul@archive.com', name: 'Paul' }],
      date: Math.floor(Date.now() / 1000), // now
      body: 'Thursday at 2pm works great.'
    }
  ],
  instructions: 'Reply confirming Thursday and CC bob@example.com',
  latestMessageId: 'msg-latest-123'
};

async function testProductionAPI() {
  console.log('Testing production API endpoint...');
  console.log(`URL: ${PRODUCTION_URL}/api/drafts\n`);

  try {
    const startTime = Date.now();

    const response = await fetch(`${PRODUCTION_URL}/api/drafts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const duration = Date.now() - startTime;

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Duration: ${duration}ms\n`);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error response:');
      console.error(error);
      process.exit(1);
    }

    const result = await response.json();

    console.log('✓ Success! Response:');
    console.log(JSON.stringify(result, null, 2));

    if (result.to && result.cc && result.body) {
      console.log('\n✅ Valid response structure');
      console.log(`To: ${result.to.join(', ')}`);
      console.log(`CC: ${result.cc.join(', ')}`);
      console.log(`Body length: ${result.body.length} chars`);
    }

    console.log('\n📊 Now check Braintrust dashboard for traces:');
    console.log('https://www.braintrust.dev/app/paul-9461/p/Email_Workflow/logs');

  } catch (error) {
    console.error('❌ Request failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testProductionAPI();
