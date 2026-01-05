import { assertEquals, assertRejects } from "@std/assert";
import { createTriageIssue } from "./linear.ts";

// ============================================================================
// createTriageIssue tests
// ============================================================================

Deno.test("createTriageIssue - creates issue in triage", async () => {
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("api.linear.app")) {
      const headers = init?.headers as Record<string, string>;
      assertEquals(headers["Authorization"], "test_api_key");
      assertEquals(headers["Content-Type"], "application/json");

      const body = JSON.parse(init?.body as string);
      assertEquals(body.query.includes("issueCreate"), true);
      assertEquals(body.variables.input.title, "Homepage redesign task");
      assertEquals(body.variables.input.teamId, "BEN");

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueCreate: {
                success: true,
                issue: {
                  id: "issue-123",
                  identifier: "BEN-42",
                  url: "https://linear.app/team/issue/BEN-42",
                },
              },
            },
          }),
      } as Response);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await createTriageIssue(
    "Homepage redesign task",
    "test_api_key",
    mockFetch
  );

  assertEquals(result.id, "issue-123");
  assertEquals(result.identifier, "BEN-42");
  assertEquals(result.url, "https://linear.app/team/issue/BEN-42");
});

Deno.test("createTriageIssue - includes description when provided", async () => {
  interface CapturedBody {
    variables: { input: { description?: string } };
  }
  let capturedBody: CapturedBody | null = null;

  const mockFetch = (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(init?.body as string) as CapturedBody;
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue-456",
                identifier: "BEN-43",
                url: "https://linear.app/team/issue/BEN-43",
              },
            },
          },
        }),
    } as Response);
  };

  await createTriageIssue(
    "Fix login bug",
    "test_api_key",
    mockFetch,
    "Users cannot log in with OAuth"
  );

  assertEquals(capturedBody!.variables.input.description, "Users cannot log in with OAuth");
});

Deno.test("createTriageIssue - throws on API failure", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            issueCreate: {
              success: false,
              issue: null,
            },
          },
        }),
    } as Response);

  await assertRejects(
    () => createTriageIssue("Test issue", "test_api_key", mockFetch),
    Error,
    "Failed to create Linear issue"
  );
});

Deno.test("createTriageIssue - throws on HTTP error", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response);

  await assertRejects(
    () => createTriageIssue("Test issue", "bad_api_key", mockFetch),
    Error,
    "Linear API error: 401 Unauthorized"
  );
});

Deno.test("createTriageIssue - throws on network error", async () => {
  const mockFetch = () => Promise.reject(new Error("Network error"));

  await assertRejects(
    () => createTriageIssue("Test issue", "test_api_key", mockFetch),
    Error,
    "Network error"
  );
});

Deno.test("createTriageIssue - throws on GraphQL errors", async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          errors: [{ message: "Team not found" }],
        }),
    } as Response);

  await assertRejects(
    () => createTriageIssue("Test issue", "test_api_key", mockFetch),
    Error,
    "Linear GraphQL error: Team not found"
  );
});
