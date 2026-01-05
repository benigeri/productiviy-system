import { assertEquals } from "@std/assert";
import { handleWebhook, type WebhookDeps } from "./index.ts";
import type { WebhookUpdate } from "./lib/telegram.ts";

function createMockDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    botToken: "test_bot_token",
    deepgramKey: "test_deepgram_key",
    anthropicKey: "test_anthropic_key",
    linearKey: "test_linear_key",
    webhookSecret: "test_secret",
    getFileUrl: () => Promise.resolve("https://telegram.org/file/voice.oga"),
    transcribeAudio: () => Promise.resolve("transcribed voice message"),
    cleanupContent: (text: string) => Promise.resolve(text.trim()),
    createTriageIssue: () => Promise.resolve({
      id: "issue-123",
      identifier: "BEN-42",
      url: "https://linear.app/team/issue/BEN-42",
    }),
    ...overrides,
  };
}

function createTextUpdate(text: string): WebhookUpdate {
  return {
    update_id: 123456789,
    message: {
      message_id: 42,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 123, type: "private" },
      date: 1704067200,
      text,
    },
  };
}

function createVoiceUpdate(): WebhookUpdate {
  return {
    update_id: 123456789,
    message: {
      message_id: 43,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 123, type: "private" },
      date: 1704067200,
      voice: {
        file_id: "voice_file_id_123",
        file_unique_id: "unique_id",
        duration: 5,
      },
    },
  };
}

// ============================================================================
// Text message flow
// ============================================================================

Deno.test("handleWebhook - processes text message end-to-end", async () => {
  const deps = createMockDeps({
    cleanupContent: () => Promise.resolve("Create homepage task"),
    createTriageIssue: (title) => {
      assertEquals(title, "Create homepage task");
      return Promise.resolve({
        id: "issue-123",
        identifier: "BEN-42",
        url: "https://linear.app/team/issue/BEN-42",
      });
    },
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
    body: JSON.stringify(createTextUpdate("Create homepage task")),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.issue.identifier, "BEN-42");
});

// ============================================================================
// Voice message flow
// ============================================================================

Deno.test("handleWebhook - processes voice message end-to-end", async () => {
  const callOrder: string[] = [];

  const deps = createMockDeps({
    getFileUrl: (fileId) => {
      callOrder.push("getFileUrl");
      assertEquals(fileId, "voice_file_id_123");
      return Promise.resolve("https://telegram.org/file/voice.oga");
    },
    transcribeAudio: (url) => {
      callOrder.push("transcribeAudio");
      assertEquals(url, "https://telegram.org/file/voice.oga");
      return Promise.resolve("um create a new task");
    },
    cleanupContent: (text) => {
      callOrder.push("cleanupContent");
      assertEquals(text, "um create a new task");
      return Promise.resolve("Create a new task");
    },
    createTriageIssue: (title) => {
      callOrder.push("createTriageIssue");
      assertEquals(title, "Create a new task");
      return Promise.resolve({
        id: "issue-456",
        identifier: "BEN-43",
        url: "https://linear.app/team/issue/BEN-43",
      });
    },
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
    body: JSON.stringify(createVoiceUpdate()),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.issue.identifier, "BEN-43");
  assertEquals(callOrder, ["getFileUrl", "transcribeAudio", "cleanupContent", "createTriageIssue"]);
});

// ============================================================================
// Security
// ============================================================================

Deno.test("handleWebhook - rejects invalid webhook secret", async () => {
  const deps = createMockDeps();

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong_secret" },
    body: JSON.stringify(createTextUpdate("test")),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("handleWebhook - accepts requests when no secret configured", async () => {
  const deps = createMockDeps({ webhookSecret: undefined });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    body: JSON.stringify(createTextUpdate("test")),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
});

// ============================================================================
// Error handling
// ============================================================================

Deno.test("handleWebhook - returns 400 for unsupported message type", async () => {
  const deps = createMockDeps();

  const update: WebhookUpdate = {
    update_id: 123456789,
    message: {
      message_id: 44,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 123, type: "private" },
      date: 1704067200,
      photo: [{ file_id: "xxx", file_unique_id: "yyy", width: 100, height: 100 }],
    },
  };

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
    body: JSON.stringify(update),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Unsupported message type");
});

Deno.test("handleWebhook - returns 500 on Linear API failure", async () => {
  const deps = createMockDeps({
    createTriageIssue: () => {
      return Promise.reject(new Error("Linear API error: 500 Internal Server Error"));
    },
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
    body: JSON.stringify(createTextUpdate("test")),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, "Linear API error: 500 Internal Server Error");
});

Deno.test("handleWebhook - returns 500 on transcription failure", async () => {
  const deps = createMockDeps({
    transcribeAudio: () => {
      return Promise.reject(new Error("Deepgram API error: 401 Unauthorized"));
    },
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
    body: JSON.stringify(createVoiceUpdate()),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, "Deepgram API error: 401 Unauthorized");
});

// ============================================================================
// Edge cases
// ============================================================================

Deno.test("handleWebhook - handles empty transcription", async () => {
  const deps = createMockDeps({
    transcribeAudio: () => Promise.resolve(""),
  });

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
    body: JSON.stringify(createVoiceUpdate()),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Empty message content");
});

Deno.test("handleWebhook - handles empty text message", async () => {
  const deps = createMockDeps();

  const request = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
    body: JSON.stringify(createTextUpdate("")),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "Empty message content");
});
