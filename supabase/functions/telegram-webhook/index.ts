// Supabase edge runtime types (only needed for Deno.serve type hints)
// @ts-ignore: Types only available in Supabase Edge Runtime
import {
  parseWebhookUpdate,
  getFileUrl as getFileUrlImpl,
  sendMessage as sendMessageImpl,
  validateWebhookSecret,
  type WebhookUpdate,
} from "./lib/telegram.ts";
import { transcribeAudio as transcribeAudioImpl } from "./lib/deepgram.ts";
import { cleanupContent as cleanupContentImpl } from "./lib/claude.ts";
import {
  createTriageIssue as createTriageIssueImpl,
  type LinearIssue,
} from "./lib/linear.ts";

export interface WebhookDeps {
  botToken: string;
  deepgramKey: string;
  anthropicKey: string;
  linearKey: string;
  webhookSecret?: string;
  getFileUrl: (fileId: string, botToken: string) => Promise<string>;
  transcribeAudio: (audioUrl: string, apiKey: string) => Promise<string>;
  cleanupContent: (text: string, apiKey: string) => Promise<string>;
  createTriageIssue: (title: string, apiKey: string) => Promise<LinearIssue>;
  sendMessage: (chatId: number, text: string, botToken: string, replyToMessageId?: number) => Promise<void>;
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

    let content: string;

    if (parsed.type === "voice") {
      // Voice: get file URL → transcribe → cleanup
      const fileUrl = await deps.getFileUrl(parsed.content, deps.botToken);
      const transcript = await deps.transcribeAudio(fileUrl, deps.deepgramKey);
      content = await deps.cleanupContent(transcript, deps.anthropicKey);
    } else {
      // Text: just cleanup
      content = await deps.cleanupContent(parsed.content, deps.anthropicKey);
    }

    if (content.trim() === "") {
      return jsonResponse({ error: "Empty message content" }, 400);
    }

    // Create Linear issue
    const issue = await deps.createTriageIssue(content, deps.linearKey);

    // Reply to user with confirmation
    const confirmationText = `✓ Created [${issue.identifier}](${issue.url})`;
    await deps.sendMessage(parsed.chatId, confirmationText, deps.botToken, parsed.messageId);

    return jsonResponse({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Unsupported message type" || message === "No message in update") {
      return jsonResponse({ error: message }, 400);
    }

    return jsonResponse({ error: message }, 500);
  }
}

// Production handler - only runs when invoked directly by Supabase Edge Functions
if (import.meta.main) {
  Deno.serve((req) => {
    const deps: WebhookDeps = {
      botToken: Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "",
      deepgramKey: Deno.env.get("DEEPGRAM_API_KEY") ?? "",
      anthropicKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      linearKey: Deno.env.get("LINEAR_API_KEY") ?? "",
      webhookSecret: Deno.env.get("TELEGRAM_WEBHOOK_SECRET"),
      getFileUrl: (fileId, botToken) => getFileUrlImpl(fileId, botToken),
      transcribeAudio: (url, apiKey) => transcribeAudioImpl(url, apiKey),
      cleanupContent: (text, apiKey) => cleanupContentImpl(text, apiKey),
      createTriageIssue: (title, apiKey) => createTriageIssueImpl(title, apiKey),
      sendMessage: (chatId, text, botToken, replyToMessageId) => sendMessageImpl(chatId, text, botToken, replyToMessageId),
    };

    return handleWebhook(req, deps);
  });
}
