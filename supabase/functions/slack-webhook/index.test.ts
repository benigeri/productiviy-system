import { assertEquals } from "@std/assert";
import { handleSlackWebhook, type SlackWebhookDeps } from "./index.ts";

function createMockDeps(
  overrides: Partial<SlackWebhookDeps> = {},
): SlackWebhookDeps {
  return {
    signingSecret: "test_signing_secret",
    processCapture: (text: string) => Promise.resolve({
      cleanedContent: text.trim(),
      isFeedback: false,
    }),
    createIssue: () =>
      Promise.resolve({
        id: "issue-123",
        identifier: "BEN-42",
        url: "https://linear.app/team/issue/BEN-42",
      }),
    verifySignature: () => true,
    resolveUser: (userId: string) => Promise.resolve(`user_${userId}`),
    resolveUserGroup: () => Promise.resolve("group"),
    getPermalink: () =>
      Promise.resolve("https://slack.com/archives/C123/p1234567890"),
    ...overrides,
  };
}

function createMessageEvent(text: string, channel = "C123456"): object {
  return {
    type: "event_callback",
    event: {
      type: "message",
      text,
      channel,
      user: "U123456",
      ts: "1234567890.123456",
    },
  };
}

// ============================================================================
// URL Verification (Slack challenge)
// ============================================================================

Deno.test("handleSlackWebhook - responds to URL verification challenge", async () => {
  const deps = createMockDeps();

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "url_verification",
      challenge: "test_challenge_token",
    }),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.challenge, "test_challenge_token");
});

// ============================================================================
// Message processing
// ============================================================================

Deno.test("handleSlackWebhook - processes text message and creates issue", async () => {
  let capturedTitle = "";

  const deps = createMockDeps({
    processCapture: () => Promise.resolve({
      cleanedContent: "Create homepage task",
      isFeedback: false,
    }),
    createIssue: (title) => {
      capturedTitle = title;
      return Promise.resolve({
        id: "issue-123",
        identifier: "BEN-42",
        url: "https://linear.app/team/issue/BEN-42",
      });
    },
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(createMessageEvent("Create homepage task")),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 200);
  assertEquals(capturedTitle, "Create homepage task");
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.issue.identifier, "BEN-42");
});

Deno.test("handleSlackWebhook - splits multiline into title and description", async () => {
  let captured: { title: string; description?: string } | undefined;

  const deps = createMockDeps({
    processCapture: (text) => Promise.resolve({
      cleanedContent: text,
      isFeedback: false,
    }),
    createIssue: (title, description) => {
      captured = { title, description };
      return Promise.resolve({
        id: "issue-123",
        identifier: "BEN-100",
        url: "https://linear.app/team/issue/BEN-100",
      });
    },
    getPermalink: () => Promise.resolve(null), // No permalink for this test
  });

  const multilineText = `Fix login bug
Users can't log in on mobile
Affects iOS and Android`;

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(createMessageEvent(multilineText)),
  });

  await handleSlackWebhook(request, deps);

  assertEquals(captured?.title, "Fix login bug");
  assertEquals(
    captured?.description,
    "Users can't log in on mobile\nAffects iOS and Android",
  );
});

Deno.test("handleSlackWebhook - single line message has no description without permalink", async () => {
  let captured: { title: string; description?: string } | undefined;

  const deps = createMockDeps({
    processCapture: (text) => Promise.resolve({
      cleanedContent: text,
      isFeedback: false,
    }),
    createIssue: (title, description) => {
      captured = { title, description };
      return Promise.resolve({
        id: "issue-123",
        identifier: "BEN-101",
        url: "https://linear.app/team/issue/BEN-101",
      });
    },
    getPermalink: () => Promise.resolve(null), // No permalink
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(createMessageEvent("Single line task")),
  });

  await handleSlackWebhook(request, deps);

  assertEquals(captured?.title, "Single line task");
  assertEquals(captured?.description, undefined);
});

Deno.test("handleSlackWebhook - includes permalink in description", async () => {
  let captured: { title: string; description?: string } | undefined;

  const deps = createMockDeps({
    processCapture: (text) => Promise.resolve({
      cleanedContent: text,
      isFeedback: false,
    }),
    createIssue: (title, description) => {
      captured = { title, description };
      return Promise.resolve({
        id: "issue-123",
        identifier: "BEN-102",
        url: "https://linear.app/team/issue/BEN-102",
      });
    },
    getPermalink: () =>
      Promise.resolve("https://myworkspace.slack.com/archives/C123/p1234"),
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(createMessageEvent("Task with link")),
  });

  await handleSlackWebhook(request, deps);

  assertEquals(captured?.title, "Task with link");
  assertEquals(
    captured?.description,
    "[View in Slack](https://myworkspace.slack.com/archives/C123/p1234)",
  );
});

// ============================================================================
// Security
// ============================================================================

Deno.test("handleSlackWebhook - rejects invalid signature", async () => {
  const deps = createMockDeps({
    verifySignature: () => false,
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=invalid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(createMessageEvent("test")),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, "Invalid signature");
});

Deno.test("handleSlackWebhook - skips signature check when no secret configured", async () => {
  const deps = createMockDeps({
    signingSecret: undefined,
    verifySignature: () => true,
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createMessageEvent("test")),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 200);
});

// ============================================================================
// Event filtering
// ============================================================================

Deno.test("handleSlackWebhook - ignores bot messages", async () => {
  const deps = createMockDeps();

  const botMessage = {
    type: "event_callback",
    event: {
      type: "message",
      text: "Bot message",
      channel: "C123456",
      bot_id: "B123456",
      ts: "1234567890.123456",
    },
  };

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(botMessage),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.ignored, true);
});

Deno.test("handleSlackWebhook - ignores message_changed subtypes", async () => {
  const deps = createMockDeps();

  const editedMessage = {
    type: "event_callback",
    event: {
      type: "message",
      subtype: "message_changed",
      channel: "C123456",
      ts: "1234567890.123456",
    },
  };

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(editedMessage),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.ignored, true);
});

// ============================================================================
// Error handling
// ============================================================================

Deno.test("handleSlackWebhook - returns 400 for empty message", async () => {
  const deps = createMockDeps();

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(createMessageEvent("")),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Empty message content");
});

Deno.test("handleSlackWebhook - returns 500 on Linear API failure", async () => {
  const deps = createMockDeps({
    createIssue: () => {
      return Promise.reject(
        new Error("Linear API error: 500 Internal Server Error"),
      );
    },
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: JSON.stringify(createMessageEvent("test")),
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, "Linear API error: 500 Internal Server Error");
});

// ============================================================================
// Message shortcuts
// ============================================================================

Deno.test("handleSlackWebhook - handles message shortcut with URL-encoded payload", async () => {
  const deps = createMockDeps();

  const shortcutPayload = {
    type: "message_action",
    callback_id: "send_to_linear",
    message: {
      type: "message",
      text: "Test message from shortcut",
      user: "U123456",
      ts: "1234567890.123456",
    },
    channel: {
      id: "C123456",
      name: "general",
    },
    user: {
      id: "U789",
      name: "requester",
    },
    response_url: "https://hooks.slack.com/response/xxx",
  };

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-slack-signature": "v0=valid",
      "x-slack-request-timestamp": "1234567890",
    },
    body: `payload=${encodeURIComponent(JSON.stringify(shortcutPayload))}`,
  });

  const response = await handleSlackWebhook(request, deps);

  // Should return 200 with created issue (processing is synchronous to prevent data loss)
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.issue.identifier, "BEN-42");
});

Deno.test("handleSlackWebhook - returns 200 for empty shortcut message", async () => {
  const deps = createMockDeps();

  const shortcutPayload = {
    type: "message_action",
    callback_id: "send_to_linear",
    message: {
      type: "message",
      text: "",
      user: "U123456",
      ts: "1234567890.123456",
    },
    channel: { id: "C123456" },
    user: { id: "U789" },
    response_url: "https://hooks.slack.com/response/xxx",
  };

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `payload=${encodeURIComponent(JSON.stringify(shortcutPayload))}`,
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 200);
});

Deno.test("handleSlackWebhook - returns 400 for missing payload in URL-encoded request", async () => {
  const deps = createMockDeps();

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "other_field=value",
  });

  const response = await handleSlackWebhook(request, deps);

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Missing payload");
});
