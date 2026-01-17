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

Deno.test("isWorkflowLabel - returns true for wf_triage", () => {
  assertEquals(isWorkflowLabel("wf_triage"), true);
});

Deno.test("isWorkflowLabel - returns true for wf_respond", () => {
  assertEquals(isWorkflowLabel("wf_respond"), true);
});

Deno.test("isWorkflowLabel - returns true for wf_review", () => {
  assertEquals(isWorkflowLabel("wf_review"), true);
});

Deno.test("isWorkflowLabel - returns true for wf_drafted", () => {
  assertEquals(isWorkflowLabel("wf_drafted"), true);
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
  assertEquals(isWorkflowLabel("wf_"), false);
  assertEquals(isWorkflowLabel("respond"), false);
});

// ============================================================================
// getWorkflowLabels tests
// ============================================================================

Deno.test("getWorkflowLabels - extracts single workflow label", () => {
  const folders = ["INBOX", "wf_respond", "IMPORTANT"];
  assertEquals(getWorkflowLabels(folders), ["wf_respond"]);
});

Deno.test("getWorkflowLabels - extracts multiple workflow labels", () => {
  const folders = ["INBOX", "wf_triage", "wf_respond", "wf_review", "wf_drafted"];
  assertEquals(getWorkflowLabels(folders), [
    "wf_triage",
    "wf_respond",
    "wf_review",
    "wf_drafted",
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
  const folders = ["wf_drafted", "wf_respond"];
  assertEquals(getWorkflowLabels(folders), ["wf_drafted", "wf_respond"]);
});

// ============================================================================
// removeWorkflowLabels tests
// ============================================================================

Deno.test("removeWorkflowLabels - removes all workflow labels", () => {
  const folders = ["INBOX", "wf_respond", "IMPORTANT", "wf_drafted"];
  assertEquals(removeWorkflowLabels(folders), ["INBOX", "IMPORTANT"]);
});

Deno.test("removeWorkflowLabels - keeps specified label", () => {
  const folders = ["INBOX", "wf_triage", "wf_respond", "wf_review", "wf_drafted"];
  assertEquals(removeWorkflowLabels(folders, "wf_respond"), [
    "INBOX",
    "wf_respond",
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
  const folders = ["INBOX", "wf_respond", "wf_drafted"];
  const result1 = removeWorkflowLabels(folders);
  const result2 = removeWorkflowLabels(result1);
  assertEquals(result1, result2);
});

Deno.test("removeWorkflowLabels - keepLabel that doesn't exist is no-op", () => {
  const folders = ["INBOX", "wf_drafted"];
  assertEquals(removeWorkflowLabels(folders, "wf_respond"), ["INBOX"]);
});

// ============================================================================
// getHighestPriorityLabel tests
// ============================================================================

Deno.test("getHighestPriorityLabel - returns wf_triage as highest", () => {
  const labels = ["wf_drafted", "wf_triage", "wf_respond", "wf_review"];
  assertEquals(getHighestPriorityLabel(labels), "wf_triage");
});

Deno.test("getHighestPriorityLabel - returns wf_respond over wf_review", () => {
  const labels = ["wf_drafted", "wf_respond", "wf_review"];
  assertEquals(getHighestPriorityLabel(labels), "wf_respond");
});

Deno.test("getHighestPriorityLabel - returns wf_review over wf_drafted", () => {
  const labels = ["wf_drafted", "wf_review"];
  assertEquals(getHighestPriorityLabel(labels), "wf_review");
});

Deno.test("getHighestPriorityLabel - returns wf_drafted when only option", () => {
  const labels = ["wf_drafted"];
  assertEquals(getHighestPriorityLabel(labels), "wf_drafted");
});

Deno.test("getHighestPriorityLabel - returns null for empty array", () => {
  assertEquals(getHighestPriorityLabel([]), null);
});

Deno.test("getHighestPriorityLabel - ignores non-workflow labels", () => {
  const labels = ["INBOX", "wf_review", "SENT"];
  assertEquals(getHighestPriorityLabel(labels), "wf_review");
});

Deno.test("getHighestPriorityLabel - returns null when no workflow labels", () => {
  const labels = ["INBOX", "SENT"];
  assertEquals(getHighestPriorityLabel(labels), null);
});

Deno.test("getHighestPriorityLabel - priority order matches WORKFLOW_LABELS", () => {
  // Verify priority: triage > respond > review > drafted
  assertEquals(
    getHighestPriorityLabel([
      WORKFLOW_LABELS.RESPOND,
      WORKFLOW_LABELS.TRIAGE,
    ]),
    WORKFLOW_LABELS.TRIAGE,
  );
  assertEquals(
    getHighestPriorityLabel([WORKFLOW_LABELS.REVIEW, WORKFLOW_LABELS.RESPOND]),
    WORKFLOW_LABELS.RESPOND,
  );
  assertEquals(
    getHighestPriorityLabel([WORKFLOW_LABELS.DRAFTED, WORKFLOW_LABELS.REVIEW]),
    WORKFLOW_LABELS.REVIEW,
  );
  assertEquals(
    getHighestPriorityLabel([
      WORKFLOW_LABELS.DRAFTED,
      WORKFLOW_LABELS.TRIAGE,
    ]),
    WORKFLOW_LABELS.TRIAGE,
  );
});
