import { NextResponse } from 'next/server';
import { z } from 'zod';

// Type definitions for Nylas API responses
interface NylasGrantResponse {
  data: {
    email: string;
    id: string;
  };
}

interface NylasDraftResponse {
  data: {
    id: string;
  };
}

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

    const grant: NylasGrantResponse | null = grantRes.ok
      ? await grantRes.json()
      : null;
    const userEmail = grant?.data?.email;

    // Filter current user from CC to avoid duplicate recipients
    const filteredCc = userEmail
      ? cc.filter((recipient) => recipient.email !== userEmail)
      : cc;

    // Convert plain text line breaks to HTML for better Gmail rendering
    // Nylas supports both plain text with \n and HTML, but explicit HTML gives us more control
    const htmlBody = draftBody
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => `<p>${line}</p>`)
      .join('');

    console.log('Saving draft to Nylas:', {
      threadId,
      latestMessageId,
      to: to.map(r => r.email),
      cc: filteredCc.map(r => r.email),
      bodyLines: draftBody.split('\n').length,
      subject: `Re: ${subject}`,
    });

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
          body: htmlBody,
          to,
          cc: filteredCc,
          reply_to_message_id: latestMessageId,
          thread_id: threadId, // Maintain thread structure in Gmail
        }),
      }
    );

    if (!draftRes.ok) {
      const error = await draftRes.text();
      console.error('Nylas draft creation failed:', error);
      throw new Error('Failed to save draft to Gmail');
    }

    // Parallelize draft save JSON parsing and label update
    // Use Promise.allSettled to run both independently
    const [draftResult, labelResult] = await Promise.allSettled<
      [Promise<NylasDraftResponse>, Promise<{ success: boolean }>]
    >([
      // Parse draft JSON
      draftRes.json() as Promise<NylasDraftResponse>,

      // Update thread labels with retry logic (runs in parallel)
      (async () => {
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
              return { success: true };
            }

            const errorText = await labelRes.text();
            console.warn(
              `Label update failed (attempt ${attempt}/${maxRetries}): ${errorText}`
            );

            // Exponential backoff before retry
            if (attempt < maxRetries) {
              await new Promise((resolve) =>
                setTimeout(resolve, 100 * Math.pow(2, attempt - 1))
              );
            }
          } catch (err) {
            console.warn(
              `Label update error (attempt ${attempt}/${maxRetries}): ${
                err instanceof Error ? err.message : 'Unknown error'
              }`
            );

            // Exponential backoff before retry
            if (attempt < maxRetries) {
              await new Promise((resolve) =>
                setTimeout(resolve, 100 * Math.pow(2, attempt - 1))
              );
            }
          }
        }
        throw new Error('Label update failed after all retries');
      })(),
    ]);

    // Check if draft parsing succeeded
    if (draftResult.status === 'rejected') {
      throw new Error('Failed to parse draft response');
    }
    const draft = draftResult.value;

    // Check label update result
    const labelUpdateSuccess = labelResult.status === 'fulfilled';

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
