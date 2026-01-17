/**
 * Shared email types used across inbox components.
 */

export interface EmailParticipant {
  name: string;
  email: string;
}

export interface Thread {
  id: string;
  subject: string;
  message_ids: string[];
}

export interface ThreadWithPreview extends Thread {
  latest_draft_or_message: {
    from: EmailParticipant[];
    date: number;
  };
}

export interface Message {
  id: string;
  from: EmailParticipant[];
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  date: number;
  conversation: string;
}
