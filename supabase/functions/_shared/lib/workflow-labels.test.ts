import { assertEquals } from "@std/assert";
import {
  getWorkflowLabels,
  isWorkflowLabel,
  removeWorkflowLabels,
} from "./workflow-labels.ts";

// ============================================================================
// isWorkflowLabel tests
// ============================================================================

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
  const folders = ["INBOX", "wf_respond", "wf_review", "wf_drafted"];
  assertEquals(getWorkflowLabels(folders), [
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
