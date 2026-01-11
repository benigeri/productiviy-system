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
 * Prune old conversations to free up space
 * Keeps last 20 conversations and removes conversations older than 7 days
 */
function pruneOldConversations(store: ConversationStore): ConversationStore {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const maxConversations = 20;

  // Filter out conversations older than 7 days
  const recentConversations = Object.entries(store).filter(
    ([_, conv]) => now - conv.timestamp < sevenDaysMs
  );

  // Sort by timestamp (newest first) and keep only last N
  const sortedConversations = recentConversations.sort(
    ([_, a], [__, b]) => b.timestamp - a.timestamp
  );

  const prunedConversations = sortedConversations.slice(0, maxConversations);

  return Object.fromEntries(prunedConversations);
}

/**
 * Save all conversations to localStorage with quota handling
 * Returns true if save succeeded, false if quota exceeded after pruning
 */
function setStore(store: ConversationStore): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    // Handle quota exceeded error
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      console.warn(
        'localStorage quota exceeded - pruning old conversations...'
      );

      // Prune old conversations and retry
      const prunedStore = pruneOldConversations(store);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prunedStore));
        console.log(
          `Successfully pruned ${Object.keys(store).length - Object.keys(prunedStore).length} old conversations`
        );
        return true;
      } catch (retryError) {
        console.error(
          'Failed to save even after pruning - localStorage may be full:',
          retryError
        );
        return false;
      }
    }

    console.error('Failed to save conversations to localStorage:', error);
    return false;
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
 * Returns true if save succeeded, false if quota exceeded
 */
export function saveConversation(
  threadId: string,
  conversation: Conversation
): boolean {
  const store = getStore();
  store[threadId] = {
    ...conversation,
    timestamp: Date.now(),
  };
  return setStore(store);
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
 * Returns conversation on success, null if quota exceeded
 */
export function addMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string
): Conversation | null {
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

  const success = saveConversation(threadId, conversation);
  return success ? conversation : null;
}

/**
 * Update the current draft in a conversation
 * Returns conversation on success, null if quota exceeded
 */
export function updateDraft(
  threadId: string,
  draft: string
): Conversation | null {
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

  const success = saveConversation(threadId, conversation);
  return success ? conversation : null;
}
