import 'server-only';
import { NextResponse } from 'next/server';
import { invoke, wrapTraced, initLogger } from 'braintrust';
import { z } from 'zod';

// Initialize Braintrust logger for tracing (REQUIRED for logging to work)
const logger = initLogger({
  projectName: process.env.BRAINTRUST_PROJECT_NAME!,
  apiKey: process.env.BRAINTRUST_API_KEY,
  asyncFlush: false, // CRITICAL: Prevents log loss in serverless (Vercel)
});

// Request validation schemas
const DraftRequestSchema = z.object({
  threadId: z.string().min(1),
  subject: z.string(),
  messages: z.array(
    z.object({
      from: z.array(z.object({ name: z.string().optional(), email: z.string() })),
      to: z.array(z.object({ name: z.string().optional(), email: z.string() })),
      date: z.number(),
      body: z.string(),
    })
  ),
  instructions: z.string().min(1),
  latestMessageId: z.string(),
});

// Zod schema for Braintrust response validation
const DraftResponseSchema = z.object({
  subject: z.string().optional(), // AI returns this (unified prompt), but reply endpoint ignores it
  to: z.array(z.string()),
  cc: z.array(z.string()),
  body: z.string(),
});

type DraftResponse = z.infer<typeof DraftResponseSchema>;

// Format thread history as Gmail-style quoted text
function formatThreadHistory(
  messages: Array<{
    from: Array<{ name?: string; email: string }>;
    to: Array<{ name?: string; email: string }>;
    date: number;
    body: string;
  }>,
  currentUserEmail: string
): string {
  return messages
    .filter((m) => m.from[0]?.email !== currentUserEmail) // Skip own messages
    .sort((a, b) => a.date - b.date) // Chronological order
    .map((msg) => {
      const sender = msg.from[0];
      const date = new Date(msg.date * 1000);
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      // Quote each line with > prefix
      const quotedLines = msg.body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

      return `On ${dateStr} at ${timeStr} ${sender?.name || sender?.email} <${sender?.email}> wrote:\n${quotedLines}`;
    })
    .join('\n\n');
}

// Wrapped function for Braintrust tracing
const generateEmailDraft = wrapTraced(async function generateEmailDraft(input: {
  thread_subject: string;
  messages: Array<{
    from: string;
    to: string;
    date: string;
    body: string;
  }>;
  user_instructions: string;
}): Promise<DraftResponse> {
  const projectName = process.env.BRAINTRUST_PROJECT_NAME;
  const draftSlug = process.env.BRAINTRUST_DRAFT_SLUG;

  if (!projectName || !draftSlug) {
    throw new Error('Missing Braintrust configuration');
  }

  const startTime = Date.now();

  const rawResult = await invoke({
    projectName,
    slug: draftSlug,
    input: {
      user_input: JSON.stringify(input),
    },
  });

  // Validate Braintrust response structure
  const validationResult = DraftResponseSchema.safeParse(rawResult);
  if (!validationResult.success) {
    console.error('Invalid Braintrust response:', {
      issues: validationResult.error.issues,
      rawResult,
    });
    throw new Error('Invalid response from AI model');
  }

  const result = validationResult.data;
  const duration = Date.now() - startTime;

  console.log('Draft generated:', {
    duration,
    threadSubject: input.thread_subject,
    messageCount: input.messages.length,
    hasCc: result.cc.length > 0,
    ccCount: result.cc.length,
  });

  return result;
});

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const result = DraftRequestSchema.safeParse(body);

    if (!result.success) {
      console.error('Request validation failed:', result.error.issues);

      return NextResponse.json(
        { error: 'Invalid request', details: result.error.issues },
        { status: 400 }
      );
    }

    const { threadId, subject, messages, instructions, latestMessageId } =
      result.data;

    console.log('Draft generation request:', {
      threadId,
      subject,
      messageCount: messages.length,
      instructionsLength: instructions.length,
    });

    // Get reply recipients (last message sender)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      console.error('Thread has no messages:', { threadId });

      return NextResponse.json(
        { error: 'Thread has no messages' },
        { status: 400 }
      );
    }

    // Generate draft via Braintrust with tracing
    const draftResponse = await generateEmailDraft({
      thread_subject: subject,
      messages: messages.map((m) => ({
        from: m.from[0]?.email || 'unknown',
        to: m.to.map((p) => p.email).join(', '),
        date: new Date(m.date * 1000).toLocaleString(),
        body: m.body,
      })),
      user_instructions: instructions,
    });

    // Get current user's email for filtering history
    const grantRes = await fetch(
      `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        },
      }
    );

    let currentUserEmail = '';
    if (grantRes.ok) {
      const grant = await grantRes.json();
      currentUserEmail = grant.data?.email || '';
    }

    // Format thread history and append to body
    const history = formatThreadHistory(messages, currentUserEmail);
    const fullBody = history ? `${draftResponse.body}\n\n${history}` : draftResponse.body;

    const duration = Date.now() - startTime;

    console.log('Draft generation completed:', {
      duration,
      threadSubject: subject,
      instructions,
      to: draftResponse.to,
      cc: draftResponse.cc,
      hasCc: Array.isArray(draftResponse.cc) && draftResponse.cc.length > 0,
      ccCount: Array.isArray(draftResponse.cc) ? draftResponse.cc.length : 0,
      historyLength: history.length,
    });

    // Return structured response with to, cc, and body (with history)
    return NextResponse.json({
      success: true,
      to: draftResponse.to,
      cc: draftResponse.cc,
      body: fullBody,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('Draft generation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      duration,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to generate draft',
      },
      { status: 500 }
    );
  }
}
