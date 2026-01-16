// Supabase edge runtime types (only needed for Deno.serve type hints)
// @ts-ignore: Types only available in Supabase Edge Runtime
import {
  parseWebhookUpdate,
  getFileUrl as getFileUrlImpl,
  reactToMessage as reactToMessageImpl,
  validateWebhookSecret,
  type WebhookUpdate,
} from "./lib/telegram.ts";
import { transcribeAudio as transcribeAudioImpl } from "./lib/deepgram.ts";
import { processCapture as processCaptureImpl } from "../_shared/lib/braintrust.ts";
import {
  createTriageIssue as createTriageIssueImpl,
  type IssueCreateOptions,
} from "../_shared/lib/linear.ts";
import {
  captureToLinear,
  type CaptureDeps,
  type CaptureResult,
} from "../_shared/lib/capture.ts";
import type { LinearIssue } from "../_shared/lib/types.ts";

/**
 * Dependencies for the Telegram webhook handler.
 * Functions should have API keys pre-bound at construction time.
 */
export interface WebhookDeps {
  webhookSecret?: string;
  getFileUrl: (fileId: string) => Promise<string>;
  transcribeAudio: (audioUrl: string) => Promise<string>;
  processCapture: (text: string) => Promise<CaptureResult>;
  createIssue: (
    title: string,
    description?: string,
    options?: IssueCreateOptions,
  ) => Promise<LinearIssue>;
  reactToMessage: (chatId: number, messageId: number, emoji: string) => Promise<void>;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleWebhook(
  request: Request,
  deps: WebhookDeps
): Promise<Response> {
  // Validate webhook secret
  if (!validateWebhookSecret(request.headers, deps.webhookSecret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body: WebhookUpdate = await request.json();
    const parsed = parseWebhookUpdate(body);

    let rawText: string;

    if (parsed.type === "voice") {
      // Voice: get file URL → transcribe
      const fileUrl = await deps.getFileUrl(parsed.content);
      rawText = await deps.transcribeAudio(fileUrl);
    } else {
      // Text: use content directly
      rawText = parsed.content;
    }

    // Check for empty input before capture pipeline
    if (rawText.trim() === "") {
      return jsonResponse({ error: "Empty message content" }, 400);
    }

    // Create CaptureDeps from WebhookDeps (interfaces are compatible)
    const captureDeps: CaptureDeps = {
      processCapture: deps.processCapture,
      createIssue: deps.createIssue,
    };

    // Use shared capture pipeline: process → parse → route → create issue
    const issue = await captureToLinear(rawText, captureDeps);

    // React with thumbs up to confirm
    await deps.reactToMessage(parsed.chatId, parsed.messageId, "👍");

    return jsonResponse({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Unsupported message type" || message === "No message in update") {
      return jsonResponse({ error: message }, 400);
    }

    // Handle empty content error from capture pipeline
    if (message === "Cleanup resulted in empty content") {
      return jsonResponse({ error: "Empty message content" }, 400);
    }

    return jsonResponse({ error: message }, 500);
  }
}

// Production handler - only runs when invoked directly by Supabase Edge Functions
if (import.meta.main) {
  Deno.serve((req) => {
    // Read API keys once at startup
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY") ?? "";
    const braintrustKey = Deno.env.get("BRAINTRUST_API_KEY") ?? "";
    const braintrustProject = Deno.env.get("BRAINTRUST_PROJECT_NAME") ?? "Productivity_System";
    const braintrustSlug = Deno.env.get("BRAINTRUST_CAPTURE_SLUG") ?? "capture-cleanup";
    const linearKey = Deno.env.get("LINEAR_API_KEY") ?? "";

    // Create deps with API keys pre-bound
    const deps: WebhookDeps = {
      webhookSecret: Deno.env.get("TELEGRAM_WEBHOOK_SECRET"),
      getFileUrl: (fileId) => getFileUrlImpl(fileId, botToken),
      transcribeAudio: (url) => transcribeAudioImpl(url, deepgramKey),
      processCapture: (text) =>
        processCaptureImpl(text, braintrustKey, braintrustProject, braintrustSlug),
      createIssue: (title, description, options) =>
        createTriageIssueImpl(title, linearKey, undefined, description, undefined, options),
      reactToMessage: (chatId, messageId, emoji) =>
        reactToMessageImpl(chatId, messageId, emoji, botToken),
    };

    return handleWebhook(req, deps);
  });
}
