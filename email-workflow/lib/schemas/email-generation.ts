import { z } from 'zod';

// Shared conversation message schema
export const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const ConversationHistorySchema = z.array(ConversationMessageSchema);

// Shared recipients schema
export const RecipientsSchema = z.object({
  to: z.array(z.string()),
  cc: z.array(z.string()),
});

// Inferred types from schemas
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ConversationHistory = z.infer<typeof ConversationHistorySchema>;
export type Recipients = z.infer<typeof RecipientsSchema>;

// API response types for client-side type safety
export interface ComposeApiResponse {
  success: boolean;
  subject: string;
  to: string[];
  cc: string[];
  body: string;
  error?: string;
}

export interface DraftApiResponse {
  success: boolean;
  to: string[];
  cc: string[];
  body: string;
  error?: string;
}
