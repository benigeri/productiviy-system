import { assertEquals, assertRejects } from "@std/assert";
import {
  type CaptureDeps,
  type CaptureResult,
  captureToLinear,
} from "./capture.ts";
import {
  BACKLOG_STATE_ID,
  FEEDBACK_PROJECT_ID,
  type IssueCreateOptions,
} from "./linear.ts";

function createMockDeps(overrides: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "Cleaned title\n\nCleaned description",
        isFeedback: false,
      }),
    createIssue: () =>
      Promise.resolve({
        id: "issue-123",
        identifier: "TRI-42",
        url: "https://linear.app/team/issue/TRI-42",
      }),
    ...overrides,
  };
}

// ============================================================================
// Basic pipeline tests
// ============================================================================

Deno.test("captureToLinear - creates issue with cleaned content", async () => {
  let processCalled = false;
  let createIssueCalled = false;
  let capturedTitle = "";
  let capturedDescription: string | undefined;

  const deps = createMockDeps({
    processCapture: (text) => {
      processCalled = true;
      assertEquals(text, "raw input");
      return Promise.resolve({
        cleanedContent: "Clean Title\n\nClean description here",
        isFeedback: false,
      });
    },
    createIssue: (title, description) => {
      createIssueCalled = true;
      capturedTitle = title;
      capturedDescription = description;
      return Promise.resolve({
        id: "issue-456",
        identifier: "TRI-99",
        url: "https://linear.app/team/issue/TRI-99",
      });
    },
  });

  const result = await captureToLinear("raw input", deps);

  assertEquals(processCalled, true);
  assertEquals(createIssueCalled, true);
  assertEquals(capturedTitle, "Clean Title");
  assertEquals(capturedDescription, "Clean description here");
  assertEquals(result.identifier, "TRI-99");
});

Deno.test("captureToLinear - handles title only (no description)", async () => {
  let capturedDescription: string | undefined = "should-be-undefined";

  const deps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "Just a title",
        isFeedback: false,
      }),
    createIssue: (_title, description) => {
      capturedDescription = description;
      return Promise.resolve({
        id: "issue-789",
        identifier: "TRI-50",
        url: "https://linear.app/team/issue/TRI-50",
      });
    },
  });

  const result = await captureToLinear("some input", deps);

  assertEquals(capturedDescription, undefined);
  assertEquals(result.identifier, "TRI-50");
});

Deno.test("captureToLinear - throws on empty content after processing", async () => {
  const deps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "",
        isFeedback: false,
      }),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Cleanup resulted in empty content",
  );
});

Deno.test("captureToLinear - throws on whitespace-only content after processing", async () => {
  const deps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "   \n\n   ",
        isFeedback: false,
      }),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Cleanup resulted in empty content",
  );
});

Deno.test("captureToLinear - propagates processing errors", async () => {
  const deps = createMockDeps({
    processCapture: () => Promise.reject(new Error("Braintrust API error")),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Braintrust API error",
  );
});

Deno.test("captureToLinear - propagates Linear errors", async () => {
  const deps = createMockDeps({
    createIssue: () => Promise.reject(new Error("Linear API error")),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Linear API error",
  );
});

// ============================================================================
// Feedback routing tests
// ============================================================================

Deno.test("captureToLinear - routes feedback to Feedback project in Backlog state", async () => {
  let capturedOptions: IssueCreateOptions | undefined;

  const deps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "John Doe - Great product!",
        isFeedback: true,
      }),
    createIssue: (_title, _description, options) => {
      capturedOptions = options;
      return Promise.resolve({
        id: "feedback-123",
        identifier: "BEN-100",
        url: "https://linear.app/team/issue/BEN-100",
      });
    },
  });

  const result = await captureToLinear(
    "// fb - John Doe - Great product!",
    deps,
  );

  assertEquals(capturedOptions?.projectId, FEEDBACK_PROJECT_ID);
  assertEquals(capturedOptions?.stateId, BACKLOG_STATE_ID);
  assertEquals(result.identifier, "BEN-100");
});

Deno.test("captureToLinear - regular items do not get routing options", async () => {
  let capturedOptions: IssueCreateOptions | undefined = {
    projectId: "should-be-undefined",
  };

  const deps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent: "Fix the login button",
        isFeedback: false,
      }),
    createIssue: (_title, _description, options) => {
      capturedOptions = options;
      return Promise.resolve({
        id: "issue-456",
        identifier: "BEN-101",
        url: "https://linear.app/team/issue/BEN-101",
      });
    },
  });

  const result = await captureToLinear("Fix the login button", deps);

  assertEquals(capturedOptions, undefined);
  assertEquals(result.identifier, "BEN-101");
});

Deno.test("captureToLinear - feedback with description routes correctly", async () => {
  let capturedTitle = "";
  let capturedDescription: string | undefined;
  let capturedOptions: IssueCreateOptions | undefined;

  const deps = createMockDeps({
    processCapture: () =>
      Promise.resolve({
        cleanedContent:
          "Customer Feedback\n\nThe product is amazing, keep up the good work!",
        isFeedback: true,
      }),
    createIssue: (title, description, options) => {
      capturedTitle = title;
      capturedDescription = description;
      capturedOptions = options;
      return Promise.resolve({
        id: "feedback-789",
        identifier: "BEN-102",
        url: "https://linear.app/team/issue/BEN-102",
      });
    },
  });

  await captureToLinear("// fb - Customer Feedback...", deps);

  assertEquals(capturedTitle, "Customer Feedback");
  assertEquals(
    capturedDescription,
    "The product is amazing, keep up the good work!",
  );
  assertEquals(capturedOptions?.projectId, FEEDBACK_PROJECT_ID);
  assertEquals(capturedOptions?.stateId, BACKLOG_STATE_ID);
});
