/**
 * Nylas webhook handler for email workflow automation.
 * Handles label changes, ensures only one workflow label is active at a time,
 * and classifies incoming emails with ai_* labels.
 */

import type {
  NylasCleanMessage,
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
import { jsonResponse, errorResponse } from "../_shared/lib/http.ts";
import {
  classifyEmail,
  type ClassifierInput,
  type ClassifierResult,
} from "../_shared/lib/classifier.ts";

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
  getCleanMessages: (messageIds: string[]) => Promise<NylasCleanMessage[]>;
  // Classification dependencies (optional - only needed if classification is enabled)
  classify?: (input: ClassifierInput) => Promise<ClassifierResult>;
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
 * Accepts optional pre-fetched data to avoid duplicate API calls.
 */
async function processMessageUpdate(
  messageId: string,
  deps: WebhookDeps,
  prefetched?: { message: NylasMessage; folders: NylasFolder[] },
): Promise<boolean> {
  // Use prefetched data if available, otherwise fetch
  const [message, folders] = prefetched
    ? [prefetched.message, prefetched.folders]
    : await Promise.all([deps.getMessage(messageId), deps.getFolders()]);

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
 * Build classifier input from a message and its clean content.
 */
function buildClassifierInput(
  message: NylasMessage,
  cleanBody: string,
): ClassifierInput {
  return {
    subject: message.subject ?? "",
    from: message.from?.map((p) => p.email).join(", ") ?? "",
    to: message.to?.map((p) => p.email).join(", ") ?? "",
    cc: message.cc?.map((p) => p.email).join(", ") ?? "",
    date: new Date(message.date * 1000).toISOString().split("T")[0],
    body: cleanBody,
  };
}

/**
 * Process a received email for classification.
 * Calls the classifier and applies ai_* labels to the message.
 */
async function processReceivedMessage(
  message: NylasMessage,
  folders: NylasFolder[],
  deps: WebhookDeps,
): Promise<boolean> {
  // Skip if classification is not enabled
  if (!deps.classify) {
    return false;
  }

  const { idToName, nameToId } = buildFolderMaps(folders);

  try {
    // Get clean content for classification
    const cleanMessages = await deps.getCleanMessages([message.id]);
    const cleanBody = cleanMessages[0]?.body ?? message.snippet ?? "";

    // Build input and classify
    const input = buildClassifierInput(message, cleanBody);
    const result = await deps.classify(input);

    console.log(`Classification result for ${message.id}: ${JSON.stringify(result)}`);

    // Skip if no labels to apply
    if (result.labels.length === 0) {
      return false;
    }

    // Get current folder names
    const folderNames = message.folders.map((id) => idToName.get(id) ?? id);

    // Remove all existing ai_* labels, keep everything else
    const withoutAI = folderNames.filter((name) => !name.startsWith("ai_"));

    // Add new AI labels (only if they exist in Gmail)
    const validAILabels = result.labels.filter((name) => nameToId.has(name));
    if (validAILabels.length < result.labels.length) {
      const missing = result.labels.filter((name) => !nameToId.has(name));
      console.log(`Warning: Missing Gmail labels: ${missing.join(", ")}`);
    }
    const newFolderNames = [...withoutAI, ...validAILabels];

    // Convert back to IDs
    const newFolderIds = newFolderNames
      .map((name) => nameToId.get(name))
      .filter((id): id is string => id !== undefined);

    // Update only if changed
    const currentIds = message.folders.slice().sort();
    const newIds = newFolderIds.slice().sort();
    if (JSON.stringify(currentIds) !== JSON.stringify(newIds)) {
      await deps.updateMessageFolders(message.id, newFolderIds);
      return true;
    }

    return false;
  } catch (error) {
    // Re-throw classification errors so they're visible at the top level
    // This prevents silent failures that are indistinguishable from "no labels"
    console.error(`Classification error for ${message.id}:`, error);
    throw error;
  }
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

  // Check if sent or received message
  const isSent = folderNames.includes("SENT");
  if (!isSent) {
    // Received message - classify it, then check for deduplication/archive
    await processReceivedMessage(message, folders, deps);
    // Pass prefetched data to avoid duplicate API calls
    return processMessageUpdate(messageId, deps, { message, folders });
  }

  // Get thread to find all messages
  const thread = await deps.getThread(message.thread_id);

  // Fetch all thread messages in parallel (reuse already-fetched message)
  const otherMessageIds = thread.message_ids.filter((id) => id !== messageId);
  const otherMessages = await Promise.all(
    otherMessageIds.map((id) => deps.getMessage(id))
  );
  const allMessages = [message, ...otherMessages];

  // Clear workflow labels from ALL messages in thread (including the sent one)
  // This handles the case where a draft with "wf_drafted" label becomes a sent message
  const results = await Promise.all(
    allMessages.map((msg) => clearWorkflowLabels(msg, idToName, nameToId, deps))
  );

  return results.some((cleared) => cleared);
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
    return errorResponse("Invalid signature", "UNAUTHORIZED", 401);
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
    return errorResponse(message, "UNKNOWN_ERROR", 500);
  }
}

// Production handler - only runs when invoked directly by Supabase Edge Functions
if (import.meta.main) {
  // Dynamic import of braintrust to avoid issues when not available
  const braintrustModule = await import("npm:braintrust@0.0.182");
  const { invoke } = braintrustModule;

  Deno.serve((req) => {
    const apiKey = Deno.env.get("NYLAS_API_KEY") ?? "";
    const grantId = Deno.env.get("NYLAS_GRANT_ID") ?? "";
    const webhookSecret = Deno.env.get("NYLAS_WEBHOOK_SECRET") ?? "";
    const braintrustProjectName = Deno.env.get("BRAINTRUST_PROJECT_NAME") ?? "";
    const braintrustApiKey = Deno.env.get("BRAINTRUST_API_KEY") ?? "";
    const classifierSlug = Deno.env.get("BRAINTRUST_CLASSIFIER_SLUG") ?? "email-classifier-v1";

    const client = createNylasClient(apiKey, grantId);

    // Only enable classification if Braintrust is configured
    const classifyFn = braintrustApiKey && braintrustProjectName
      ? (input: ClassifierInput) =>
          classifyEmail(input, {
            invoke: (params) => invoke({
              ...params,
              // Braintrust uses BRAINTRUST_API_KEY env var automatically
            }),
            projectName: braintrustProjectName,
            classifierSlug,
          })
      : undefined;

    const deps: WebhookDeps = {
      verifySignature: (signature, body) =>
        verifyNylasSignature(signature, body, webhookSecret),
      getMessage: (id) => client.getMessage(id),
      getThread: (id) => client.getThread(id),
      getFolders: () => client.getFolders(),
      updateMessageFolders: (id, folders) =>
        client.updateMessageFolders(id, folders),
      getCleanMessages: (ids) => client.getCleanMessages(ids),
      classify: classifyFn,
    };

    return handleWebhook(req, deps);
  });
}
