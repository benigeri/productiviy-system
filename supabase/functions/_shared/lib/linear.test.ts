import { assertEquals, assertRejects } from "@std/assert";
import {
  BACKLOG_STATE_ID,
  createTriageIssue,
  FEEDBACK_PROJECT_ID,
} from "./linear.ts";

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
      assertEquals(
        body.variables.input.teamId,
        "418bd6ee-1f6d-47cc-87f2-88b7371b743a",
      );

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
    mockFetch,
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
    "Users cannot log in with OAuth",
  );

  assertEquals(
    capturedBody!.variables.input.description,
    "Users cannot log in with OAuth",
  );
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
    "Failed to create Linear issue",
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
    "Linear API error: 401 Unauthorized",
  );
});

Deno.test("createTriageIssue - throws on network error", async () => {
  const mockFetch = () => Promise.reject(new Error("Network error"));

  await assertRejects(
    () => createTriageIssue("Test issue", "test_api_key", mockFetch),
    Error,
    "Network error",
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
    "Linear GraphQL error: Team not found",
  );
});

Deno.test("createTriageIssue - throws on argument validation error (e.g., invalid teamId format)", async () => {
  // This error occurs when teamId is not a valid UUID (e.g., using team key "BEN" instead of UUID)
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          errors: [{ message: "Argument Validation Error" }],
        }),
    } as Response);

  await assertRejects(
    () => createTriageIssue("Test issue", "test_api_key", mockFetch),
    Error,
    "Linear GraphQL error: Argument Validation Error",
  );
});

// ============================================================================
// IssueCreateOptions tests (projectId, stateId)
// ============================================================================

Deno.test("createTriageIssue - includes projectId when provided in options", async () => {
  interface CapturedBody {
    variables: { input: { projectId?: string; stateId?: string } };
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
                id: "issue-789",
                identifier: "BEN-44",
                url: "https://linear.app/team/issue/BEN-44",
              },
            },
          },
        }),
    } as Response);
  };

  await createTriageIssue(
    "Feedback item",
    "test_api_key",
    mockFetch,
    "User feedback content",
    undefined, // use default teamId
    { projectId: FEEDBACK_PROJECT_ID },
  );

  assertEquals(capturedBody!.variables.input.projectId, FEEDBACK_PROJECT_ID);
  assertEquals(capturedBody!.variables.input.stateId, undefined);
});

Deno.test("createTriageIssue - includes stateId when provided in options", async () => {
  interface CapturedBody {
    variables: { input: { projectId?: string; stateId?: string } };
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
                id: "issue-790",
                identifier: "BEN-45",
                url: "https://linear.app/team/issue/BEN-45",
              },
            },
          },
        }),
    } as Response);
  };

  await createTriageIssue(
    "Backlog item",
    "test_api_key",
    mockFetch,
    undefined,
    undefined,
    { stateId: BACKLOG_STATE_ID },
  );

  assertEquals(capturedBody!.variables.input.stateId, BACKLOG_STATE_ID);
  assertEquals(capturedBody!.variables.input.projectId, undefined);
});

Deno.test("createTriageIssue - includes both projectId and stateId for feedback routing", async () => {
  interface CapturedBody {
    variables: { input: { projectId?: string; stateId?: string } };
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
                id: "issue-791",
                identifier: "BEN-46",
                url: "https://linear.app/team/issue/BEN-46",
              },
            },
          },
        }),
    } as Response);
  };

  await createTriageIssue(
    "User feedback",
    "test_api_key",
    mockFetch,
    "Great product!",
    undefined,
    { projectId: FEEDBACK_PROJECT_ID, stateId: BACKLOG_STATE_ID },
  );

  assertEquals(capturedBody!.variables.input.projectId, FEEDBACK_PROJECT_ID);
  assertEquals(capturedBody!.variables.input.stateId, BACKLOG_STATE_ID);
});

Deno.test("createTriageIssue - omits projectId and stateId when options is undefined", async () => {
  interface CapturedBody {
    variables: { input: { projectId?: string; stateId?: string } };
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
                id: "issue-792",
                identifier: "BEN-47",
                url: "https://linear.app/team/issue/BEN-47",
              },
            },
          },
        }),
    } as Response);
  };

  await createTriageIssue(
    "Regular issue",
    "test_api_key",
    mockFetch,
    "Description",
  );

  // Verify projectId and stateId are not in the request
  assertEquals("projectId" in capturedBody!.variables.input, false);
  assertEquals("stateId" in capturedBody!.variables.input, false);
});
