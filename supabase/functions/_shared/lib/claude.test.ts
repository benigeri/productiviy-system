import { assertEquals, assertRejects } from "@std/assert";
import { cleanupContent } from "./claude.ts";

// ============================================================================
// cleanupContent tests
// ============================================================================

Deno.test("cleanupContent - cleans up transcribed text", async () => {
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("api.anthropic.com")) {
      const headers = init?.headers as Record<string, string>;
      assertEquals(headers["x-api-key"], "test_api_key");
      assertEquals(headers["anthropic-version"], "2023-06-01");
      assertEquals(headers["content-type"], "application/json");

      const body = JSON.parse(init?.body as string);
      assertEquals(body.model, "claude-sonnet-4-20250514");
      assertEquals(body.max_tokens, 1024);

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                type: "text",
                text: "Create a task for the homepage redesign",
              },
            ],
          }),
      } as Response);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await cleanupContent(
    "um create a task for uh the homepage redesign you know",
    "test_api_key",
    mockFetch,
  );

  assertEquals(result, "Create a task for the homepage redesign");
});

Deno.test("cleanupContent - preserves already clean text", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: "Add dark mode toggle" }],
        }),
    } as Response);

  const result = await cleanupContent(
    "Add dark mode toggle",
    "test_api_key",
    mockFetch,
  );

  assertEquals(result, "Add dark mode toggle");
});

Deno.test("cleanupContent - handles empty input", async () => {
  const result = await cleanupContent("", "test_api_key");

  assertEquals(result, "");
});

Deno.test("cleanupContent - handles whitespace-only input", async () => {
  const result = await cleanupContent("   \n  ", "test_api_key");

  assertEquals(result, "");
});

Deno.test("cleanupContent - throws on API error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response);

  await assertRejects(
    () => cleanupContent("some text", "bad_api_key", mockFetch),
    Error,
    "Claude API error: 401 Unauthorized",
  );
});

Deno.test("cleanupContent - throws on network error", async () => {
  const mockFetch = () => Promise.reject(new Error("Network error"));

  await assertRejects(
    () => cleanupContent("some text", "test_api_key", mockFetch),
    Error,
    "Network error",
  );
});

Deno.test("cleanupContent - handles malformed response", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ unexpected: "structure" }),
    } as Response);

  await assertRejects(
    () => cleanupContent("some text", "test_api_key", mockFetch),
    Error,
    "Invalid Claude response structure",
  );
});
