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

// Request validation schema
const ComposeRequestSchema = z.object({
  instructions: z.string().min(1).max(5000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

// Response validation schema (security fix - validates AI response)
const ComposeResponseSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  to: z.array(z.string().email()).min(0).max(20), // Validate email format
  cc: z.array(z.string().email()).default([]),
});

type ComposeResponse = z.infer<typeof ComposeResponseSchema>;

// Wrapped function for Braintrust tracing
const generateComposeEmail = wrapTraced(async function generateComposeEmail(input: {
  user_instructions: string;
  previous_draft?: string;
  conversation_history?: string;
}): Promise<ComposeResponse> {
  const projectName = process.env.BRAINTRUST_PROJECT_NAME;
  const composeSlug = process.env.BRAINTRUST_COMPOSE_SLUG || 'email-compose-v1';

  if (!projectName) {
    throw new Error('Missing Braintrust configuration');
  }

  const startTime = Date.now();

  const rawResult = await invoke({
    projectName,
    slug: composeSlug,
    input: {
      user_input: JSON.stringify(input),
    },
  });

  // Validate Braintrust response structure (security fix)
  const validationResult = ComposeResponseSchema.safeParse(rawResult);
  if (!validationResult.success) {
    console.error('Invalid Braintrust response:', {
      issues: validationResult.error.issues,
      rawResult,
    });
    throw new Error('AI returned invalid response format');
  }

  const result = validationResult.data;
  const duration = Date.now() - startTime;

  console.log('Compose email generated:', {
    duration,
    subject: result.subject,
    toCount: result.to.length,
    ccCount: result.cc.length,
    instructionsLength: input.user_instructions.length,
  });

  return result;
});

export async function POST(request: Request) {
  const startTime = Date.now();

  // Validate required environment variables
  const projectName = process.env.BRAINTRUST_PROJECT_NAME;
  const apiKey = process.env.BRAINTRUST_API_KEY;
  const composeSlug = process.env.BRAINTRUST_COMPOSE_SLUG;

  if (!projectName || !apiKey || !composeSlug) {
    console.error('Missing required Braintrust environment variables:', {
      hasProjectName: !!projectName,
      hasApiKey: !!apiKey,
      hasComposeSlug: !!composeSlug,
    });
    return NextResponse.json(
      { error: 'Service configuration error. Please contact support.' },
      { status: 500 }
    );
  }

  try {
    // Parse and validate request
    const body = await request.json();
    const result = ComposeRequestSchema.safeParse(body);

    if (!result.success) {
      console.error('Request validation failed:', result.error.issues);

      return NextResponse.json(
        { error: 'Invalid request', details: result.error.issues },
        { status: 400 }
      );
    }

    const { instructions, conversationHistory } = result.data;

    console.log('Compose request:', {
      instructionsLength: instructions.length,
      hasHistory: !!conversationHistory?.length,
      historyLength: conversationHistory?.length || 0,
    });

    // Build conversation history string if provided
    const conversationHistoryString = conversationHistory
      ? conversationHistory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join('\n\n')
      : undefined;

    // Generate email via Braintrust with tracing
    const composeResponse = await generateComposeEmail({
      user_instructions: instructions,
      conversation_history: conversationHistoryString,
    });

    const duration = Date.now() - startTime;

    console.log('Compose generation completed:', {
      duration,
      subject: composeResponse.subject,
      to: composeResponse.to,
      cc: composeResponse.cc,
      bodyLength: composeResponse.body.length,
    });

    // Return structured response with subject, to, cc, and body
    return NextResponse.json({
      success: true,
      subject: composeResponse.subject,
      to: composeResponse.to,
      cc: composeResponse.cc,
      body: composeResponse.body,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('Compose generation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      duration,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to generate email',
      },
      { status: 500 }
    );
  }
}
