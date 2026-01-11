import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getConversation,
  saveConversation,
  clearConversation,
  addMessage,
  updateDraft,
  type Conversation,
} from './conversation';

describe('lib/conversation', () => {
  // Mock localStorage
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
    });
    vi.stubGlobal('console', {
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
    });
  });

  describe('getConversation', () => {
    it('returns null for non-existent thread', () => {
      const result = getConversation('thread-123');
      expect(result).toBeNull();
    });

    it('returns conversation for existing thread', () => {
      const conversation: Conversation = {
        messages: [{ role: 'user', content: 'Hello' }],
        currentDraft: 'Draft text',
        timestamp: Date.now(),
      };

      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-123': conversation,
      });

      const result = getConversation('thread-123');
      expect(result).toEqual(conversation);
    });

    it('handles corrupted JSON data', () => {
      mockStorage['email-workflow-conversations'] = 'invalid-json{';

      const result = getConversation('thread-123');
      expect(result).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'email-workflow-conversations'
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('handles invalid schema data', () => {
      // Invalid: missing required fields
      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-123': {
          messages: [{ role: 'invalid-role', content: 123 }], // Invalid role and content type
        },
      });

      const result = getConversation('thread-123');
      expect(result).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'email-workflow-conversations'
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('handles message content exceeding 100KB limit', () => {
      const largeContent = 'a'.repeat(100001); // Exceeds 100KB limit
      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-123': {
          messages: [{ role: 'user', content: largeContent }],
          currentDraft: '',
          timestamp: Date.now(),
        },
      });

      const result = getConversation('thread-123');
      expect(result).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalled();
    });
  });

  describe('saveConversation', () => {
    it('saves new conversation successfully', () => {
      const conversation: Conversation = {
        messages: [{ role: 'user', content: 'Hello' }],
        currentDraft: 'Draft',
        timestamp: Date.now(),
      };

      const result = saveConversation('thread-123', conversation);
      expect(result).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalled();

      // Verify saved data
      const saved = JSON.parse(
        mockStorage['email-workflow-conversations']
      );
      expect(saved['thread-123']).toMatchObject({
        messages: conversation.messages,
        currentDraft: conversation.currentDraft,
      });
      expect(saved['thread-123'].timestamp).toBeGreaterThan(0);
    });

    it('updates existing conversation', () => {
      // Setup existing conversation
      const existing: Conversation = {
        messages: [{ role: 'user', content: 'Hello' }],
        currentDraft: 'Old draft',
        timestamp: Date.now() - 1000,
      };
      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-123': existing,
      });

      // Update conversation
      const updated: Conversation = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
        currentDraft: 'New draft',
        timestamp: Date.now(),
      };

      const result = saveConversation('thread-123', updated);
      expect(result).toBe(true);

      const saved = JSON.parse(
        mockStorage['email-workflow-conversations']
      );
      expect(saved['thread-123'].messages.length).toBe(2);
      expect(saved['thread-123'].currentDraft).toBe('New draft');
    });

    it('handles quota exceeded by pruning old conversations', () => {
      // Setup: Fill storage with old conversations (8+ days old)
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

      const oldConversations: Record<string, Conversation> = {};
      for (let i = 0; i < 25; i++) {
        oldConversations[`thread-${i}`] = {
          messages: [{ role: 'user', content: `Message ${i}` }],
          currentDraft: '',
          timestamp: eightDaysAgo,
        };
      }

      mockStorage['email-workflow-conversations'] =
        JSON.stringify(oldConversations);

      // Mock quota exceeded on first attempt
      let firstAttempt = true;
      vi.spyOn(localStorage, 'setItem').mockImplementation(
        (key: string, value: string) => {
          if (firstAttempt) {
            firstAttempt = false;
            const error = new DOMException(
              'Quota exceeded',
              'QuotaExceededError'
            );
            throw error;
          }
          mockStorage[key] = value;
        }
      );

      // Try to save new conversation
      const newConv: Conversation = {
        messages: [{ role: 'user', content: 'New message' }],
        currentDraft: '',
        timestamp: now,
      };

      const result = saveConversation('thread-new', newConv);
      expect(result).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('localStorage quota exceeded')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Successfully pruned')
      );

      // Verify old conversations were pruned (8+ days old should be removed)
      const saved = JSON.parse(
        mockStorage['email-workflow-conversations']
      );
      const savedKeys = Object.keys(saved);
      expect(savedKeys.length).toBeLessThan(25); // Should have pruned some
      expect(savedKeys).toContain('thread-new'); // New conversation saved
    });

    it('handles quota exceeded even after pruning', () => {
      // Mock persistent quota exceeded error
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      const conversation: Conversation = {
        messages: [{ role: 'user', content: 'Hello' }],
        currentDraft: '',
        timestamp: Date.now(),
      };

      const result = saveConversation('thread-123', conversation);
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save even after pruning'),
        expect.any(DOMException)
      );
    });
  });

  describe('clearConversation', () => {
    it('removes conversation for specific thread', () => {
      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-1': {
          messages: [{ role: 'user', content: 'Hello' }],
          currentDraft: '',
          timestamp: Date.now(),
        },
        'thread-2': {
          messages: [{ role: 'user', content: 'Hi' }],
          currentDraft: '',
          timestamp: Date.now(),
        },
      });

      clearConversation('thread-1');

      const saved = JSON.parse(
        mockStorage['email-workflow-conversations']
      );
      expect(saved['thread-1']).toBeUndefined();
      expect(saved['thread-2']).toBeDefined();
    });

    it('handles clearing non-existent thread', () => {
      clearConversation('thread-999');
      // Should not throw error
      expect(localStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('creates new conversation when adding first message', () => {
      const result = addMessage('thread-123', 'user', 'Hello');

      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0]).toEqual({
        role: 'user',
        content: 'Hello',
      });
      expect(result!.currentDraft).toBe('');
      expect(result!.timestamp).toBeGreaterThan(0);
    });

    it('appends message to existing conversation', () => {
      const existing: Conversation = {
        messages: [{ role: 'user', content: 'Hello' }],
        currentDraft: 'Draft',
        timestamp: Date.now() - 1000,
      };
      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-123': existing,
      });

      const result = addMessage('thread-123', 'assistant', 'Hi there!');

      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[1]).toEqual({
        role: 'assistant',
        content: 'Hi there!',
      });
      expect(result!.currentDraft).toBe('Draft'); // Preserves draft
    });

    it('returns null when quota exceeded', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      const result = addMessage('thread-123', 'user', 'Hello');
      expect(result).toBeNull();
    });
  });

  describe('updateDraft', () => {
    it('creates conversation if not exists', () => {
      const result = updateDraft('thread-123', 'My draft text');

      expect(result).not.toBeNull();
      expect(result!.currentDraft).toBe('My draft text');
      expect(result!.messages).toHaveLength(0);
      expect(result!.timestamp).toBeGreaterThan(0);
    });

    it('updates draft in existing conversation', () => {
      const existing: Conversation = {
        messages: [{ role: 'user', content: 'Hello' }],
        currentDraft: 'Old draft',
        timestamp: Date.now() - 1000,
      };
      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-123': existing,
      });

      const result = updateDraft('thread-123', 'New draft text');

      expect(result).not.toBeNull();
      expect(result!.currentDraft).toBe('New draft text');
      expect(result!.messages).toHaveLength(1); // Preserves messages
    });

    it('returns null when quota exceeded', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      const result = updateDraft('thread-123', 'Draft');
      expect(result).toBeNull();
    });
  });

  describe('pruning logic', () => {
    it('keeps recent conversations under 7 days', () => {
      const now = Date.now();
      const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000;

      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-recent': {
          messages: [{ role: 'user', content: 'Recent' }],
          currentDraft: '',
          timestamp: sixDaysAgo,
        },
      });

      // Trigger save to potentially prune
      const newConv: Conversation = {
        messages: [{ role: 'user', content: 'New' }],
        currentDraft: '',
        timestamp: now,
      };
      saveConversation('thread-new', newConv);

      const saved = JSON.parse(
        mockStorage['email-workflow-conversations']
      );
      expect(saved['thread-recent']).toBeDefined(); // Should be kept
      expect(saved['thread-new']).toBeDefined();
    });

    it('removes conversations older than 7 days during quota exceeded', () => {
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

      mockStorage['email-workflow-conversations'] = JSON.stringify({
        'thread-old': {
          messages: [{ role: 'user', content: 'Old' }],
          currentDraft: '',
          timestamp: eightDaysAgo,
        },
      });

      // Mock quota exceeded
      let firstAttempt = true;
      vi.spyOn(localStorage, 'setItem').mockImplementation(
        (key: string, value: string) => {
          if (firstAttempt) {
            firstAttempt = false;
            throw new DOMException(
              'Quota exceeded',
              'QuotaExceededError'
            );
          }
          mockStorage[key] = value;
        }
      );

      const newConv: Conversation = {
        messages: [{ role: 'user', content: 'New' }],
        currentDraft: '',
        timestamp: now,
      };
      saveConversation('thread-new', newConv);

      const saved = JSON.parse(
        mockStorage['email-workflow-conversations']
      );
      expect(saved['thread-old']).toBeUndefined(); // Old conversation pruned
      expect(saved['thread-new']).toBeDefined();
    });

    it('keeps only last 20 conversations when more exist', () => {
      const now = Date.now();

      // Create 25 recent conversations
      const conversations: Record<string, Conversation> = {};
      for (let i = 0; i < 25; i++) {
        conversations[`thread-${i}`] = {
          messages: [{ role: 'user', content: `Message ${i}` }],
          currentDraft: '',
          timestamp: now - i * 1000, // Stagger timestamps
        };
      }

      mockStorage['email-workflow-conversations'] =
        JSON.stringify(conversations);

      // Mock quota exceeded to trigger pruning
      let firstAttempt = true;
      vi.spyOn(localStorage, 'setItem').mockImplementation(
        (key: string, value: string) => {
          if (firstAttempt) {
            firstAttempt = false;
            throw new DOMException(
              'Quota exceeded',
              'QuotaExceededError'
            );
          }
          mockStorage[key] = value;
        }
      );

      const newConv: Conversation = {
        messages: [{ role: 'user', content: 'New' }],
        currentDraft: '',
        timestamp: now,
      };
      saveConversation('thread-new', newConv);

      const saved = JSON.parse(
        mockStorage['email-workflow-conversations']
      );
      expect(Object.keys(saved).length).toBeLessThanOrEqual(21); // 20 + new one
    });
  });

  describe('SSR handling', () => {
    it('returns empty store when window is undefined', () => {
      vi.stubGlobal('window', undefined);

      const result = getConversation('thread-123');
      expect(result).toBeNull();
    });

    it('returns false when saving in SSR context', () => {
      vi.stubGlobal('window', undefined);

      const conversation: Conversation = {
        messages: [{ role: 'user', content: 'Hello' }],
        currentDraft: '',
        timestamp: Date.now(),
      };

      const result = saveConversation('thread-123', conversation);
      expect(result).toBe(false);
    });
  });
});
