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

// Format thread history as Gmail-style quoted text
function formatThreadHistory(
  messages: Array<{
    from: Array<{ name?: string; email: string }>;
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

      // Quote each line with >
      const quotedLines = msg.body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

      return `On ${dateStr} at ${timeStr} ${sender.name || sender.email} <${sender.email}> wrote:\n${quotedLines}`;
    })
    .join('\n\n');
}

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

    // Format thread history
    const currentUserEmail = process.env.USER_EMAIL || process.env.NYLAS_USER_EMAIL || '';
    const threadHistory = formatThreadHistory(messages, currentUserEmail);

    // Combine AI response with quoted history
    const fullBody = threadHistory
      ? `${draftBody}\n\n${threadHistory}`
      : draftBody;

    // Return draft body only - no Gmail save or label updates yet
    return NextResponse.json({
      success: true,
      body: fullBody,
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
