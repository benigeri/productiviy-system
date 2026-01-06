import { cleanupContent as cleanupContentImpl } from "../_shared/lib/claude.ts";
import { createTriageIssue as createTriageIssueImpl } from "../_shared/lib/linear.ts";
import { type CaptureDeps, captureToLinear } from "../_shared/lib/capture.ts";
import type { LinearIssue } from "../_shared/lib/types.ts";
import {
  createSlackUserGroupResolver,
  createSlackUserResolver,
  getMessagePermalink,
  getOriginalMessageUrl,
  parseSlackMessage,
  type SlackMessageEvent,
  type UserGroupResolver,
  type UserResolver,
} from "./lib/slack.ts";

/**
 * Dependencies for the Slack webhook handler.
 * Functions should have API keys pre-bound at construction time.
 */
export interface SlackWebhookDeps {
  signingSecret?: string;
  cleanupContent: (text: string) => Promise<string>;
  createTriageIssue: (
    title: string,
    description?: string,
  ) => Promise<LinearIssue>;
  verifySignature: (
    signature: string,
    timestamp: string,
    body: string,
    secret: string,
  ) => boolean;
  resolveUser: UserResolver;
  resolveUserGroup: UserGroupResolver;
  getPermalink: (channel: string, messageTs: string) => Promise<string | null>;
}

interface SlackUrlVerification {
  type: "url_verification";
  challenge: string;
}

interface SlackEventCallback {
  type: "event_callback";
  event: SlackMessageEvent;
}

type SlackPayload = SlackUrlVerification | SlackEventCallback;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verify Slack request signature using HMAC-SHA256.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(
  signature: string,
  timestamp: string,
  body: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const baseString = `v0:${timestamp}:${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(baseString),
  );

  const expectedSignature = "v0=" + Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === expectedSignature;
}

export async function handleSlackWebhook(
  request: Request,
  deps: SlackWebhookDeps,
): Promise<Response> {
  const bodyText = await request.text();
  let payload: SlackPayload;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Handle URL verification challenge (no signature check needed)
  if (payload.type === "url_verification") {
    return jsonResponse({ challenge: payload.challenge });
  }

  // Verify signature for event callbacks
  if (deps.signingSecret) {
    const signature = request.headers.get("x-slack-signature") ?? "";
    const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";

    const isValid = deps.verifySignature(
      signature,
      timestamp,
      bodyText,
      deps.signingSecret,
    );
    if (!isValid) {
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  }

  // Handle event callbacks
  if (payload.type === "event_callback") {
    const event = payload.event;

    // Only handle message events
    if (event.type !== "message") {
      return jsonResponse({ ok: true, ignored: true });
    }

    // Ignore bot messages to prevent loops
    if (event.bot_id) {
      return jsonResponse({ ok: true, ignored: true });
    }

    // Ignore message subtypes (edits, deletes, etc.)
    if (event.subtype) {
      return jsonResponse({ ok: true, ignored: true });
    }

    try {
      // Check for original message URL in forwarded attachments first
      const originalUrl = getOriginalMessageUrl(event);

      // Parse Slack message: extract text, resolve mentions, handle forwards
      // Run parsing and permalink fetch in parallel for speed
      const [parsedContent, dmPermalink] = await Promise.all([
        parseSlackMessage(event, deps.resolveUser, deps.resolveUserGroup),
        // Only fetch DM permalink if no original URL found
        originalUrl
          ? Promise.resolve(null)
          : deps.getPermalink(event.channel, event.ts),
      ]);

      if (parsedContent.trim() === "") {
        return jsonResponse({ error: "Empty message content" }, 400);
      }

      // Prefer original message URL (for forwards) over DM permalink
      const permalink = originalUrl ?? dmPermalink;

      // Append permalink to content so it appears in the issue description
      const contentWithLink = permalink
        ? `${parsedContent}\n\n[View in Slack](${permalink})`
        : parsedContent;

      // Create CaptureDeps from SlackWebhookDeps
      const captureDeps: CaptureDeps = {
        cleanupContent: deps.cleanupContent,
        createTriageIssue: deps.createTriageIssue,
      };

      // Use shared capture pipeline: cleanup → parse → create issue
      const issue = await captureToLinear(contentWithLink, captureDeps);

      return jsonResponse({ ok: true, issue });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      // Handle empty content error from capture pipeline
      if (message === "Cleanup resulted in empty content") {
        return jsonResponse({ error: "Empty message content" }, 400);
      }

      return jsonResponse({ error: message }, 500);
    }
  }

  return jsonResponse({ ok: true, ignored: true });
}

// Production handler - only runs when invoked directly by Supabase Edge Functions
if (import.meta.main) {
  Deno.serve(async (req) => {
    // Read API keys once at startup
    const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET");
    const botToken = Deno.env.get("SLACK_BOT_TOKEN") ?? "";
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    const linearKey = Deno.env.get("LINEAR_API_KEY") ?? "";

    // Create deps with API keys pre-bound
    const deps: SlackWebhookDeps = {
      signingSecret,
      cleanupContent: (text) => cleanupContentImpl(text, anthropicKey),
      createTriageIssue: (title, description) =>
        createTriageIssueImpl(title, linearKey, undefined, description),
      verifySignature: (_signature, _timestamp, _body, _secret) =>
        // In production, verification is done before this (see below)
        // This is a no-op since we already verified above
        true,
      resolveUser: createSlackUserResolver(botToken),
      resolveUserGroup: createSlackUserGroupResolver(botToken),
      getPermalink: (channel, messageTs) =>
        getMessagePermalink(channel, messageTs, botToken),
    };

    // Read body for both challenge check and signature verification
    const bodyText = await req.clone().text();
    let payload: { type: string; challenge?: string };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle URL verification challenge BEFORE signature check
    // Slack sends this during app setup and expects immediate response
    if (payload.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Ignore Slack retries to prevent duplicate processing
    // Slack retries after 3 seconds if no response - we process async so this happens
    const retryNum = req.headers.get("x-slack-retry-num");
    if (retryNum) {
      console.log(`Ignoring Slack retry #${retryNum}`);
      return new Response(
        JSON.stringify({ ok: true, ignored: true, reason: "retry" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // For all other requests, verify signature
    if (signingSecret) {
      const signature = req.headers.get("x-slack-signature") ?? "";
      const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";

      // Check for replay attacks (timestamp older than 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp)) > 300) {
        return new Response(JSON.stringify({ error: "Request too old" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const isValid = await verifySlackSignature(
        signature,
        timestamp,
        bodyText,
        signingSecret,
      );
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return handleSlackWebhook(req, deps);
  });
}
