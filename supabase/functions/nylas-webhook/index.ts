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
import { READONLY_SYSTEM_LABELS } from "../_shared/lib/nylas-types.ts";
import {
  getMostRecentWorkflowLabel,
  getWorkflowLabels,
  removeWorkflowLabels,
} from "../_shared/lib/workflow-labels.ts";
import {
  createNylasClient,
  verifyNylasSignature,
} from "../_shared/lib/nylas.ts";
import { errorResponse, jsonResponse } from "../_shared/lib/http.ts";
import {
  type ClassifierInput,
  type ClassifierResult,
  classifyEmail,
} from "../_shared/lib/classifier.ts";
import { z } from "zod";

// Zod schema for Nylas webhook payload validation
const NylasWebhookPayloadSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.object({
      id: z.string(),
    }),
  }),
});

// Performance limits to prevent webhook timeout on large threads
const MAX_THREAD_MESSAGES = 20; // Only process last N messages
const BATCH_SIZE = 5; // Fetch N messages at a time to avoid rate limits

// Dedup tracking to prevent redundant processing when multiple webhooks fire
const DEDUP_WINDOW_MS = 5000; // 5 second window
const recentlyProcessedThreads = new Map<string, number>(); // threadId -> timestamp

/** Check if a thread was recently processed (within dedup window) */
function wasRecentlyProcessed(threadId: string): boolean {
  const now = Date.now();
  const lastProcessed = recentlyProcessedThreads.get(threadId);
  if (lastProcessed && now - lastProcessed < DEDUP_WINDOW_MS) {
    return true;
  }
  recentlyProcessedThreads.set(threadId, now);
  // Cleanup old entries (simple GC)
  if (recentlyProcessedThreads.size > 100) {
    for (const [id, time] of recentlyProcessedThreads) {
      if (now - time > DEDUP_WINDOW_MS) {
        recentlyProcessedThreads.delete(id);
      }
    }
  }
  return false;
}

/** Clear the dedup cache (for testing) */
export function clearDedupCache(): void {
  recentlyProcessedThreads.clear();
}

/** Generate a short correlation ID for request tracing */
function generateCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

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
 * Fetch thread messages with bounded count and batching.
 * Returns the current message plus up to MAX_THREAD_MESSAGES other messages.
 */
async function fetchThreadMessages(
  currentMessage: NylasMessage,
  thread: NylasThread,
  getMessage: (id: string) => Promise<NylasMessage>,
): Promise<NylasMessage[]> {
  const allMessageIds = thread.message_ids ?? [currentMessage.id];

  // Get other message IDs (excluding current), limited to most recent
  const otherMessageIds = allMessageIds
    .filter((id) => id !== currentMessage.id)
    .slice(-MAX_THREAD_MESSAGES);

  // Fetch in batches to avoid rate limits
  const otherMessages: NylasMessage[] = [];
  for (let i = 0; i < otherMessageIds.length; i += BATCH_SIZE) {
    const batch = otherMessageIds.slice(i, i + BATCH_SIZE);
    const batchMessages = await Promise.all(batch.map((id) => getMessage(id)));
    otherMessages.push(...batchMessages);
  }

  return [currentMessage, ...otherMessages];
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

  // Filter out read-only system labels (SENT, DRAFT, TRASH, SPAM)
  // These are managed by Gmail and cannot be set via API
  const writableFolderNames = newFolderNames.filter(
    (name) => !READONLY_SYSTEM_LABELS.has(name),
  );
  const newFolderIds = writableFolderNames.map((name) =>
    nameToId.get(name) ?? name
  );

  await deps.updateMessageFolders(message.id, newFolderIds);
  return true;
}

/**
 * Clear workflow labels from all messages in a thread.
 * Returns true if any labels were cleared.
 */
async function clearThreadWorkflowLabels(
  message: NylasMessage,
  idToName: Map<string, string>,
  nameToId: Map<string, string>,
  deps: WebhookDeps,
  logPrefix: string,
  correlationId: string,
): Promise<boolean> {
  const thread = await deps.getThread(message.thread_id);
  const allMessages = await fetchThreadMessages(
    message,
    thread,
    deps.getMessage,
  );

  const results = await Promise.all(
    allMessages.map((msg) =>
      clearWorkflowLabels(msg, idToName, nameToId, deps)
    ),
  );

  const cleared = results.filter(Boolean).length;
  console.log(
    `[${logPrefix}] cid=${correlationId} Cleared workflow labels from ${cleared}/${allMessages.length} messages in thread ${message.thread_id}`,
  );

  return results.some((result) => result);
}

/**
 * Process a message update event.
 * Handles: deduplication (multiple workflow labels) and archive (no INBOX).
 * Accepts optional pre-fetched data to avoid duplicate API calls.
 */
async function processMessageUpdate(
  messageId: string,
  deps: WebhookDeps,
  correlationId: string,
  prefetched?: { message: NylasMessage; folders: NylasFolder[] },
): Promise<boolean> {
  // Use prefetched data if available, otherwise fetch
  const [message, folders] = prefetched
    ? [prefetched.message, prefetched.folders]
    : await Promise.all([deps.getMessage(messageId), deps.getFolders()]);

  const { idToName, nameToId } = buildFolderMaps(folders);
  const folderNames = message.folders.map((id) => idToName.get(id) ?? id);

  // Check if this is a sent message (sent messages don't have INBOX)
  const isSent = folderNames.includes("SENT");
  const hasInbox = folderNames.includes("INBOX");

  console.log(
    `[processMessageUpdate] cid=${correlationId} messageId=${messageId} isSent=${isSent} hasInbox=${hasInbox} folders=${
      JSON.stringify(folderNames)
    }`,
  );

  // Archive detection: received message with no INBOX → clear workflow labels from ENTIRE thread
  // This handles the case where workflow labels are on sent messages but the received message is archived
  // We skip this check for sent messages since they never have INBOX
  if (!isSent && !hasInbox) {
    // Skip if this thread was recently processed (dedup concurrent webhooks)
    if (wasRecentlyProcessed(message.thread_id)) {
      console.log(
        `[processMessageUpdate] cid=${correlationId} Skipping - thread ${message.thread_id} recently processed (dedup)`,
      );
      return false;
    }

    console.log(
      `[processMessageUpdate] cid=${correlationId} Archive detected - clearing workflow labels from thread ${message.thread_id}`,
    );
    return clearThreadWorkflowLabels(
      message,
      idToName,
      nameToId,
      deps,
      "processMessageUpdate",
      correlationId,
    );
  }

  // Workflow labels are mutually exclusive - keep only the most recently added one
  const workflowLabels = getWorkflowLabels(folderNames);
  if (workflowLabels.length > 1) {
    const mostRecent = getMostRecentWorkflowLabel(folderNames);
    if (mostRecent) {
      console.log(
        `[processMessageUpdate] cid=${correlationId} Multiple workflow labels detected: ${workflowLabels.join(", ")} → keeping ${mostRecent}`,
      );
      const newFolderNames = removeWorkflowLabels(folderNames, mostRecent);
      // Filter out read-only system labels (SENT, DRAFT, TRASH, SPAM)
      const writableFolderNames = newFolderNames.filter(
        (name) => !READONLY_SYSTEM_LABELS.has(name),
      );
      const newFolderIds = writableFolderNames.map((name) =>
        nameToId.get(name) ?? name
      );
      await deps.updateMessageFolders(messageId, newFolderIds);
      return true;
    }
  }

  return false;
}

/**
 * Build classifier input from a message with thread context.
 * Uses clean conversation text from last 5 messages for 90%+ token savings.
 */
function buildClassifierInput(
  message: NylasMessage,
  threadContext: {
    messages: Array<{ from: string; date: string; content: string }>;
    isReply: boolean;
    threadLength: number;
  },
): ClassifierInput {
  // Build combined body from thread messages
  const bodyParts = threadContext.messages.map((m, i) =>
    `--- Message ${i + 1} (from: ${m.from}, ${m.date}) ---\n${m.content}`
  );
  const combinedBody = bodyParts.join("\n\n");

  return {
    subject: message.subject ?? "",
    from: message.from?.map((p) => p.email).join(", ") ?? "",
    to: message.to?.map((p) => p.email).join(", ") ?? "",
    cc: message.cc?.map((p) => p.email).join(", ") ?? "",
    date: new Date(message.date * 1000).toISOString().split("T")[0],
    is_reply: String(threadContext.isReply),
    thread_length: String(threadContext.threadLength),
    has_attachments: String((message.attachments?.length ?? 0) > 0),
    attachment_types:
      message.attachments?.map((a) => a.content_type).join(", ") ?? "",
    body: combinedBody,
  };
}

/**
 * Process a received email for classification.
 * Fetches thread context (last 5 messages) and uses clean conversation text.
 * Calls the classifier and applies ai_* labels to the message.
 */
async function processReceivedMessage(
  message: NylasMessage,
  folders: NylasFolder[],
  deps: WebhookDeps,
  correlationId: string,
): Promise<boolean> {
  // Skip if classification is not enabled
  if (!deps.classify) {
    return false;
  }

  const { idToName, nameToId } = buildFolderMaps(folders);

  try {
    // Get thread to find all messages
    const thread = await deps.getThread(message.thread_id);
    const threadMsgIds = thread.message_ids ?? [message.id];
    const threadLength = threadMsgIds.length;

    // Get last 5 messages from thread for context
    const lastMsgIds = threadMsgIds.slice(-5);

    // Clean all thread messages (uses conversation field for clean text)
    const cleanMessages = await deps.getCleanMessages(lastMsgIds);

    // Get message details for each (need sender info)
    const msgDetails = await Promise.all(
      lastMsgIds.map((id) => id === message.id ? message : deps.getMessage(id)),
    );

    // Build thread context using conversation field (clean text, no HTML)
    const threadMessages = cleanMessages.map((cleaned, i) => ({
      from: msgDetails[i]?.from?.[0]?.email ?? "unknown",
      date:
        new Date((msgDetails[i]?.date ?? 0) * 1000).toISOString().split("T")[0],
      content: cleaned.conversation ?? cleaned.body ?? "(no content)",
    }));

    // Determine if this is a reply (not the first message in thread)
    const isReply = threadLength > 1 && threadMsgIds[0] !== message.id;

    // Build input with thread context and classify
    const input = buildClassifierInput(message, {
      messages: threadMessages,
      isReply,
      threadLength,
    });
    const result = await deps.classify(input);

    console.log(
      `[processReceivedMessage] cid=${correlationId} Classification result for ${message.id}: ${
        JSON.stringify(result)
      }`,
    );

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
      console.log(
        `[processReceivedMessage] cid=${correlationId} Warning: Missing Gmail labels: ${
          missing.join(", ")
        }`,
      );
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
    console.error(
      `[processReceivedMessage] cid=${correlationId} Classification error for ${message.id}:`,
      error,
    );
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
  correlationId: string,
): Promise<boolean> {
  const [message, folders] = await Promise.all([
    deps.getMessage(messageId),
    deps.getFolders(),
  ]);

  const { idToName, nameToId } = buildFolderMaps(folders);
  const folderNames = message.folders.map((id) => idToName.get(id) ?? id);

  // Check if sent or received message
  const isSent = folderNames.includes("SENT");
  console.log(
    `[processMessageCreated] cid=${correlationId} messageId=${messageId} threadId=${message.thread_id} isSent=${isSent}`,
  );

  if (!isSent) {
    // Received message - classify it, then check for deduplication/archive
    await processReceivedMessage(message, folders, deps, correlationId);
    // Pass prefetched data to avoid duplicate API calls
    return processMessageUpdate(messageId, deps, correlationId, {
      message,
      folders,
    });
  }

  // Skip if this thread was recently processed (dedup concurrent webhooks)
  if (wasRecentlyProcessed(message.thread_id)) {
    console.log(
      `[processMessageCreated] cid=${correlationId} Skipping thread ${message.thread_id} - recently processed (dedup)`,
    );
    return false;
  }

  // Sent message detected - clearing workflow labels from thread
  console.log(
    `[processMessageCreated] cid=${correlationId} Sent message detected - clearing workflow labels from thread ${message.thread_id}`,
  );
  return clearThreadWorkflowLabels(
    message,
    idToName,
    nameToId,
    deps,
    "processMessageCreated",
    correlationId,
  );
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

  const correlationId = generateCorrelationId();

  try {
    // Parse and validate payload structure
    const rawPayload = JSON.parse(body);
    const parseResult = NylasWebhookPayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      console.error(
        `[handleWebhook] cid=${correlationId} Invalid payload structure: ${parseResult.error.message}`,
      );
      return errorResponse("Invalid payload structure", "INVALID_PAYLOAD", 400);
    }
    const payload = rawPayload as NylasWebhookPayload;
    const messageId = payload.data.object.id;
    console.log(
      `[handleWebhook] cid=${correlationId} type=${payload.type} messageId=${messageId}`,
    );

    // Route based on event type
    if (payload.type === "message.created") {
      await processMessageCreated(messageId, deps, correlationId);
      return jsonResponse({ ok: true, action: "message.created" });
    }

    if (payload.type === "message.updated") {
      await processMessageUpdate(messageId, deps, correlationId);
      return jsonResponse({ ok: true, action: "message.updated" });
    }

    // Unknown event type - skip
    console.log(
      `[handleWebhook] cid=${correlationId} Unknown event type, skipping`,
    );
    return jsonResponse({ ok: true, skipped: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[handleWebhook] cid=${correlationId} Error: ${message}`);
    return errorResponse(message, "UNKNOWN_ERROR", 500);
  }
}

// Production handler - only runs when invoked directly by Supabase Edge Functions
if (import.meta.main) {
  console.log("[nylas-webhook] Initializing production handler...");

  // Try to load Braintrust - if it fails, webhook still works (just without classification)
  // deno-lint-ignore no-explicit-any
  let invoke: ((params: any) => Promise<any>) | undefined;

  const braintrustProjectName = Deno.env.get("BRAINTRUST_PROJECT_NAME") ?? "";
  const braintrustApiKey = Deno.env.get("BRAINTRUST_API_KEY") ?? "";

  if (braintrustApiKey && braintrustProjectName) {
    try {
      const braintrustModule = await import("braintrust");
      invoke = braintrustModule.invoke;
      const { initLogger } = braintrustModule;

      // Initialize Braintrust logger for tracing (required for logs to appear in dashboard)
      initLogger({
        projectName: braintrustProjectName,
        apiKey: braintrustApiKey,
        asyncFlush: false, // Required for serverless - flush synchronously
      });
      console.log("[nylas-webhook] Braintrust initialized successfully");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[nylas-webhook] Braintrust initialization failed: ${msg}`);
      console.log(
        "[nylas-webhook] Continuing without classification - label management will still work",
      );
    }
  } else {
    console.log(
      "[nylas-webhook] Braintrust not configured - classification disabled",
    );
  }

  Deno.serve((req) => {
    const apiKey = Deno.env.get("NYLAS_API_KEY") ?? "";
    const grantId = Deno.env.get("NYLAS_GRANT_ID") ?? "";
    const webhookSecret = Deno.env.get("NYLAS_WEBHOOK_SECRET") ?? "";
    const classifierSlug = Deno.env.get("BRAINTRUST_CLASSIFIER_SLUG") ??
      "email-classifier-v2";

    const client = createNylasClient(apiKey, grantId);

    // Only enable classification if Braintrust loaded successfully
    const classifyFn = invoke
      ? (input: ClassifierInput) =>
        classifyEmail(input, {
          invoke: (params) =>
            invoke({
              ...params,
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
