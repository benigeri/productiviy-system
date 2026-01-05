import { assertEquals, assertRejects } from "@std/assert";
import {
  parseWebhookUpdate,
  getFileUrl,
  sendMessage,
  validateWebhookSecret,
  type WebhookUpdate,
} from "./telegram.ts";

// ============================================================================
// parseWebhookUpdate tests
// ============================================================================

Deno.test("parseWebhookUpdate - parses text message", () => {
  const body: WebhookUpdate = {
    update_id: 123456789,
    message: {
      message_id: 42,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 123, type: "private" },
      date: 1704067200,
      text: "Create a new task for the homepage redesign",
    },
  };

  const result = parseWebhookUpdate(body);

  assertEquals(result.type, "text");
  assertEquals(result.content, "Create a new task for the homepage redesign");
  assertEquals(result.messageId, 42);
  assertEquals(result.chatId, 123);
});

Deno.test("parseWebhookUpdate - parses voice message", () => {
  const body: WebhookUpdate = {
    update_id: 123456789,
    message: {
      message_id: 43,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 123, type: "private" },
      date: 1704067200,
      voice: {
        file_id: "AwACAgIAAxkBAAIBZ2X...",
        file_unique_id: "AgADAgATxxxxxx",
        duration: 5,
        mime_type: "audio/ogg",
        file_size: 12345,
      },
    },
  };

  const result = parseWebhookUpdate(body);

  assertEquals(result.type, "voice");
  assertEquals(result.content, "AwACAgIAAxkBAAIBZ2X...");
  assertEquals(result.messageId, 43);
  assertEquals(result.chatId, 123);
});

Deno.test("parseWebhookUpdate - throws on missing message", () => {
  const body = { update_id: 123456789 } as WebhookUpdate;

  try {
    parseWebhookUpdate(body);
    throw new Error("Should have thrown");
  } catch (e) {
    assertEquals((e as Error).message, "No message in update");
  }
});

Deno.test("parseWebhookUpdate - throws on unsupported message type", () => {
  const body: WebhookUpdate = {
    update_id: 123456789,
    message: {
      message_id: 44,
      from: { id: 123, is_bot: false, first_name: "Test" },
      chat: { id: 123, type: "private" },
      date: 1704067200,
      photo: [{ file_id: "xxx", file_unique_id: "yyy", width: 100, height: 100 }],
    },
  };

  try {
    parseWebhookUpdate(body);
    throw new Error("Should have thrown");
  } catch (e) {
    assertEquals((e as Error).message, "Unsupported message type");
  }
});

// ============================================================================
// getFileUrl tests
// ============================================================================

Deno.test("getFileUrl - returns download URL for file", async () => {
  const mockFetch = (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/getFile")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: { file_path: "voice/file_123.oga" },
          }),
      } as Response);
    }
    throw new Error("Unexpected URL");
  };

  const result = await getFileUrl(
    "test_file_id",
    "test_bot_token",
    mockFetch
  );

  assertEquals(
    result,
    "https://api.telegram.org/file/bottest_bot_token/voice/file_123.oga"
  );
});

Deno.test("getFileUrl - throws on API error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: false,
          description: "Bad Request: file not found",
        }),
    } as Response);

  await assertRejects(
    () => getFileUrl("bad_file_id", "test_bot_token", mockFetch),
    Error,
    "Telegram API error: Bad Request: file not found"
  );
});

Deno.test("getFileUrl - throws on network error", async () => {
  const mockFetch = () => Promise.reject(new Error("Network error"));

  await assertRejects(
    () => getFileUrl("test_file_id", "test_bot_token", mockFetch),
    Error,
    "Network error"
  );
});

// ============================================================================
// validateWebhookSecret tests
// ============================================================================

Deno.test("validateWebhookSecret - returns true for matching secret", () => {
  const headers = new Headers({
    "X-Telegram-Bot-Api-Secret-Token": "my_secret_token",
  });

  const result = validateWebhookSecret(headers, "my_secret_token");

  assertEquals(result, true);
});

Deno.test("validateWebhookSecret - returns false for mismatched secret", () => {
  const headers = new Headers({
    "X-Telegram-Bot-Api-Secret-Token": "wrong_token",
  });

  const result = validateWebhookSecret(headers, "my_secret_token");

  assertEquals(result, false);
});

Deno.test("validateWebhookSecret - returns false for missing header", () => {
  const headers = new Headers();

  const result = validateWebhookSecret(headers, "my_secret_token");

  assertEquals(result, false);
});

Deno.test("validateWebhookSecret - returns true when no secret configured", () => {
  const headers = new Headers();

  const result = validateWebhookSecret(headers, undefined);

  assertEquals(result, true);
});

// ============================================================================
// sendMessage tests
// ============================================================================

Deno.test("sendMessage - sends message successfully", async () => {
  let capturedBody: Record<string, unknown> | undefined;

  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("/sendMessage")) {
      capturedBody = JSON.parse(init?.body as string);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: { message_id: 100 } }),
      } as Response);
    }
    throw new Error("Unexpected URL");
  };

  await sendMessage(123, "Hello world", "test_bot_token", undefined, mockFetch);

  assertEquals(capturedBody?.chat_id, 123);
  assertEquals(capturedBody?.text, "Hello world");
  assertEquals(capturedBody?.parse_mode, "Markdown");
  assertEquals(capturedBody?.reply_to_message_id, undefined);
});

Deno.test("sendMessage - replies to specific message when replyToMessageId provided", async () => {
  let capturedBody: Record<string, unknown> | undefined;

  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("/sendMessage")) {
      capturedBody = JSON.parse(init?.body as string);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: { message_id: 100 } }),
      } as Response);
    }
    throw new Error("Unexpected URL");
  };

  await sendMessage(123, "Reply text", "test_bot_token", 42, mockFetch);

  assertEquals(capturedBody?.chat_id, 123);
  assertEquals(capturedBody?.text, "Reply text");
  assertEquals(capturedBody?.reply_to_message_id, 42);
});

Deno.test("sendMessage - throws on API error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: false,
          description: "Bad Request: chat not found",
        }),
    } as Response);

  await assertRejects(
    () => sendMessage(999, "Hello", "test_bot_token", undefined, mockFetch),
    Error,
    "Telegram API error: Bad Request: chat not found"
  );
});

Deno.test("sendMessage - throws on network error", async () => {
  const mockFetch = () => Promise.reject(new Error("Network error"));

  await assertRejects(
    () => sendMessage(123, "Hello", "test_bot_token", undefined, mockFetch),
    Error,
    "Network error"
  );
});
