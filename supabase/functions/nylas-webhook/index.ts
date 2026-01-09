/**
 * Nylas webhook handler for email workflow automation.
 * Handles label changes and ensures only one workflow label is active at a time.
 */

import type {
  NylasFolder,
  NylasMessage,
  NylasThread,
  NylasWebhookPayload,
} from "../_shared/lib/nylas-types.ts";
import {
  getHighestPriorityLabel,
  getWorkflowLabels,
  removeWorkflowLabels,
} from "../_shared/lib/workflow-labels.ts";
import {
  createNylasClient,
  verifyNylasSignature,
} from "../_shared/lib/nylas.ts";

/**
 * Dependencies for the webhook handler.
 */
export interface WebhookDeps {
  verifySignature: (signature: string, body: string) => Promise<boolean>;
  getMessage: (messageId: string) => Promise<NylasMessage>;
  getThread: (threadId: string) => Promise<NylasThread>;
  getFolders: () => Promise<NylasFolder[]>;
  updateMessageFolders: (
    messageId: string,
    folders: string[],
  ) => Promise<NylasMessage>;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Build lookup maps between folder IDs and names.
 */
function buildFolderMaps(folders: NylasFolder[]): {
  idToName: Map<string, string>;
  nameToId: Map<string, string>;
} {
  const idToName = new Map<string, string>();
  const nameToId = new Map<string, string>();
  for (const folder of folders) {
    idToName.set(folder.id, folder.name);
    nameToId.set(folder.name, folder.id);
  }
  return { idToName, nameToId };
}

/**
 * Helper to remove all workflow labels from a message.
 * Returns true if an update was made.
 */
async function clearWorkflowLabels(
  message: NylasMessage,
  idToName: Map<string, string>,
  nameToId: Map<string, string>,
  deps: WebhookDeps,
): Promise<boolean> {
  const folderNames = message.folders.map((id) => idToName.get(id) ?? id);
  const workflowLabels = getWorkflowLabels(folderNames);

  if (workflowLabels.length === 0) {
    return false;
  }

  // Remove all workflow labels
  const newFolderNames = removeWorkflowLabels(folderNames);
  const newFolderIds = newFolderNames.map((name) => nameToId.get(name) ?? name);

  await deps.updateMessageFolders(message.id, newFolderIds);
  return true;
}

/**
 * Process a message update event.
 * Handles: deduplication (multiple workflow labels) and archive (no INBOX).
 */
async function processMessageUpdate(
  messageId: string,
  deps: WebhookDeps,
): Promise<boolean> {
  const [message, folders] = await Promise.all([
    deps.getMessage(messageId),
    deps.getFolders(),
  ]);

  const { idToName, nameToId } = buildFolderMaps(folders);
  const folderNames = message.folders.map((id) => idToName.get(id) ?? id);
  const workflowLabels = getWorkflowLabels(folderNames);

  // No workflow labels - nothing to do
  if (workflowLabels.length === 0) {
    return false;
  }

  // Archive detection: has workflow labels but no INBOX → clear all
  const hasInbox = folderNames.includes("INBOX");
  if (!hasInbox) {
    return clearWorkflowLabels(message, idToName, nameToId, deps);
  }

  // Deduplication: multiple workflow labels → keep highest priority
  if (workflowLabels.length > 1) {
    const highestPriority = getHighestPriorityLabel(workflowLabels);
    if (highestPriority) {
      const newFolderNames = removeWorkflowLabels(folderNames, highestPriority);
      const newFolderIds = newFolderNames.map((name) =>
        nameToId.get(name) ?? name
      );
      await deps.updateMessageFolders(messageId, newFolderIds);
      return true;
    }
  }

  return false;
}

/**
 * Process a message created event (new message sent).
 * If sent message is a reply, clear workflow labels from entire thread.
 */
async function processMessageCreated(
  messageId: string,
  deps: WebhookDeps,
): Promise<boolean> {
  const [message, folders] = await Promise.all([
    deps.getMessage(messageId),
    deps.getFolders(),
  ]);

  const { idToName, nameToId } = buildFolderMaps(folders);
  const folderNames = message.folders.map((id) => idToName.get(id) ?? id);

  // Only process sent messages
  const isSent = folderNames.includes("SENT");
  if (!isSent) {
    // Not a sent message - check for deduplication/archive like message.updated
    return processMessageUpdate(messageId, deps);
  }

  // Get thread to find all messages
  const thread = await deps.getThread(message.thread_id);

  // Clear workflow labels from ALL messages in thread (including the sent one)
  // This handles the case where a draft with "drafted" label becomes a sent message
  let updated = false;
  for (const threadMessageId of thread.message_ids) {
    const threadMessage = threadMessageId === messageId
      ? message  // Reuse already-fetched message
      : await deps.getMessage(threadMessageId);
    const cleared = await clearWorkflowLabels(
      threadMessage,
      idToName,
      nameToId,
      deps,
    );
    if (cleared) updated = true;
  }

  return updated;
}

/**
 * Main webhook handler.
 */
export async function handleWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Response> {
  const url = new URL(request.url);

  // Handle challenge verification (Nylas webhook registration)
  const challenge = url.searchParams.get("challenge");
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }

  // Get signature and body for verification
  const signature = request.headers.get("x-nylas-signature") ?? "";
  const body = await request.text();

  // Verify signature
  const isValid = await deps.verifySignature(signature, body);
  if (!isValid) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  try {
    const payload: NylasWebhookPayload = JSON.parse(body);
    const messageId = payload.data.object.id;

    // Route based on event type
    if (payload.type === "message.created") {
      await processMessageCreated(messageId, deps);
      return jsonResponse({ ok: true, action: "message.created" });
    }

    if (payload.type === "message.updated") {
      await processMessageUpdate(messageId, deps);
      return jsonResponse({ ok: true, action: "message.updated" });
    }

    // Unknown event type - skip
    return jsonResponse({ ok: true, skipped: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}

// Production handler - only runs when invoked directly by Supabase Edge Functions
if (import.meta.main) {
  Deno.serve((req) => {
    const apiKey = Deno.env.get("NYLAS_API_KEY") ?? "";
    const grantId = Deno.env.get("NYLAS_GRANT_ID") ?? "";
    const webhookSecret = Deno.env.get("NYLAS_WEBHOOK_SECRET") ?? "";

    const client = createNylasClient(apiKey, grantId);

    const deps: WebhookDeps = {
      verifySignature: (signature, body) =>
        verifyNylasSignature(signature, body, webhookSecret),
      getMessage: (id) => client.getMessage(id),
      getThread: (id) => client.getThread(id),
      getFolders: () => client.getFolders(),
      updateMessageFolders: (id, folders) =>
        client.updateMessageFolders(id, folders),
    };

    return handleWebhook(req, deps);
  });
}
