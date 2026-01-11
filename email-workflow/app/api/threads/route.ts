import { NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateLabelsSchema = z.object({
  threadId: z.string(),
  addLabels: z.array(z.string()),
  removeLabels: z.array(z.string()),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { threadId, addLabels, removeLabels } =
      UpdateLabelsSchema.parse(body);

    // Get thread to fetch message IDs
    const threadRes = await fetch(
      `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/threads/${threadId}`,
      {
        headers: { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` },
      }
    );

    if (!threadRes.ok) {
      const error = await threadRes.text();
      console.error('Failed to fetch thread:', error);
      throw new Error('Failed to fetch thread');
    }

    const thread = await threadRes.json();
    const messageIds = thread.data.message_ids;

    // Update labels on all messages
    for (const msgId of messageIds) {
      // Get current labels
      const msgRes = await fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/${msgId}?select=labels`,
        {
          headers: { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` },
        }
      );

      if (!msgRes.ok) {
        console.error(`Failed to fetch message ${msgId}`);
        continue; // Skip this message but continue with others
      }

      const msg = await msgRes.json();
      const currentLabels =
        msg.data.labels?.map((l: { id: string }) => l.id) || [];

      // Calculate new labels
      const newLabels = currentLabels
        .filter((l: string) => !removeLabels.includes(l))
        .concat(addLabels.filter((l) => !currentLabels.includes(l)));

      // Update message
      const updateRes = await fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/${msgId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ labels: newLabels }),
        }
      );

      if (!updateRes.ok) {
        console.error(
          `Failed to update labels for message ${msgId}:`,
          await updateRes.text()
        );
        // Continue with other messages even if one fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Label update error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      { error: 'Failed to update labels' },
      { status: 500 }
    );
  }
}
