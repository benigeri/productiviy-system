import { assertEquals } from "@std/assert";
import { handleWebhook, type WebhookDeps } from "./index.ts";
import type {
  NylasFolder,
  NylasMessage,
  NylasWebhookPayload,
} from "../_shared/lib/nylas-types.ts";

// ============================================================================
// Helper to create mock deps
// ============================================================================

const DEFAULT_FOLDERS: NylasFolder[] = [
  { id: "INBOX", grant_id: "grant-456", name: "INBOX" },
  { id: "SENT", grant_id: "grant-456", name: "SENT" },
  { id: "Label_100", grant_id: "grant-456", name: "wf_triage" },
  { id: "Label_139", grant_id: "grant-456", name: "wf_respond" },
  { id: "Label_138", grant_id: "grant-456", name: "wf_review" },
  { id: "Label_215", grant_id: "grant-456", name: "wf_drafted" },
];

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
    getThread: () =>
      Promise.resolve({
        id: "thread-789",
        grant_id: "grant-456",
        subject: "Test",
        participants: [{ email: "sender@example.com" }],
        message_ids: ["msg-123"],
        folders: ["INBOX"],
      }),
    getFolders: () => Promise.resolve(DEFAULT_FOLDERS),
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

Deno.test("handleWebhook - clears other workflow labels when wf_respond added", async () => {
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
        // Use folder IDs as Nylas returns them
        folders: ["INBOX", "Label_139", "Label_138", "Label_215"],
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

  // Should keep INBOX and Label_139 (wf_respond, highest priority after triage), remove others
  assertEquals(updatedFolders.includes("INBOX"), true);
  assertEquals(updatedFolders.includes("Label_139"), true); // wf_respond
  assertEquals(updatedFolders.includes("Label_138"), false); // wf_review removed
  assertEquals(updatedFolders.includes("Label_215"), false); // wf_drafted removed
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
        // Use folder ID for wf_respond
        folders: ["INBOX", "Label_139"],
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
        // INBOX and SENT are system folders, not workflow labels
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

// ============================================================================
// Archive detection tests
// ============================================================================

Deno.test("handleWebhook - clears workflow labels when archived (no INBOX)", async () => {
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
        // Archived: has workflow label but no INBOX
        folders: ["Label_139", "CATEGORY_UPDATES"],
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

  // Workflow label should be removed
  assertEquals(updatedFolders.includes("Label_139"), false);
  assertEquals(updatedFolders.includes("CATEGORY_UPDATES"), true);
});

// ============================================================================
// Send detection tests
// ============================================================================

Deno.test("handleWebhook - clears workflow labels from thread when reply sent", async () => {
  const payload = createWebhookPayload("message.created", "sent-msg-456");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  const updatedMessages: { id: string; folders: string[] }[] = [];
  const deps = createMockDeps({
    getMessage: (id) => {
      if (id === "sent-msg-456") {
        // The sent message
        return Promise.resolve({
          id: "sent-msg-456",
          grant_id: "grant-456",
          thread_id: "thread-789",
          subject: "Re: Test",
          from: [{ email: "me@example.com" }],
          to: [{ email: "sender@example.com" }],
          date: 1704067300,
          folders: ["SENT"],
        });
      }
      // Original message with workflow label
      return Promise.resolve({
        id: "original-msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "me@example.com" }],
        date: 1704067200,
        folders: ["INBOX", "Label_139"],
      });
    },
    getThread: () =>
      Promise.resolve({
        id: "thread-789",
        grant_id: "grant-456",
        subject: "Test",
        participants: [
          { email: "sender@example.com" },
          { email: "me@example.com" },
        ],
        message_ids: ["original-msg-123", "sent-msg-456"],
        folders: ["INBOX", "SENT"],
      }),
    updateMessageFolders: (id, folders) => {
      updatedMessages.push({ id, folders });
      return Promise.resolve({
        id,
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "me@example.com" }],
        date: 1704067200,
        folders,
      });
    },
  });

  await handleWebhook(request, deps);

  // Original message should have workflow label cleared
  assertEquals(updatedMessages.length, 1);
  assertEquals(updatedMessages[0].id, "original-msg-123");
  assertEquals(updatedMessages[0].folders.includes("Label_139"), false);
  assertEquals(updatedMessages[0].folders.includes("INBOX"), true);
});

Deno.test("handleWebhook - clears workflow labels from sent message itself (draft becomes sent)", async () => {
  const payload = createWebhookPayload("message.created", "sent-msg-456");
  const request = new Request("https://example.com/nylas-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nylas-signature": "valid-signature",
    },
    body: JSON.stringify(payload),
  });

  const updatedMessages: { id: string; folders: string[] }[] = [];
  const deps = createMockDeps({
    getMessage: (id) => {
      if (id === "sent-msg-456") {
        // The sent message that was a draft - has "wf_drafted" label
        return Promise.resolve({
          id: "sent-msg-456",
          grant_id: "grant-456",
          thread_id: "thread-789",
          subject: "Re: Test",
          from: [{ email: "me@example.com" }],
          to: [{ email: "sender@example.com" }],
          date: 1704067300,
          folders: ["SENT", "Label_215"], // Has wf_drafted label!
        });
      }
      // Original message - no workflow labels
      return Promise.resolve({
        id: "original-msg-123",
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "me@example.com" }],
        date: 1704067200,
        folders: ["INBOX"],
      });
    },
    getThread: () =>
      Promise.resolve({
        id: "thread-789",
        grant_id: "grant-456",
        subject: "Test",
        participants: [
          { email: "sender@example.com" },
          { email: "me@example.com" },
        ],
        message_ids: ["original-msg-123", "sent-msg-456"],
        folders: ["INBOX", "SENT"],
      }),
    updateMessageFolders: (id, folders) => {
      updatedMessages.push({ id, folders });
      return Promise.resolve({
        id,
        grant_id: "grant-456",
        thread_id: "thread-789",
        subject: "Test",
        from: [{ email: "me@example.com" }],
        to: [{ email: "sender@example.com" }],
        date: 1704067300,
        folders,
      });
    },
  });

  await handleWebhook(request, deps);

  // Sent message should have its wf_drafted label cleared
  assertEquals(updatedMessages.length, 1);
  assertEquals(updatedMessages[0].id, "sent-msg-456");
  assertEquals(updatedMessages[0].folders.includes("Label_215"), false);
  assertEquals(updatedMessages[0].folders.includes("SENT"), true);
});
