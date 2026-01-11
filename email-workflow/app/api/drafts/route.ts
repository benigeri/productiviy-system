import 'server-only';
import { NextResponse } from 'next/server';
import { invoke, wrapTraced, initLogger } from 'braintrust';
import { z } from 'zod';

// Initialize Braintrust logger
const logger = initLogger({
  projectName: process.env.BRAINTRUST_PROJECT_NAME,
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

// Type for Braintrust response
type DraftResponse = {
  to: string[];
  cc: string[];
  body: string;
};

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

  const result = await invoke({
    projectName,
    slug: draftSlug,
    input: {
      user_input: JSON.stringify(input),
    },
  }) as DraftResponse;

  const duration = Date.now() - startTime;

  console.log('Draft generated:', {
    duration,
    threadSubject: input.thread_subject,
    messageCount: input.messages.length,
    hasCc: Array.isArray(result.cc) && result.cc.length > 0,
    ccCount: Array.isArray(result.cc) ? result.cc.length : 0,
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

    const duration = Date.now() - startTime;

    console.log('Draft generation completed:', {
      duration,
      hasCc: Array.isArray(draftResponse.cc) && draftResponse.cc.length > 0,
      ccCount: Array.isArray(draftResponse.cc) ? draftResponse.cc.length : 0,
    });

    // Return structured response with to, cc, and body
    return NextResponse.json({
      success: true,
      to: draftResponse.to,
      cc: draftResponse.cc,
      body: draftResponse.body,
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
