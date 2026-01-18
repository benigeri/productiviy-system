import { NextResponse } from 'next/server';
import { marked } from 'marked';
import { z } from 'zod';
import {
  getLabelDrafted,
  getLabelRespond,
  getLabelReview,
} from '@/lib/gmail-labels';

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

interface NylasMessageResponse {
  data: {
    body?: string;
    from?: Array<{ name?: string; email: string }>;
    date?: number;
  };
}

// Helper to escape HTML in user-generated content
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Extract just the reply text from draft body (before any quoted section)
export function extractReplyText(draftBody: string): string {
  const lines = draftBody.split('\n');
  const replyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop when we hit the quote attribution line
    if (trimmed.startsWith('On ') && trimmed.includes('wrote:')) {
      break;
    }

    // Stop when we hit quoted lines (> prefix)
    if (trimmed.startsWith('>')) {
      break;
    }

    replyLines.push(line);
  }

  return replyLines.join('\n').trim();
}

/**
 * Build Gmail-native quoted reply HTML for proper quote collapsing.
 *
 * CRITICAL LEARNINGS (from reverse-engineering Superhuman's email structure):
 *
 * 1. Use simple structure - NO gmail_extra or gmail_attr wrappers
 *    - ❌ <div class="gmail_extra"><div class="gmail_quote"><div class="gmail_attr">
 *    - ✅ <div class="gmail_quote">attribution<blockquote>
 *
 * 2. Original HTML must be preserved EXACTLY as received
 *    - Don't convert to markdown then back to HTML
 *    - Don't escape or modify the original message content
 *    - The blockquote contains the raw original HTML unchanged
 *
 * 3. Attribution format matters
 *    - Email wrapped in: <span dir="ltr"><a href="mailto:...">email</a></span>
 *    - Plain text attribution directly in gmail_quote div (no wrapper div)
 *
 * 4. Blockquote style uses shorthand values
 *    - margin:0 0 0 .8ex (not 0px)
 *    - border-left:1px #ccc solid (not rgb(204,204,204))
 */
export function buildGmailQuotedReplyWithHtml(
  replyText: string,
  originalMessageHtml: string,
  originalSender: { name?: string; email: string },
  originalDate: number
): string {
  // Convert reply to HTML via markdown (handles escaping)
  // breaks: true preserves single newlines (e.g., "Thanks,\nPaul")
  const replyHtml = marked.parse(replyText, { breaks: true }) as string;

  // Format attribution line
  const date = new Date(originalDate * 1000);
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
  const senderName = escapeHtml(originalSender.name || originalSender.email);
  const senderEmail = escapeHtml(originalSender.email);

  // Superhuman-compatible structure - original HTML preserved unchanged in blockquote
  return `<div dir="ltr">${replyHtml}</div><br/><div class="gmail_quote">On ${dateStr} at ${timeStr}, ${senderName} <span dir="ltr">&lt;<a href="mailto:${senderEmail}">${senderEmail}</a>&gt;</span> wrote:<br/><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${originalMessageHtml}</blockquote></div>`;
}

// Fallback function when original message HTML is unavailable
// Returns simple HTML without quote structure (won't collapse, but functional)
export function buildSimpleReplyHtml(draftBody: string): string {
  const replyText = extractReplyText(draftBody);
  const replyHtml = marked.parse(replyText, { breaks: true }) as string;
  return `<div dir="ltr">${replyHtml}</div>`;
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

    console.log('Save API received request:', {
      threadId,
      subject: subject.slice(0, 50),
      draftBodyPreview: draftBody.slice(0, 200),
      to: to.map(r => r.email),
      cc: cc.map(r => r.email),
      toCount: to.length,
      ccCount: cc.length,
    });

    // Fetch grant info and original message in parallel (with timeout)
    const API_TIMEOUT_MS = 5000;
    const nylasHeaders = { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` };

    const [grantRes, originalMsgRes] = await Promise.all([
      // Get current user's email from Nylas grant to filter from CC
      fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}`,
        { headers: nylasHeaders }
      ),
      // Fetch the original message to get its HTML body for proper quote collapsing
      fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/${latestMessageId}`,
        { headers: nylasHeaders, signal: AbortSignal.timeout(API_TIMEOUT_MS) }
      ).catch((err) => {
        console.warn('Original message fetch failed:', err.message);
        return null;
      }),
    ]);

    // Process grant response for CC filtering
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

    let htmlBody: string;

    if (originalMsgRes?.ok) {
      const originalMsg: NylasMessageResponse = await originalMsgRes.json();
      const originalHtml = originalMsg.data?.body || '';
      const originalSender = originalMsg.data?.from?.[0] || { email: 'unknown@example.com' };
      const originalDate = originalMsg.data?.date || Math.floor(Date.now() / 1000);

      // Extract just the reply text (before quoted section)
      const replyText = extractReplyText(draftBody);

      // Build HTML with original message HTML in blockquote
      htmlBody = buildGmailQuotedReplyWithHtml(
        replyText,
        originalHtml,
        originalSender,
        originalDate
      );

      console.log('Using original message HTML for quote collapsing:', {
        originalMessageId: latestMessageId,
        originalSender: originalSender.email,
        originalHtmlLength: originalHtml.length,
      });
    } else {
      // Fallback to simple HTML if we can't fetch original message (quote won't collapse)
      console.warn('Could not fetch original message, using simple HTML fallback');
      htmlBody = buildSimpleReplyHtml(draftBody);
    }

    console.log('Saving draft to Nylas:', {
      threadId,
      latestMessageId,
      to: to.map(r => r.email),
      cc: filteredCc.map(r => r.email),
      bodyLines: draftBody.split('\n').length,
      subject: `Re: ${subject}`,
      plainTextPreview: draftBody.slice(0, 200),
      htmlPreview: htmlBody.slice(0, 500),
      isHtml: htmlBody.includes('<div class="gmail_quote">'),
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
            // Use server-side env var instead of client-controlled Origin header (SSRF prevention)
            const baseUrl = process.env.APP_URL || 'http://localhost:3000';
            const labelRes = await fetch(
              `${baseUrl}/api/threads`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  threadId,
                  addLabels: [getLabelDrafted()],
                  removeLabels: [getLabelRespond(), getLabelReview()],
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
        : 'Draft saved but labels could not be updated. Please manually remove "wf_respond" label.',
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
        errorCode: 'DRAFT_SAVE_FAILED',
      },
      { status: 500 }
    );
  }
}
