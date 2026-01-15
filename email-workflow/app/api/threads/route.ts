import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Nylas API response types
interface NylasThreadResponse {
  data: {
    id: string;
    message_ids: string[];
  };
}

interface NylasMessageResponse {
  data: {
    folders?: string[];
  };
}

const UpdateLabelsSchema = z.object({
  threadId: z.string(),
  addLabels: z.array(z.string()),
  removeLabels: z.array(z.string()),
});

const CONCURRENCY_LIMIT = 5;

async function batchedParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function POST(request: Request) {
  try {
    // Validate environment variables
    const nylasApiKey = process.env.NYLAS_API_KEY;
    const nylasGrantId = process.env.NYLAS_GRANT_ID;

    if (!nylasApiKey || !nylasGrantId) {
      console.error('Missing required Nylas environment variables');
      return NextResponse.json(
        { error: 'Service configuration error' },
        { status: 500 }
      );
    }

    // Validate request body
    const body = await request.json();
    const result = UpdateLabelsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.issues },
        { status: 400 }
      );
    }

    const { threadId, addLabels, removeLabels } = result.data;
    const headers = { Authorization: `Bearer ${nylasApiKey}` };

    // Get thread to fetch message IDs
    const threadRes = await fetch(
      `https://api.us.nylas.com/v3/grants/${nylasGrantId}/threads/${threadId}`,
      { headers }
    );

    if (!threadRes.ok) {
      const error = await threadRes.text();
      console.error('Failed to fetch thread:', error);
      throw new Error('Failed to fetch thread');
    }

    const thread: NylasThreadResponse = await threadRes.json();
    const messageIds = thread.data.message_ids;

    // Fetch all messages in parallel batches
    // Note: Nylas API uses 'folders' not 'labels', and folders is string[] not {id}[]
    const messageResults = await batchedParallel(
      messageIds,
      async (msgId: string) => {
        const res = await fetch(
          `https://api.us.nylas.com/v3/grants/${nylasGrantId}/messages/${msgId}?select=folders`,
          { headers }
        );
        if (!res.ok) {
          console.error(`Failed to fetch message ${msgId}`);
          return null;
        }
        const msg: NylasMessageResponse = await res.json();
        return { msgId, folders: msg.data.folders || [] };
      },
      CONCURRENCY_LIMIT
    );

    // Calculate updates (skip unchanged)
    const updates: { msgId: string; newFolders: string[] }[] = [];

    for (const result of messageResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;

      const { msgId, folders: currentFolders } = result.value;
      const newFolders = currentFolders
        .filter((f) => !removeLabels.includes(f))
        .concat(addLabels.filter((l) => !currentFolders.includes(l)));

      // Skip if no change
      const changed =
        newFolders.length !== currentFolders.length ||
        !newFolders.every((f) => currentFolders.includes(f));

      if (changed) {
        updates.push({ msgId, newFolders });
      }
    }

    // Execute updates in parallel batches
    await batchedParallel(
      updates,
      async ({ msgId, newFolders }) => {
        const res = await fetch(
          `https://api.us.nylas.com/v3/grants/${nylasGrantId}/messages/${msgId}`,
          {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ folders: newFolders }),
          }
        );
        if (!res.ok) {
          console.error(`Failed to update folders for message ${msgId}`);
        }
        return res;
      },
      CONCURRENCY_LIMIT
    );

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
