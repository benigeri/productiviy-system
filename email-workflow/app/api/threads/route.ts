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

    // Update folders on all messages
    // Note: Nylas API uses 'folders' not 'labels', and folders is string[] not {id}[]
    for (const msgId of messageIds) {
      // Get current folders
      const msgRes = await fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/${msgId}?select=folders`,
        {
          headers: { Authorization: `Bearer ${process.env.NYLAS_API_KEY}` },
        }
      );

      if (!msgRes.ok) {
        console.error(`Failed to fetch message ${msgId}`);
        continue; // Skip this message but continue with others
      }

      const msg = await msgRes.json();
      // Nylas API returns folders as string[] directly
      const currentFolders: string[] = msg.data.folders || [];

      // Calculate new folders
      const newFolders = currentFolders
        .filter((f: string) => !removeLabels.includes(f))
        .concat(addLabels.filter((l) => !currentFolders.includes(l)));

      // Update message with new folders
      const updateRes = await fetch(
        `https://api.us.nylas.com/v3/grants/${process.env.NYLAS_GRANT_ID}/messages/${msgId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${process.env.NYLAS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ folders: newFolders }),
        }
      );

      if (!updateRes.ok) {
        console.error(
          `Failed to update folders for message ${msgId}:`,
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
