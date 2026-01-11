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

const SaveDraftSchema = z.object({
  threadId: z.string().min(1),
  subject: z.string(),
  draftBody: z.string().min(1),
  to: z.array(z.object({ name: z.string().optional(), email: z.string() })),
  cc: z.array(z.object({ name: z.string().optional(), email: z.string() })),
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

    // Generate draft via Braintrust
    const draftBody = await invoke({
      projectName: process.env.BRAINTRUST_PROJECT_NAME!,
      slug: process.env.BRAINTRUST_DRAFT_SLUG!,
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

export async function PUT(request: Request) {
  try {
    // Parse and validate request
    const body = await request.json();
    const result = SaveDraftSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.issues },
        { status: 400 }
      );
    }

    const { threadId, subject, draftBody, to, cc, latestMessageId } =
      result.data;

    // Save draft to Gmail via Nylas
    const draftRes = await fetch(
      `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/drafts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: `Re: ${subject}`,
          body: draftBody,
          to,
          cc,
          reply_to_message_id: latestMessageId,
        }),
      }
    );

    if (!draftRes.ok) {
      const error = await draftRes.text();
      console.error('Nylas draft creation failed:', error);
      throw new Error('Failed to save draft to Gmail');
    }

    const draft = await draftRes.json();

    // Update thread labels (remove to-respond-paul, add drafted)
    await fetch(
      `${request.headers.get('origin') || 'http://localhost:3000'}/api/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          addLabels: ['Label_215'], // drafted label
          removeLabels: ['Label_139'], // to-respond-paul label
        }),
      }
    );

    return NextResponse.json({
      success: true,
      draftId: draft.data.id,
    });
  } catch (error) {
    console.error('Draft save error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to save draft',
      },
      { status: 500 }
    );
  }
}
