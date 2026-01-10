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

export function useConversation(threadId: string) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load conversation on mount
  useEffect(() => {
    const loaded = getConversation(threadId);
    setConversation(loaded);
    setIsLoaded(true);
  }, [threadId]);

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    const updated = addMessageToStorage(threadId, role, content);
    setConversation(updated);
  };

  const updateDraft = (draft: string) => {
    const updated = updateDraftInStorage(threadId, draft);
    setConversation(updated);
  };

  const clear = () => {
    clearConversationStorage(threadId);
    setConversation(null);
  };

  return {
    conversation,
    isLoaded,
    addMessage,
    updateDraft,
    clear,
    messages: conversation?.messages || [],
    currentDraft: conversation?.currentDraft || '',
  };
}
