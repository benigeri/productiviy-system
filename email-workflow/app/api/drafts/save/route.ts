import { NextResponse } from 'next/server';
import { z } from 'zod';

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
    const result = SaveDraftSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.issues },
        { status: 400 }
      );
    }

    const { threadId, subject, draftBody, to, cc, latestMessageId } =
      result.data;

    // Get current user's email from Nylas grant to filter from CC
    const grantRes = await fetch(
      `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
        },
      }
    );

    if (!grantRes.ok) {
      console.warn('Failed to fetch grant details, using CC as-is');
    }

    const grant = grantRes.ok ? await grantRes.json() : null;
    const userEmail = grant?.data?.email;

    // Filter current user from CC to avoid duplicate recipients
    const filteredCc = userEmail
      ? cc.filter((recipient) => recipient.email !== userEmail)
      : cc;

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
          cc: filteredCc,
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

    // Update thread labels (remove to-respond-paul, add drafted) with retry logic
    let labelUpdateSuccess = false;
    let labelUpdateError: string | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const labelRes = await fetch(
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

        if (labelRes.ok) {
          labelUpdateSuccess = true;
          break;
        } else {
          const errorText = await labelRes.text();
          labelUpdateError = `Label update failed (attempt ${attempt}/${maxRetries}): ${errorText}`;
          console.warn(labelUpdateError);

          // Exponential backoff: wait 100ms, 200ms, 400ms
          if (attempt < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, 100 * Math.pow(2, attempt - 1))
            );
          }
        }
      } catch (err) {
        labelUpdateError = `Label update error (attempt ${attempt}/${maxRetries}): ${
          err instanceof Error ? err.message : 'Unknown error'
        }`;
        console.warn(labelUpdateError);

        // Exponential backoff before retry
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * Math.pow(2, attempt - 1))
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      draftId: draft.data.id,
      warning: labelUpdateSuccess
        ? undefined
        : 'Draft saved but labels could not be updated. Please manually remove "to-respond-paul" label.',
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
