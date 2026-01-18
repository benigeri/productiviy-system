/**
 * Tests for email classifier module.
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  parseClassifierResult,
  classifyEmail,
  type ClassifierInput,
  type ClassifierResult,
} from "./classifier.ts";

// ============================================================================
// parseClassifierResult tests
// ============================================================================

Deno.test("parseClassifierResult - handles valid object input", () => {
  const input = { labels: ["ai_tool", "ai_service"], reason: "Test reason" };
  const result = parseClassifierResult(input);

  assertEquals(result.labels, ["ai_tool", "ai_service"]);
  assertEquals(result.reason, "Test reason");
});

Deno.test("parseClassifierResult - handles valid JSON string input", () => {
  const input = JSON.stringify({
    labels: ["ai_auth"],
    reason: "Authentication email",
  });
  const result = parseClassifierResult(input);

  assertEquals(result.labels, ["ai_auth"]);
  assertEquals(result.reason, "Authentication email");
});

Deno.test("parseClassifierResult - returns empty labels for null input", () => {
  const result = parseClassifierResult(null);

  assertEquals(result.labels, []);
  assertEquals(result.reason, "Parse failed");
});

Deno.test("parseClassifierResult - returns empty labels for undefined input", () => {
  const result = parseClassifierResult(undefined);

  assertEquals(result.labels, []);
  assertEquals(result.reason, "Parse failed");
});

Deno.test("parseClassifierResult - returns empty labels for invalid JSON string", () => {
  const result = parseClassifierResult("not valid json {{{");

  assertEquals(result.labels, []);
  assertEquals(result.reason, "Parse failed");
});

Deno.test("parseClassifierResult - filters out labels without ai_ prefix", () => {
  const input = {
    labels: ["ai_tool", "spam", "ai_sales", "newsletter", "ai_auth"],
    reason: "Mixed labels",
  };
  const result = parseClassifierResult(input);

  assertEquals(result.labels, ["ai_tool", "ai_sales", "ai_auth"]);
  assertEquals(result.reason, "Mixed labels");
});

Deno.test("parseClassifierResult - handles non-array labels", () => {
  const input = { labels: "ai_tool", reason: "Invalid labels type" };
  const result = parseClassifierResult(input);

  assertEquals(result.labels, []);
  assertEquals(result.reason, "Invalid labels array");
});

Deno.test("parseClassifierResult - handles missing labels field", () => {
  const input = { reason: "No labels field" };
  const result = parseClassifierResult(input);

  assertEquals(result.labels, []);
  assertEquals(result.reason, "Invalid labels array");
});

Deno.test("parseClassifierResult - handles missing reason field", () => {
  const input = { labels: ["ai_tool"] };
  const result = parseClassifierResult(input);

  assertEquals(result.labels, ["ai_tool"]);
  assertEquals(result.reason, "No reason provided");
});

Deno.test("parseClassifierResult - handles non-string items in labels array", () => {
  const input = { labels: ["ai_tool", 123, null, "ai_sales", { foo: "bar" }], reason: "Mixed types" };
  const result = parseClassifierResult(input);

  assertEquals(result.labels, ["ai_tool", "ai_sales"]);
});

Deno.test("parseClassifierResult - handles empty labels array", () => {
  const input = { labels: [], reason: "No labels needed" };
  const result = parseClassifierResult(input);

  assertEquals(result.labels, []);
  assertEquals(result.reason, "No labels needed");
});

// ============================================================================
// classifyEmail tests
// ============================================================================

const mockInput: ClassifierInput = {
  subject: "Test subject",
  from: "test@example.com",
  to: "user@example.com",
  cc: "",
  date: "2026-01-17",
  body: "Test body content",
};

Deno.test("classifyEmail - returns parsed result on success", async () => {
  const mockInvoke = () =>
    Promise.resolve({ labels: ["ai_tool"], reason: "Tool notification" });

  const result = await classifyEmail(mockInput, {
    invoke: mockInvoke,
    projectName: "test-project",
    classifierSlug: "test-classifier",
  });

  assertEquals(result.labels, ["ai_tool"]);
  assertEquals(result.reason, "Tool notification");
});

Deno.test("classifyEmail - retries on failure and succeeds", async () => {
  let attempts = 0;
  const mockInvoke = () => {
    attempts++;
    if (attempts < 2) {
      return Promise.reject(new Error("Temporary failure"));
    }
    return Promise.resolve({ labels: ["ai_sales"], reason: "Sales email" });
  };

  const result = await classifyEmail(
    mockInput,
    {
      invoke: mockInvoke,
      projectName: "test-project",
      classifierSlug: "test-classifier",
    },
    2
  );

  assertEquals(attempts, 2);
  assertEquals(result.labels, ["ai_sales"]);
});

Deno.test("classifyEmail - returns empty after max retries", async () => {
  let attempts = 0;
  const mockInvoke = () => {
    attempts++;
    return Promise.reject(new Error("Persistent failure"));
  };

  const result = await classifyEmail(
    mockInput,
    {
      invoke: mockInvoke,
      projectName: "test-project",
      classifierSlug: "test-classifier",
    },
    2
  );

  assertEquals(attempts, 3); // Initial + 2 retries
  assertEquals(result.labels, []);
  assertEquals(result.reason, "Classification failed after retries");
});

Deno.test("classifyEmail - passes correct params to invoke", async () => {
  let capturedParams: unknown;
  const mockInvoke = (params: unknown) => {
    capturedParams = params;
    return Promise.resolve({ labels: [], reason: "Test" });
  };

  await classifyEmail(mockInput, {
    invoke: mockInvoke,
    projectName: "my-project",
    classifierSlug: "my-classifier",
  });

  assertEquals(capturedParams, {
    projectName: "my-project",
    slug: "my-classifier",
    input: mockInput,
  });
});

Deno.test("classifyEmail - handles JSON string response", async () => {
  const mockInvoke = () =>
    Promise.resolve(JSON.stringify({ labels: ["ai_auth"], reason: "2FA code" }));

  const result = await classifyEmail(mockInput, {
    invoke: mockInvoke,
    projectName: "test-project",
    classifierSlug: "test-classifier",
  });

  assertEquals(result.labels, ["ai_auth"]);
  assertEquals(result.reason, "2FA code");
});
