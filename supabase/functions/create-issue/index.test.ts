import { assertEquals } from "@std/assert";
import { handleCreateIssue, type CreateIssueDeps } from "./index.ts";

function setTestEnv() {
  Deno.env.set("BRAINTRUST_API_KEY", "test_braintrust_key");
  Deno.env.set("LINEAR_API_KEY", "test_linear_key");
}

function clearTestEnv() {
  Deno.env.delete("BRAINTRUST_API_KEY");
  Deno.env.delete("LINEAR_API_KEY");
}

/**
 * Create mock dependencies for testing happy paths
 */
function createMockDeps(overrides: Partial<CreateIssueDeps> = {}): CreateIssueDeps {
  return {
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "Test Issue Title\n\nTest description",
        isFeedback: false,
      }),
    createIssue: () =>
      Promise.resolve({
        id: "test-id-123",
        identifier: "BEN-42",
        url: "https://linear.app/test/issue/BEN-42",
      }),
    ...overrides,
  };
}

Deno.test("handleCreateIssue - handles CORS preflight", async () => {
  const request = new Request("http://localhost/create-issue", {
    method: "OPTIONS",
  });

  const response = await handleCreateIssue(request);

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("handleCreateIssue - rejects non-POST methods", async () => {
  const request = new Request("http://localhost/create-issue", {
    method: "GET",
  });

  const response = await handleCreateIssue(request);
  const body = await response.json();

  assertEquals(response.status, 405);
  assertEquals(body.ok, false);
  assertEquals(body.error, "Method not allowed");
});

Deno.test("handleCreateIssue - rejects missing text field", async () => {
  setTestEnv();
  try {
    const request = new Request("http://localhost/create-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await handleCreateIssue(request);
    const body = await response.json();

    assertEquals(response.status, 400);
    assertEquals(body.ok, false);
    assertEquals(body.error, "Missing or invalid 'text' field");
  } finally {
    clearTestEnv();
  }
});

Deno.test("handleCreateIssue - rejects empty text", async () => {
  setTestEnv();
  try {
    const request = new Request("http://localhost/create-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });

    const response = await handleCreateIssue(request);
    const body = await response.json();

    assertEquals(response.status, 400);
    assertEquals(body.ok, false);
    assertEquals(body.error, "Text cannot be empty");
  } finally {
    clearTestEnv();
  }
});

Deno.test("handleCreateIssue - returns 500 when API keys missing", async () => {
  // Ensure keys are not set
  clearTestEnv();

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Test issue" }),
  });

  const response = await handleCreateIssue(request);
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.ok, false);
  assertEquals(body.error, "Server configuration error");
  assertEquals(body.code, "CONFIG_ERROR");
});

// =============================================================================
// Happy Path Tests
// =============================================================================

Deno.test("handleCreateIssue - creates issue successfully", async () => {
  const mockDeps = createMockDeps();

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Fix the login button" }),
  });

  const response = await handleCreateIssue(request, mockDeps);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.issue.identifier, "BEN-42");
  assertEquals(body.issue.url, "https://linear.app/test/issue/BEN-42");
});

Deno.test("handleCreateIssue - routes feedback correctly", async () => {
  let capturedOptions: { projectId?: string; stateId?: string } | undefined;

  const mockDeps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "fb - John Doe: Great product!",
        isFeedback: true,
      }),
    createIssue: (_title, _description, options) => {
      capturedOptions = options;
      return Promise.resolve({
        id: "feedback-id",
        identifier: "BEN-100",
        url: "https://linear.app/test/issue/BEN-100",
      });
    },
  });

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "fb - John Doe - Great product!" }),
  });

  const response = await handleCreateIssue(request, mockDeps);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  // Verify feedback routing options were passed
  assertEquals(capturedOptions?.projectId, "4884f918-c57e-480e-8413-51bff5f933f8");
  assertEquals(capturedOptions?.stateId, "e02b40e5-d86b-4c35-a81d-74cd3ad0a150");
});

Deno.test("handleCreateIssue - handles multiline text (title + description)", async () => {
  let capturedTitle: string | undefined;
  let capturedDescription: string | undefined;

  const mockDeps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "Add user authentication\n\nWe need OAuth support for login",
        isFeedback: false,
      }),
    createIssue: (title, description) => {
      capturedTitle = title;
      capturedDescription = description;
      return Promise.resolve({
        id: "multi-id",
        identifier: "BEN-200",
        url: "https://linear.app/test/issue/BEN-200",
      });
    },
  });

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Add user authentication\n\nWe need OAuth support" }),
  });

  const response = await handleCreateIssue(request, mockDeps);
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(capturedTitle, "Add user authentication");
  assertEquals(capturedDescription, "We need OAuth support for login");
});

// =============================================================================
// Error Handling Tests
// =============================================================================

Deno.test("handleCreateIssue - handles Braintrust API failure", async () => {
  const mockDeps = createMockDeps({
    processCapture: () =>
      Promise.reject(new Error("Braintrust API error: 500 Internal Server Error")),
  });

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Test issue" }),
  });

  const response = await handleCreateIssue(request, mockDeps);
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.ok, false);
  assertEquals(body.code, "BRAINTRUST_ERROR");
});

Deno.test("handleCreateIssue - handles Linear API failure", async () => {
  const mockDeps = createMockDeps({
    createIssue: () =>
      Promise.reject(new Error("Linear API error: 401 Unauthorized")),
  });

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Test issue" }),
  });

  const response = await handleCreateIssue(request, mockDeps);
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.ok, false);
  assertEquals(body.code, "LINEAR_ERROR");
});

Deno.test("handleCreateIssue - handles empty after cleanup", async () => {
  const mockDeps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "",
        isFeedback: false,
      }),
  });

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "um like you know" }),
  });

  const response = await handleCreateIssue(request, mockDeps);
  const body = await response.json();

  assertEquals(response.status, 400);
  assertEquals(body.ok, false);
  assertEquals(body.code, "EMPTY_AFTER_CLEANUP");
});

Deno.test("handleCreateIssue - handles timeout error", async () => {
  const mockDeps = createMockDeps({
    processCapture: () =>
      Promise.reject(new Error("Request timed out after 30000ms")),
  });

  const request = new Request("http://localhost/create-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Test issue" }),
  });

  const response = await handleCreateIssue(request, mockDeps);
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.ok, false);
  assertEquals(body.code, "TIMEOUT");
});

// =============================================================================
// Error Code Tests (verify machine-readable codes)
// =============================================================================

Deno.test("handleCreateIssue - error responses include code field", async () => {
  const request = new Request("http://localhost/create-issue", {
    method: "GET",
  });

  const response = await handleCreateIssue(request);
  const body = await response.json();

  assertEquals(body.code, "INVALID_METHOD");
});

Deno.test("handleCreateIssue - missing text has MISSING_TEXT code", async () => {
  setTestEnv();
  try {
    const request = new Request("http://localhost/create-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await handleCreateIssue(request);
    const body = await response.json();

    assertEquals(body.code, "MISSING_TEXT");
  } finally {
    clearTestEnv();
  }
});

Deno.test("handleCreateIssue - empty text has EMPTY_TEXT code", async () => {
  setTestEnv();
  try {
    const request = new Request("http://localhost/create-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });

    const response = await handleCreateIssue(request);
    const body = await response.json();

    assertEquals(body.code, "EMPTY_TEXT");
  } finally {
    clearTestEnv();
  }
});
