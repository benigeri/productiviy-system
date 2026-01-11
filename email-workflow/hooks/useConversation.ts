import { useState, useEffect } from 'react';
import {
  type Conversation,
  type Message,
  getConversation,
  saveConversation,
  clearConversation as clearConversationStorage,
  addMessage as addMessageToStorage,
  updateDraft as updateDraftInStorage,
} from '../lib/conversation';

const STORAGE_QUOTA_EXCEEDED_MESSAGE =
  'Storage limit reached. Old conversations were pruned. Please try again.';

export function useConversation(threadId: string) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Load conversation on mount
  useEffect(() => {
    const loaded = getConversation(threadId);
    setConversation(loaded);
    setIsLoaded(true);
  }, [threadId]);

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    const updated = addMessageToStorage(threadId, role, content);
    if (updated === null) {
      setStorageWarning(STORAGE_QUOTA_EXCEEDED_MESSAGE);
    } else {
      setConversation(updated);
      setStorageWarning(null);
    }
  };

  const updateDraft = (draft: string) => {
    const updated = updateDraftInStorage(threadId, draft);
    if (updated === null) {
      setStorageWarning(STORAGE_QUOTA_EXCEEDED_MESSAGE);
    } else {
      setConversation(updated);
      setStorageWarning(null);
    }
  };

  const clear = () => {
    clearConversationStorage(threadId);
    setConversation(null);
    setStorageWarning(null);
  };

  return {
    conversation,
    isLoaded,
    addMessage,
    updateDraft,
    clear,
    messages: conversation?.messages || [],
    currentDraft: conversation?.currentDraft || '',
    storageWarning,
  };
}
