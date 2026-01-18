import { assertEquals, assertRejects } from "@std/assert";
import { createNylasClient, verifyNylasSignature } from "./nylas.ts";
import type { NylasFolder, NylasMessage, NylasThread } from "./nylas-types.ts";

// ============================================================================
// verifyNylasSignature tests
// ============================================================================

Deno.test("verifyNylasSignature - returns true for valid signature", async () => {
  const body = '{"test": "data"}';
  const secret = "test-secret";
  // Pre-computed HMAC-SHA256 of body with secret
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const validSignature = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const result = await verifyNylasSignature(validSignature, body, secret);
  assertEquals(result, true);
});

Deno.test("verifyNylasSignature - returns false for invalid signature", async () => {
  const body = '{"test": "data"}';
  const secret = "test-secret";
  const invalidSignature = "invalid-signature-hex";

  const result = await verifyNylasSignature(invalidSignature, body, secret);
  assertEquals(result, false);
});

Deno.test("verifyNylasSignature - returns false for tampered body", async () => {
  const originalBody = '{"test": "data"}';
  const tamperedBody = '{"test": "tampered"}';
  const secret = "test-secret";

  // Generate signature for original body
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(originalBody),
  );
  const validSignature = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Verify against tampered body should fail
  const result = await verifyNylasSignature(
    validSignature,
    tamperedBody,
    secret,
  );
  assertEquals(result, false);
});

// ============================================================================
// createNylasClient tests
// ============================================================================

Deno.test("getMessage - fetches message by ID", async () => {
  const mockMessage: NylasMessage = {
    id: "msg-123",
    grant_id: "grant-456",
    thread_id: "thread-789",
    subject: "Test Subject",
    from: [{ email: "sender@example.com", name: "Sender" }],
    to: [{ email: "recipient@example.com" }],
    date: 1704067200,
    folders: ["INBOX", "wf_respond"],
    snippet: "Message preview...",
  };

  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    assertEquals(
      url,
      "https://api.us.nylas.com/v3/grants/grant-456/messages/msg-123",
    );
    assertEquals(
      (init?.headers as Record<string, string>)["Authorization"],
      "Bearer test-api-key",
    );

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: mockMessage }),
    } as Response);
  };

  const client = createNylasClient("test-api-key", "grant-456", mockFetch);
  const result = await client.getMessage("msg-123");

  assertEquals(result.id, "msg-123");
  assertEquals(result.subject, "Test Subject");
  assertEquals(result.folders, ["INBOX", "wf_respond"]);
});

Deno.test("getMessage - throws on API error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

  const client = createNylasClient("test-api-key", "grant-456", mockFetch);

  await assertRejects(
    () => client.getMessage("nonexistent"),
    Error,
    "Nylas API error: 404 Not Found",
  );
});

Deno.test("getThread - fetches thread by ID", async () => {
  const mockThread: NylasThread = {
    id: "thread-789",
    grant_id: "grant-456",
    subject: "Thread Subject",
    participants: [
      { email: "user1@example.com" },
      { email: "user2@example.com" },
    ],
    message_ids: ["msg-1", "msg-2", "msg-3"],
    folders: ["INBOX"],
  };

  const mockFetch = (input: RequestInfo | URL) => {
    const url = input.toString();
    assertEquals(
      url,
      "https://api.us.nylas.com/v3/grants/grant-456/threads/thread-789",
    );

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: mockThread }),
    } as Response);
  };

  const client = createNylasClient("test-api-key", "grant-456", mockFetch);
  const result = await client.getThread("thread-789");

  assertEquals(result.id, "thread-789");
  assertEquals(result.message_ids.length, 3);
});

Deno.test("getFolders - fetches all folders", async () => {
  const mockFolders: NylasFolder[] = [
    { id: "folder-1", grant_id: "grant-456", name: "INBOX" },
    { id: "folder-2", grant_id: "grant-456", name: "wf_respond" },
    { id: "folder-3", grant_id: "grant-456", name: "wf_review" },
  ];

  const mockFetch = (input: RequestInfo | URL) => {
    const url = input.toString();
    assertEquals(url, "https://api.us.nylas.com/v3/grants/grant-456/folders");

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: mockFolders }),
    } as Response);
  };

  const client = createNylasClient("test-api-key", "grant-456", mockFetch);
  const result = await client.getFolders();

  assertEquals(result.length, 3);
  assertEquals(result[1].name, "wf_respond");
});

Deno.test("updateMessageFolders - updates message folders", async () => {
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    assertEquals(
      url,
      "https://api.us.nylas.com/v3/grants/grant-456/messages/msg-123",
    );
    assertEquals(init?.method, "PUT");

    const body = JSON.parse(init?.body as string);
    assertEquals(body.folders, ["INBOX", "wf_respond"]);

    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: "msg-123",
            grant_id: "grant-456",
            thread_id: "thread-789",
            subject: "Test",
            from: [{ email: "test@example.com" }],
            to: [{ email: "recipient@example.com" }],
            date: 1704067200,
            folders: ["INBOX", "wf_respond"],
          },
        }),
    } as Response);
  };

  const client = createNylasClient("test-api-key", "grant-456", mockFetch);
  const result = await client.updateMessageFolders("msg-123", [
    "INBOX",
    "wf_respond",
  ]);

  assertEquals(result.folders, ["INBOX", "wf_respond"]);
});

Deno.test("updateMessageFolders - throws on API error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    } as Response);

  const client = createNylasClient("test-api-key", "grant-456", mockFetch);

  await assertRejects(
    () => client.updateMessageFolders("msg-123", ["invalid-folder"]),
    Error,
    "Nylas API error: 400 Bad Request",
  );
});

Deno.test("client - reuses same fetch function", async () => {
  let callCount = 0;
  const mockFetch = () => {
    callCount++;
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: "msg-123",
            grant_id: "grant-456",
            thread_id: "thread-789",
            subject: "Test",
            from: [{ email: "test@example.com" }],
            to: [{ email: "recipient@example.com" }],
            date: 1704067200,
            folders: [],
          },
        }),
    } as Response);
  };

  const client = createNylasClient("test-api-key", "grant-456", mockFetch);
  await client.getMessage("msg-1");
  await client.getMessage("msg-2");

  assertEquals(callCount, 2);
});
