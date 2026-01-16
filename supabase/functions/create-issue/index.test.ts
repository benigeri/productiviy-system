import { assertEquals } from "@std/assert";
import { handleCreateIssue } from "./index.ts";

function setTestEnv() {
  Deno.env.set("BRAINTRUST_API_KEY", "test_braintrust_key");
  Deno.env.set("LINEAR_API_KEY", "test_linear_key");
}

function clearTestEnv() {
  Deno.env.delete("BRAINTRUST_API_KEY");
  Deno.env.delete("LINEAR_API_KEY");
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
});
