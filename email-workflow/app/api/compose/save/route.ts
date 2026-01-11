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

const SaveComposeSchema = z.object({
  subject: z.string().min(1).max(200),
  draftBody: z.string().min(1).max(50000),
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).default([]),
});

export async function POST(request: Request) {
  try {
    // Parse and validate request
    const body = await request.json();
    const result = SaveComposeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.issues },
        { status: 400 }
      );
    }

    const { subject, draftBody, to, cc } = result.data;

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
      ? cc.filter((email) => email !== userEmail)
      : cc;

    // Convert To array (strings) to Nylas format with email objects
    const toRecipients = to.map((email) => ({ email }));

    // Convert CC array (strings) to Nylas format with email objects
    const ccRecipients = filteredCc.map((email) => ({ email }));

    // Convert plain text line breaks to HTML for better Gmail rendering
    const htmlBody = draftBody
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `<p>${line}</p>`)
      .join('');

    console.log('Saving compose draft to Nylas:', {
      to: toRecipients.map((r) => r.email),
      cc: ccRecipients.map((r) => r.email),
      bodyLines: draftBody.split('\n').length,
      subject,
    });

    // Save draft to Gmail via Nylas (NO reply_to_message_id for compose)
    const draftRes = await fetch(
      `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/drafts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject, // Plain subject (NOT "Re: ...")
          body: htmlBody,
          to: toRecipients,
          cc: ccRecipients,
          // NO reply_to_message_id or thread_id for compose
        }),
      }
    );

    if (!draftRes.ok) {
      const error = await draftRes.text();
      console.error('Nylas draft creation failed:', error);
      throw new Error('Failed to save draft to Gmail');
    }

    const draft: NylasDraftResponse = await draftRes.json();

    return NextResponse.json({
      success: true,
      draftId: draft.data.id,
    });
  } catch (error) {
    console.error('Compose draft save error:', {
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
