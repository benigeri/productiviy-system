/**
 * Nylas API types for email workflow automation.
 * Used by nylas-webhook and related edge functions.
 */

// Email participant (from/to/cc/bcc fields)
export interface NylasEmailParticipant {
  email: string;
  name?: string;
}

// Nylas attachment structure
export interface NylasAttachment {
  id: string;
  filename?: string;
  content_type: string;
  size?: number;
}

// Nylas message structure from GET /messages/{id}
export interface NylasMessage {
  id: string;
  grant_id: string;
  thread_id: string;
  subject: string;
  from: NylasEmailParticipant[];
  to: NylasEmailParticipant[];
  cc?: NylasEmailParticipant[];
  bcc?: NylasEmailParticipant[];
  date: number; // Unix timestamp
  folders: string[]; // Folder/label IDs
  snippet?: string; // Plain text preview
  body?: string; // Full HTML body (when fetched with expand=body)
  attachments?: NylasAttachment[]; // File attachments
}

// Nylas thread structure from GET /threads/{id}
export interface NylasThread {
  id: string;
  grant_id: string;
  subject: string;
  participants: NylasEmailParticipant[];
  message_ids: string[];
  snippet?: string;
  folders: string[];
  latest_draft_or_message?: {
    id: string;
    date: number;
  };
}

// Nylas folder/label structure from GET /folders
export interface NylasFolder {
  id: string;
  grant_id: string;
  name: string;
  system_folder?: string; // INBOX, SENT, TRASH, etc.
  total_count?: number;
  unread_count?: number;
}

// Webhook payload data object (truncated version)
export interface NylasWebhookDataObject {
  id: string;
  grant_id: string;
}

// Nylas webhook payload (CloudEvents format)
export interface NylasWebhookPayload {
  specversion: string;
  type:
    | "message.created"
    | "message.updated"
    | "message.send_success"
    | "message.send_failed";
  source: string;
  id: string;
  time: number;
  data: {
    object: NylasWebhookDataObject;
  };
}

// Workflow labels for email triage
export const WORKFLOW_LABELS = {
  RESPOND: "wf_respond",
  REVIEW: "wf_review",
  DRAFTED: "wf_drafted",
  // Priority order: higher index = lower priority
  PRIORITY_ORDER: ["wf_respond", "wf_review", "wf_drafted"] as const,
} as const;

// Type for workflow label values
export type WorkflowLabel =
  | typeof WORKFLOW_LABELS.RESPOND
  | typeof WORKFLOW_LABELS.REVIEW
  | typeof WORKFLOW_LABELS.DRAFTED;

// AI labels for automatic classification (NOT mutually exclusive)
export const AI_LABELS = {
  AUTO_REPLY: "ai_auto_reply",
  GROUP_CC: "ai_group_cc",
  TOOL: "ai_tool",
  SERVICE: "ai_service",
  AUTH: "ai_auth",
  TRANSACTION: "ai_transaction",
  LARGE_PAYMENT: "ai_large_payment",
  SALES: "ai_sales",
  CALENDAR: "ai_calendar",
} as const;

export type AILabel = typeof AI_LABELS[keyof typeof AI_LABELS];

// Clean message response from PUT /messages/clean
export interface NylasCleanMessage {
  body: string; // Cleaned content (markdown if html_as_markdown: true)
  grant_id: string;
  conversation?: string; // Conversation thread text
  message_id?: string[]; // IDs of messages in the conversation
  from?: NylasEmailParticipant[];
}
