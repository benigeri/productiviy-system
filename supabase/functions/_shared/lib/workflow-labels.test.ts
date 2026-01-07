import { assertEquals } from "@std/assert";
import {
  getHighestPriorityLabel,
  getWorkflowLabels,
  isWorkflowLabel,
  removeWorkflowLabels,
} from "./workflow-labels.ts";
import { WORKFLOW_LABELS } from "./nylas-types.ts";

// ============================================================================
// isWorkflowLabel tests
// ============================================================================

Deno.test("isWorkflowLabel - returns true for to-respond-paul", () => {
  assertEquals(isWorkflowLabel("to-respond-paul"), true);
});

Deno.test("isWorkflowLabel - returns true for to-read-paul", () => {
  assertEquals(isWorkflowLabel("to-read-paul"), true);
});

Deno.test("isWorkflowLabel - returns true for drafted", () => {
  assertEquals(isWorkflowLabel("drafted"), true);
});

Deno.test("isWorkflowLabel - returns false for INBOX", () => {
  assertEquals(isWorkflowLabel("INBOX"), false);
});

Deno.test("isWorkflowLabel - returns false for random folder", () => {
  assertEquals(isWorkflowLabel("some-random-folder"), false);
});

Deno.test("isWorkflowLabel - returns false for empty string", () => {
  assertEquals(isWorkflowLabel(""), false);
});

Deno.test("isWorkflowLabel - returns false for partial match", () => {
  assertEquals(isWorkflowLabel("to-respond"), false);
  assertEquals(isWorkflowLabel("paul"), false);
});

// ============================================================================
// getWorkflowLabels tests
// ============================================================================

Deno.test("getWorkflowLabels - extracts single workflow label", () => {
  const folders = ["INBOX", "to-respond-paul", "IMPORTANT"];
  assertEquals(getWorkflowLabels(folders), ["to-respond-paul"]);
});

Deno.test("getWorkflowLabels - extracts multiple workflow labels", () => {
  const folders = ["INBOX", "to-respond-paul", "to-read-paul", "drafted"];
  assertEquals(getWorkflowLabels(folders), [
    "to-respond-paul",
    "to-read-paul",
    "drafted",
  ]);
});

Deno.test("getWorkflowLabels - returns empty array when no workflow labels", () => {
  const folders = ["INBOX", "SENT", "TRASH"];
  assertEquals(getWorkflowLabels(folders), []);
});

Deno.test("getWorkflowLabels - returns empty array for empty input", () => {
  assertEquals(getWorkflowLabels([]), []);
});

Deno.test("getWorkflowLabels - preserves order from input", () => {
  const folders = ["drafted", "to-respond-paul"];
  assertEquals(getWorkflowLabels(folders), ["drafted", "to-respond-paul"]);
});

// ============================================================================
// removeWorkflowLabels tests
// ============================================================================

Deno.test("removeWorkflowLabels - removes all workflow labels", () => {
  const folders = ["INBOX", "to-respond-paul", "IMPORTANT", "drafted"];
  assertEquals(removeWorkflowLabels(folders), ["INBOX", "IMPORTANT"]);
});

Deno.test("removeWorkflowLabels - keeps specified label", () => {
  const folders = ["INBOX", "to-respond-paul", "to-read-paul", "drafted"];
  assertEquals(removeWorkflowLabels(folders, "to-respond-paul"), [
    "INBOX",
    "to-respond-paul",
  ]);
});

Deno.test("removeWorkflowLabels - returns same array if no workflow labels", () => {
  const folders = ["INBOX", "SENT"];
  assertEquals(removeWorkflowLabels(folders), ["INBOX", "SENT"]);
});

Deno.test("removeWorkflowLabels - returns empty array for empty input", () => {
  assertEquals(removeWorkflowLabels([]), []);
});

Deno.test("removeWorkflowLabels - idempotent: running twice gives same result", () => {
  const folders = ["INBOX", "to-respond-paul", "drafted"];
  const result1 = removeWorkflowLabels(folders);
  const result2 = removeWorkflowLabels(result1);
  assertEquals(result1, result2);
});

Deno.test("removeWorkflowLabels - keepLabel that doesn't exist is no-op", () => {
  const folders = ["INBOX", "drafted"];
  assertEquals(removeWorkflowLabels(folders, "to-respond-paul"), ["INBOX"]);
});

// ============================================================================
// getHighestPriorityLabel tests
// ============================================================================

Deno.test("getHighestPriorityLabel - returns to-respond-paul as highest", () => {
  const labels = ["drafted", "to-respond-paul", "to-read-paul"];
  assertEquals(getHighestPriorityLabel(labels), "to-respond-paul");
});

Deno.test("getHighestPriorityLabel - returns to-read-paul over drafted", () => {
  const labels = ["drafted", "to-read-paul"];
  assertEquals(getHighestPriorityLabel(labels), "to-read-paul");
});

Deno.test("getHighestPriorityLabel - returns drafted when only option", () => {
  const labels = ["drafted"];
  assertEquals(getHighestPriorityLabel(labels), "drafted");
});

Deno.test("getHighestPriorityLabel - returns null for empty array", () => {
  assertEquals(getHighestPriorityLabel([]), null);
});

Deno.test("getHighestPriorityLabel - ignores non-workflow labels", () => {
  const labels = ["INBOX", "to-read-paul", "SENT"];
  assertEquals(getHighestPriorityLabel(labels), "to-read-paul");
});

Deno.test("getHighestPriorityLabel - returns null when no workflow labels", () => {
  const labels = ["INBOX", "SENT"];
  assertEquals(getHighestPriorityLabel(labels), null);
});

Deno.test("getHighestPriorityLabel - priority order matches WORKFLOW_LABELS", () => {
  // Verify priority: to-respond > to-read > drafted
  assertEquals(
    getHighestPriorityLabel([
      WORKFLOW_LABELS.TO_READ,
      WORKFLOW_LABELS.TO_RESPOND,
    ]),
    WORKFLOW_LABELS.TO_RESPOND,
  );
  assertEquals(
    getHighestPriorityLabel([WORKFLOW_LABELS.DRAFTED, WORKFLOW_LABELS.TO_READ]),
    WORKFLOW_LABELS.TO_READ,
  );
  assertEquals(
    getHighestPriorityLabel([
      WORKFLOW_LABELS.DRAFTED,
      WORKFLOW_LABELS.TO_RESPOND,
    ]),
    WORKFLOW_LABELS.TO_RESPOND,
  );
});
