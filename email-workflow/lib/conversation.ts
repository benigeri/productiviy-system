/**
 * Conversation state management for email draft iterations
 * Uses localStorage to persist conversation history across page refreshes
 */

import { z } from 'zod';

// Zod schemas for runtime validation
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(100000), // 100KB limit per message
});

const ConversationSchema = z.object({
  messages: z.array(MessageSchema),
  currentDraft: z.string(),
  timestamp: z.number().positive(),
});

const ConversationStoreSchema = z.record(z.string(), ConversationSchema);

// TypeScript types inferred from Zod schemas
export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
type ConversationStore = z.infer<typeof ConversationStoreSchema>;

const STORAGE_KEY = 'email-workflow-conversations';

/**
 * Get all conversations from localStorage with runtime validation
 */
function getStore(): ConversationStore {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);
    const validated = ConversationStoreSchema.safeParse(parsed);

    if (!validated.success) {
      console.error(
        'Invalid conversation store data - clearing corrupted storage:',
        validated.error
      );
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }

    return validated.data;
  } catch (error) {
    console.error('Failed to load conversations from localStorage:', error);
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

/**
 * Save all conversations to localStorage
 */
function setStore(store: ConversationStore): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save conversations to localStorage:', error);
  }
}

/**
 * Get conversation for a specific thread
 */
export function getConversation(threadId: string): Conversation | null {
  const store = getStore();
  return store[threadId] || null;
}

/**
 * Save conversation for a specific thread
 */
export function saveConversation(
  threadId: string,
  conversation: Conversation
): void {
  const store = getStore();
  store[threadId] = {
    ...conversation,
    timestamp: Date.now(),
  };
  setStore(store);
}

/**
 * Clear conversation for a specific thread
 */
export function clearConversation(threadId: string): void {
  const store = getStore();
  delete store[threadId];
  setStore(store);
}

/**
 * Add a message to a conversation
 */
export function addMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string
): Conversation {
  const existing = getConversation(threadId);

  const conversation: Conversation = existing
    ? {
        ...existing,
        messages: [...existing.messages, { role, content }],
        timestamp: Date.now(),
      }
    : {
        messages: [{ role, content }],
        currentDraft: '',
        timestamp: Date.now(),
      };

  saveConversation(threadId, conversation);
  return conversation;
}

/**
 * Update the current draft in a conversation
 */
export function updateDraft(threadId: string, draft: string): Conversation {
  const existing = getConversation(threadId);

  const conversation: Conversation = existing
    ? {
        ...existing,
        currentDraft: draft,
        timestamp: Date.now(),
      }
    : {
        messages: [],
        currentDraft: draft,
        timestamp: Date.now(),
      };

  saveConversation(threadId, conversation);
  return conversation;
}
