import { assertEquals, assertRejects } from "@std/assert";
import { type CaptureDeps, captureToLinear } from "./capture.ts";

function createMockDeps(overrides: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    cleanupContent: () =>
      Promise.resolve("Cleaned title\n\nCleaned description"),
    createTriageIssue: () =>
      Promise.resolve({
        id: "issue-123",
        identifier: "TRI-42",
        url: "https://linear.app/team/issue/TRI-42",
      }),
    ...overrides,
  };
}

Deno.test("captureToLinear - creates issue with cleaned content", async () => {
  let cleanupCalled = false;
  let createIssueCalled = false;
  let capturedTitle = "";
  let capturedDescription: string | undefined;

  const deps = createMockDeps({
    cleanupContent: (text) => {
      cleanupCalled = true;
      assertEquals(text, "raw input");
      return Promise.resolve("Clean Title\n\nClean description here");
    },
    createTriageIssue: (title, description) => {
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

  assertEquals(cleanupCalled, true);
  assertEquals(createIssueCalled, true);
  assertEquals(capturedTitle, "Clean Title");
  assertEquals(capturedDescription, "Clean description here");
  assertEquals(result.identifier, "TRI-99");
});

Deno.test("captureToLinear - handles title only (no description)", async () => {
  let capturedDescription: string | undefined = "should-be-undefined";

  const deps = createMockDeps({
    cleanupContent: () => Promise.resolve("Just a title"),
    createTriageIssue: (_title, description) => {
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

Deno.test("captureToLinear - throws on empty content after cleanup", async () => {
  const deps = createMockDeps({
    cleanupContent: () => Promise.resolve(""),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Cleanup resulted in empty content",
  );
});

Deno.test("captureToLinear - throws on whitespace-only content after cleanup", async () => {
  const deps = createMockDeps({
    cleanupContent: () => Promise.resolve("   \n\n   "),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Cleanup resulted in empty content",
  );
});

Deno.test("captureToLinear - propagates cleanup errors", async () => {
  const deps = createMockDeps({
    cleanupContent: () => Promise.reject(new Error("Claude API error")),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Claude API error",
  );
});

Deno.test("captureToLinear - propagates Linear errors", async () => {
  const deps = createMockDeps({
    createTriageIssue: () => Promise.reject(new Error("Linear API error")),
  });

  await assertRejects(
    () => captureToLinear("some input", deps),
    Error,
    "Linear API error",
  );
});
