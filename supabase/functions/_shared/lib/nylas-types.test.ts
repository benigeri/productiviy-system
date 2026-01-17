import { assertEquals } from "@std/assert";
import {
  type NylasFolder,
  type NylasMessage,
  type NylasWebhookPayload,
  WORKFLOW_LABELS,
  type WorkflowLabel,
} from "./nylas-types.ts";

// ============================================================================
// WORKFLOW_LABELS constant tests
// ============================================================================

Deno.test("WORKFLOW_LABELS - contains expected labels", () => {
  assertEquals(WORKFLOW_LABELS.TRIAGE, "wf_triage");
  assertEquals(WORKFLOW_LABELS.RESPOND, "wf_respond");
  assertEquals(WORKFLOW_LABELS.REVIEW, "wf_review");
  assertEquals(WORKFLOW_LABELS.DRAFTED, "wf_drafted");
});

Deno.test("WORKFLOW_LABELS - priority order is correct", () => {
  // Priority: wf_triage > wf_respond > wf_review > wf_drafted
  assertEquals(WORKFLOW_LABELS.PRIORITY_ORDER, [
    "wf_triage",
    "wf_respond",
    "wf_review",
    "wf_drafted",
  ]);
});

Deno.test("WORKFLOW_LABELS - all labels are in priority order", () => {
  const allLabels = [
    WORKFLOW_LABELS.TRIAGE,
    WORKFLOW_LABELS.RESPOND,
    WORKFLOW_LABELS.REVIEW,
    WORKFLOW_LABELS.DRAFTED,
  ];

  // Every label should be in the priority order
  for (const label of allLabels) {
    assertEquals(
      WORKFLOW_LABELS.PRIORITY_ORDER.includes(label),
      true,
      `Label ${label} should be in PRIORITY_ORDER`,
    );
  }

  // Priority order should have exactly these labels
  assertEquals(WORKFLOW_LABELS.PRIORITY_ORDER.length, allLabels.length);
});

// ============================================================================
// Type structure tests (compile-time + runtime shape verification)
// ============================================================================

Deno.test("NylasMessage - type structure is correct", () => {
  // This test verifies the type compiles and has expected shape
  const message: NylasMessage = {
    id: "msg-123",
    grant_id: "grant-456",
    thread_id: "thread-789",
    subject: "Test Subject",
    from: [{ name: "Sender", email: "sender@example.com" }],
    to: [{ name: "Recipient", email: "recipient@example.com" }],
    date: 1704067200,
    folders: ["INBOX", "wf_respond"],
    snippet: "Message preview...",
  };

  assertEquals(message.id, "msg-123");
  assertEquals(message.folders.length, 2);
  assertEquals(message.from[0].email, "sender@example.com");
});

Deno.test("NylasMessage - optional fields work correctly", () => {
  const minimalMessage: NylasMessage = {
    id: "msg-123",
    grant_id: "grant-456",
    thread_id: "thread-789",
    subject: "Test",
    from: [{ email: "sender@example.com" }],
    to: [{ email: "recipient@example.com" }],
    date: 1704067200,
    folders: [],
  };

  assertEquals(minimalMessage.snippet, undefined);
  assertEquals(minimalMessage.from[0].name, undefined);
});

Deno.test("NylasFolder - type structure is correct", () => {
  const folder: NylasFolder = {
    id: "folder-123",
    grant_id: "grant-456",
    name: "wf_respond",
  };

  assertEquals(folder.id, "folder-123");
  assertEquals(folder.name, "wf_respond");
});

Deno.test("NylasWebhookPayload - type structure for message.updated", () => {
  const payload: NylasWebhookPayload = {
    specversion: "1.0",
    type: "message.updated",
    source: "/nylas/application/abc123",
    id: "event-123",
    time: 1704067200,
    data: {
      object: {
        id: "msg-123",
        grant_id: "grant-456",
      },
    },
  };

  assertEquals(payload.type, "message.updated");
  assertEquals(payload.data.object.id, "msg-123");
});

Deno.test("NylasWebhookPayload - type structure for message.created", () => {
  const payload: NylasWebhookPayload = {
    specversion: "1.0",
    type: "message.created",
    source: "/nylas/application/abc123",
    id: "event-456",
    time: 1704067200,
    data: {
      object: {
        id: "msg-456",
        grant_id: "grant-456",
      },
    },
  };

  assertEquals(payload.type, "message.created");
});

// ============================================================================
// WorkflowLabel type tests
// ============================================================================

Deno.test("WorkflowLabel - type accepts valid labels", () => {
  // These should compile without errors
  const label1: WorkflowLabel = "wf_triage";
  const label2: WorkflowLabel = "wf_respond";
  const label3: WorkflowLabel = "wf_review";
  const label4: WorkflowLabel = "wf_drafted";

  assertEquals(label1, WORKFLOW_LABELS.TRIAGE);
  assertEquals(label2, WORKFLOW_LABELS.RESPOND);
  assertEquals(label3, WORKFLOW_LABELS.REVIEW);
  assertEquals(label4, WORKFLOW_LABELS.DRAFTED);
});
