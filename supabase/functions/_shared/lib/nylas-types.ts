/**
 * Nylas API types for email workflow automation.
 * Used by nylas-webhook and related edge functions.
 */

// Email participant (from/to/cc/bcc fields)
export interface NylasEmailParticipant {
  email: string;
  name?: string;
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
  TO_RESPOND: "to-respond-paul",
  TO_READ: "to-read-paul",
  DRAFTED: "drafted",
  // Priority order: higher index = lower priority
  PRIORITY_ORDER: ["to-respond-paul", "to-read-paul", "drafted"] as const,
} as const;

// Type for workflow label values
export type WorkflowLabel =
  | typeof WORKFLOW_LABELS.TO_RESPOND
  | typeof WORKFLOW_LABELS.TO_READ
  | typeof WORKFLOW_LABELS.DRAFTED;
