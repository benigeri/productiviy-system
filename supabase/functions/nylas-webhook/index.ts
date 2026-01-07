/**
 * Nylas webhook handler for email workflow automation.
 * Handles label changes and ensures only one workflow label is active at a time.
 */

import type {
  NylasMessage,
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
 * Process a message and ensure only one workflow label is active.
 * Returns true if an update was made.
 */
async function processMessage(
  messageId: string,
  deps: WebhookDeps,
): Promise<boolean> {
  const message = await deps.getMessage(messageId);
  const workflowLabels = getWorkflowLabels(message.folders);

  // No workflow labels or only one - nothing to do
  if (workflowLabels.length <= 1) {
    return false;
  }

  // Multiple workflow labels - keep only the highest priority one
  const highestPriority = getHighestPriorityLabel(workflowLabels);
  if (!highestPriority) {
    return false;
  }

  // Remove other workflow labels, keep the highest priority one
  const newFolders = removeWorkflowLabels(message.folders, highestPriority);

  await deps.updateMessageFolders(messageId, newFolders);
  return true;
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

    // Only process message events
    if (
      payload.type !== "message.created" && payload.type !== "message.updated"
    ) {
      return jsonResponse({ ok: true, skipped: true });
    }

    const messageId = payload.data.object.id;

    // Process the message
    await processMessage(messageId, deps);

    return jsonResponse({ ok: true });
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
      updateMessageFolders: (id, folders) =>
        client.updateMessageFolders(id, folders),
    };

    return handleWebhook(req, deps);
  });
}
