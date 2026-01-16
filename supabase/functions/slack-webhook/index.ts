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
  processCapture: (text: string) => Promise<CaptureResult>;
  createIssue: (
    title: string,
    description?: string,
    options?: IssueCreateOptions,
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

interface SlackMessageShortcut {
  type: "message_action";
  callback_id: string;
  message: {
    type: string;
    text: string;
    user: string;
    ts: string;
  };
  channel: {
    id: string;
    name?: string;
  };
  user: {
    id: string;
    name?: string;
  };
  response_url: string;
}

type SlackPayload =
  | SlackUrlVerification
  | SlackEventCallback
  | SlackMessageShortcut;

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

  // Shortcuts are sent as URL-encoded form data with a "payload" field
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(bodyText);
      const payloadStr = params.get("payload");
      if (!payloadStr) {
        return jsonResponse({ error: "Missing payload" }, 400);
      }
      payload = JSON.parse(payloadStr);
    } catch {
      return jsonResponse({ error: "Invalid payload" }, 400);
    }
  } else {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
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

      // Create CaptureDeps from SlackWebhookDeps (interfaces are compatible)
      const captureDeps: CaptureDeps = {
        processCapture: deps.processCapture,
        createIssue: deps.createIssue,
      };

      // Use shared capture pipeline: process → parse → route → create issue
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

  // Handle message shortcuts (right-click → "Send to Linear")
  if (payload.type === "message_action") {
    const messageText = payload.message.text ?? "";

    if (messageText.trim() === "") {
      return new Response("", { status: 200 });
    }

    // Process in background - Slack needs response within 3 seconds
    // We can't await this or Slack will timeout
    const processShortcut = async () => {
      try {
        // Resolve the message author's username
        const authorName = await deps.resolveUser(payload.message.user);

        // Resolve mentions in the message
        const formattedText = await parseSlackMessage(
          {
            type: "message",
            text: messageText,
            channel: payload.channel.id,
            user: payload.message.user,
            ts: payload.message.ts,
          },
          deps.resolveUser,
          deps.resolveUserGroup,
        );

        // Prefix with author for clarity in Linear
        const contentWithAuthor = `From @${authorName}: ${formattedText}`;

        // Get permalink to the original message
        const permalink = await deps.getPermalink(
          payload.channel.id,
          payload.message.ts,
        );

        // Append permalink to content
        const contentWithLink = permalink
          ? `${contentWithAuthor}\n\n[View in Slack](${permalink})`
          : contentWithAuthor;

        // Create CaptureDeps from SlackWebhookDeps (interfaces are compatible)
        const captureDeps: CaptureDeps = {
          processCapture: deps.processCapture,
          createIssue: deps.createIssue,
        };

        // Use shared capture pipeline: process → parse → route → create issue
        await captureToLinear(contentWithLink, captureDeps);
        console.log("Shortcut processed successfully");
      } catch (error) {
        console.error("Shortcut processing error:", error);
      }
    };

    // Fire and forget - don't await
    processShortcut();

    // Return immediately to satisfy Slack's 3-second requirement
    return new Response("", { status: 200 });
  }

  return jsonResponse({ ok: true, ignored: true });
}

// Production handler - only runs when invoked directly by Supabase Edge Functions
if (import.meta.main) {
  Deno.serve(async (req) => {
    // Read API keys once at startup
    const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET");
    const botToken = Deno.env.get("SLACK_BOT_TOKEN") ?? "";
    const braintrustKey = Deno.env.get("BRAINTRUST_API_KEY") ?? "";
    const braintrustProject = Deno.env.get("BRAINTRUST_PROJECT_NAME") ?? "Productivity_System";
    const braintrustSlug = Deno.env.get("BRAINTRUST_CAPTURE_SLUG") ?? "capture-cleanup";
    const linearKey = Deno.env.get("LINEAR_API_KEY") ?? "";

    // Create deps with API keys pre-bound
    const deps: SlackWebhookDeps = {
      signingSecret,
      processCapture: (text) =>
        processCaptureImpl(text, braintrustKey, braintrustProject, braintrustSlug),
      createIssue: (title, description, options) =>
        createTriageIssueImpl(title, linearKey, undefined, description, undefined, options),
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
    const contentType = req.headers.get("content-type") ?? "";

    // Shortcuts send URL-encoded data - parse payload and verify signature, then pass to handler
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Signature verification still uses the raw body text
      if (signingSecret) {
        const signature = req.headers.get("x-slack-signature") ?? "";
        const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";

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
    }

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
