import { assertEquals } from "@std/assert";
import { parseIssueContent } from "./parse.ts";

// ============================================================================
// parseIssueContent tests
// ============================================================================

Deno.test("parseIssueContent - extracts title from single line", () => {
  const result = parseIssueContent("Fix the bug");

  assertEquals(result.title, "Fix the bug");
  assertEquals(result.description, undefined);
});

Deno.test("parseIssueContent - extracts title and description from multiline", () => {
  const result = parseIssueContent(
    "Fix the bug\nThis is a description\nWith multiple lines",
  );

  assertEquals(result.title, "Fix the bug");
  assertEquals(
    result.description,
    "This is a description\nWith multiple lines",
  );
});

Deno.test("parseIssueContent - trims whitespace from title", () => {
  const result = parseIssueContent("  Fix the bug  ");

  assertEquals(result.title, "Fix the bug");
});

Deno.test("parseIssueContent - trims whitespace from description", () => {
  const result = parseIssueContent("Fix the bug\n  This is a description  \n");

  assertEquals(result.title, "Fix the bug");
  assertEquals(result.description, "This is a description");
});

Deno.test("parseIssueContent - handles empty description lines", () => {
  const result = parseIssueContent("Fix the bug\n\n");

  assertEquals(result.title, "Fix the bug");
  assertEquals(result.description, undefined);
});

Deno.test("parseIssueContent - preserves prefix tags", () => {
  const result = parseIssueContent(
    "// fb - ethan - Qualification questions\nAsk about team size\nAsk about budget",
  );

  assertEquals(result.title, "// fb - ethan - Qualification questions");
  assertEquals(result.description, "Ask about team size\nAsk about budget");
});
