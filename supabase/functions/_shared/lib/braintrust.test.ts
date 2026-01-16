import { assertEquals, assertRejects } from "@std/assert";
import { processCapture } from "./braintrust.ts";

// Helper to create chat completion response
function createChatResponse(cleanedContent: string, isFeedback: boolean) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          cleaned_content: cleanedContent,
          is_feedback: isFeedback,
        }),
      },
    }],
  };
}

// ============================================================================
// processCapture tests
// ============================================================================

Deno.test("processCapture - processes regular text", async () => {
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("braintrustproxy.com/v1/chat/completions")) {
      const headers = init?.headers as Record<string, string>;
      assertEquals(headers["Authorization"], "Bearer test_api_key");
      assertEquals(headers["Content-Type"], "application/json");

      const body = JSON.parse(init?.body as string);
      assertEquals(body.model, "claude-3-5-haiku-20241022");
      assertEquals(body.messages.length, 2);
      assertEquals(body.messages[0].role, "system");
      assertEquals(body.messages[1].role, "user");

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(createChatResponse("Fix the login button", false)),
      } as Response);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await processCapture(
    "Fix the login button",
    "test_api_key",
    "Test_Project",
    "capture-cleanup",
    mockFetch,
  );

  assertEquals(result.cleanedContent, "Fix the login button");
  assertEquals(result.isFeedback, false);
});

Deno.test("processCapture - detects feedback items", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(createChatResponse("John Doe - Great product!", true)),
    } as Response);

  const result = await processCapture(
    "// fb - John Doe - Great product!",
    "test_api_key",
    "Test_Project",
    "capture-cleanup",
    mockFetch,
  );

  assertEquals(result.cleanedContent, "John Doe - Great product!");
  assertEquals(result.isFeedback, true);
});

Deno.test("processCapture - handles empty input", async () => {
  const mockFetch = () => {
    throw new Error("Should not call API for empty input");
  };

  const result = await processCapture(
    "   ",
    "test_api_key",
    "Test_Project",
    "capture-cleanup",
    mockFetch,
  );

  assertEquals(result.cleanedContent, "");
  assertEquals(result.isFeedback, false);
});

Deno.test("processCapture - trims input before sending", async () => {
  let capturedInput = "";

  const mockFetch = (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    capturedInput = body.messages[1].content;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(createChatResponse("Hello world", false)),
    } as Response);
  };

  await processCapture(
    "  Hello world  ",
    "test_api_key",
    "Test_Project",
    "capture-cleanup",
    mockFetch,
  );

  // User message should contain trimmed text
  assertEquals(capturedInput.includes("Hello world"), true);
  assertEquals(capturedInput.includes("  Hello world  "), false);
});

Deno.test("processCapture - throws on API error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("Invalid API key"),
    } as Response);

  await assertRejects(
    () =>
      processCapture(
        "Test input",
        "bad_api_key",
        "Test_Project",
        "capture-cleanup",
        mockFetch,
      ),
    Error,
    "Braintrust API error: 401 Unauthorized",
  );
});

Deno.test("processCapture - throws on invalid response structure", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                // Missing cleaned_content
                is_feedback: false,
              }),
            },
          }],
        }),
    } as Response);

  await assertRejects(
    () =>
      processCapture(
        "Test input",
        "test_api_key",
        "Test_Project",
        "capture-cleanup",
        mockFetch,
      ),
    Error,
    "Invalid Braintrust response: missing cleaned_content",
  );
});

Deno.test("processCapture - defaults is_feedback to false when missing", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                cleaned_content: "Some content",
                // is_feedback not provided
              }),
            },
          }],
        }),
    } as Response);

  const result = await processCapture(
    "Test input",
    "test_api_key",
    "Test_Project",
    "capture-cleanup",
    mockFetch,
  );

  assertEquals(result.isFeedback, false);
});

Deno.test("processCapture - throws on invalid JSON in response", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{
            message: {
              content: "not valid json",
            },
          }],
        }),
    } as Response);

  await assertRejects(
    () =>
      processCapture(
        "Test input",
        "test_api_key",
        "Test_Project",
        "capture-cleanup",
        mockFetch,
      ),
    Error,
    "Invalid Braintrust response: could not parse JSON",
  );
});

Deno.test("processCapture - throws on empty response choices", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [],
        }),
    } as Response);

  await assertRejects(
    () =>
      processCapture(
        "Test input",
        "test_api_key",
        "Test_Project",
        "capture-cleanup",
        mockFetch,
      ),
    Error,
    "Invalid Braintrust response: no content in response",
  );
});

Deno.test("processCapture - handles JSON wrapped in markdown code blocks", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{
            message: {
              content: "```json\n{\n  \"cleaned_content\": \"Test content\",\n  \"is_feedback\": true\n}\n```",
            },
          }],
        }),
    } as Response);

  const result = await processCapture(
    "Test input",
    "test_api_key",
    "Test_Project",
    "capture-cleanup",
    mockFetch,
  );

  assertEquals(result.cleanedContent, "Test content");
  assertEquals(result.isFeedback, true);
});
