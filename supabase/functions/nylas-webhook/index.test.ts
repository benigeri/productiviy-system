import { assertEquals } from "@std/assert";
import { handleWebhook, type WebhookDeps } from "./index.ts";
import type {
  NylasMessage,
  NylasWebhookPayload,
} from "../_shared/lib/nylas-types.ts";

// ============================================================================
// Helper to create mock deps
// ============================================================================

function createMockDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    verifySignature: () => Promise.resolve(true),
    getMessage: () =>
      Promise.resolve({
        id: "msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders: ["INBOX"],
      }),
    updateMessageFolders: (id, folders) =>
      Promise.resolve({
        id,
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders,
      }),
    ...overrides,
  };
}

function createWebhookPayload(
  type: "message.created" | "message.updated",
  messageId = "msg-123",
  grantId = "grant-456",
): NylasWebhookPayload {
  return {
    specversion: "1.0",
    type,
    source: "/nylas/application/test",
    id: "event-123",
    time: 1704067200,
    data: {
      object: {
        id: messageId,
        grant_id: grantId,
      },
    },
  };
}

// ============================================================================
// Challenge verification tests
// ============================================================================

Deno.test("handleWebhook - responds to challenge verification", async () => {
  const request = new Request(
    "https://example.com/nylas-webhook?challenge=test-challenge-123",
  );
  const deps = createMockDeps();

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
  const text = await response.text();
  assertEquals(text, "test-challenge-123");
});

// ============================================================================
// Signature verification tests
// ============================================================================

Deno.test("handleWebhook - rejects invalid signature", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "invalid-signature",
    },
    body: JSON.stringify(payload),
  });

  const deps = createMockDeps({
    verifySignature: () => Promise.resolve(false),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 401);
  const json = await response.json();
  assertEquals(json.error, "Invalid signature");
});

Deno.test("handleWebhook - accepts valid signature", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  const deps = createMockDeps({
    verifySignature: () => Promise.resolve(true),
    getMessage: () =>
      Promise.resolve({
        id: "msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders: ["INBOX"],
      }),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
});

// ============================================================================
// Workflow label processing tests
// ============================================================================

Deno.test("handleWebhook - clears other workflow labels when to-respond-paul added", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  let updatedFolders: string[] = [];
  const deps = createMockDeps({
    getMessage: () =>
      Promise.resolve({
        id: "msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders: ["INBOX", "to-respond-paul", "to-read-paul", "drafted"],
      }),
    updateMessageFolders: (_id, folders) => {
      updatedFolders = folders;
      return Promise.resolve({
        id: "msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders,
      });
    },
  });

  await handleWebhook(request, deps);

  // Should keep INBOX and to-respond-paul (highest priority), remove others
  assertEquals(updatedFolders.includes("INBOX"), true);
  assertEquals(updatedFolders.includes("to-respond-paul"), true);
  assertEquals(updatedFolders.includes("to-read-paul"), false);
  assertEquals(updatedFolders.includes("drafted"), false);
});

Deno.test("handleWebhook - no update needed when only one workflow label", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  let updateCalled = false;
  const deps = createMockDeps({
    getMessage: () =>
      Promise.resolve({
        id: "msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders: ["INBOX", "to-respond-paul"],
      }),
    updateMessageFolders: (_id, folders) => {
      updateCalled = true;
      return Promise.resolve({
        id: "msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders,
      });
    },
  });

  await handleWebhook(request, deps);

  // Should not call update when no changes needed
  assertEquals(updateCalled, false);
});

Deno.test("handleWebhook - no update when no workflow labels", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  let updateCalled = false;
  const deps = createMockDeps({
    getMessage: () =>
      Promise.resolve({
        id: "msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders: ["INBOX", "SENT"],
      }),
    updateMessageFolders: () => {
      updateCalled = true;
      return Promise.resolve({} as NylasMessage);
    },
  });

  await handleWebhook(request, deps);

  assertEquals(updateCalled, false);
});

// ============================================================================
// Event routing tests
// ============================================================================

Deno.test("handleWebhook - handles message.created event", async () => {
  const payload = createWebhookPayload("message.created");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  let messageIdFetched = "";
  const deps = createMockDeps({
    getMessage: (id) => {
      messageIdFetched = id;
      return Promise.resolve({
        id,
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders: ["INBOX"],
      });
    },
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
  assertEquals(messageIdFetched, "msg-123");
});

Deno.test("handleWebhook - handles message.updated event", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  let messageIdFetched = "";
  const deps = createMockDeps({
    getMessage: (id) => {
      messageIdFetched = id;
      return Promise.resolve({
        id,
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "recipient@example.com" }],
        date: 1704067200,
        folders: ["INBOX"],
      });
    },
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
  assertEquals(messageIdFetched, "msg-123");
});

// ============================================================================
// Response format tests
// ============================================================================

Deno.test("handleWebhook - returns 200 with ok response", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  const deps = createMockDeps();
  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 200);
  const json = await response.json();
  assertEquals(json.ok, true);
});

Deno.test("handleWebhook - returns 500 on processing error", async () => {
  const payload = createWebhookPayload("message.updated");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  const deps = createMockDeps({
    getMessage: () => Promise.reject(new Error("API error")),
  });

  const response = await handleWebhook(request, deps);

  assertEquals(response.status, 500);
  const json = await response.json();
  assertEquals(json.error, "API error");
});
