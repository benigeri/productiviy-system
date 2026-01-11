import { NextResponse } from 'next/server';
import { invoke } from 'braintrust';
import { z } from 'zod';

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

export async function POST(request: Request) {
  try {
    // Parse and validate request
    const body = await request.json();
    const result = DraftRequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.issues },
        { status: 400 }
      );
    }

    const { threadId, subject, messages, instructions, latestMessageId } =
      result.data;

    // Get reply recipients (last message sender)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return NextResponse.json(
        { error: 'Thread has no messages' },
        { status: 400 }
      );
    }

    // Validate required environment variables
    const projectName = process.env.BRAINTRUST_PROJECT_NAME;
    const draftSlug = process.env.BRAINTRUST_DRAFT_SLUG;

    if (!projectName || !draftSlug) {
      console.error('Missing required Braintrust configuration');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Generate draft via Braintrust
    const draftBody = await invoke({
      projectName,
      slug: draftSlug,
      input: {
        thread_subject: subject,
        messages: messages.map((m) => ({
          from: m.from[0]?.email || 'unknown',
          to: m.to.map((p) => p.email).join(', '),
          date: new Date(m.date * 1000).toLocaleString(),
          body: m.body,
        })),
        user_instructions: instructions,
      },
    });

    // Return draft body only - no Gmail save or label updates yet
    return NextResponse.json({
      success: true,
      body: draftBody,
    });
  } catch (error) {
    console.error('Draft generation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
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
