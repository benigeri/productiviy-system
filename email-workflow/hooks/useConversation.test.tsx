import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversation } from './useConversation';
import * as conversationLib from '../lib/conversation';

// Mock the conversation library
vi.mock('../lib/conversation', () => ({
  getConversation: vi.fn(),
  saveConversation: vi.fn(),
  clearConversation: vi.fn(),
  addMessage: vi.fn(),
  updateDraft: vi.fn(),
}));

describe('hooks/useConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('loads conversation on mount', async () => {
      const mockConversation = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
        currentDraft: 'Draft text',
        timestamp: Date.now(),
      };

      vi.mocked(conversationLib.getConversation).mockReturnValue(
        mockConversation
      );

      const { result } = renderHook(() => useConversation('thread-123'));

      // Wait for effect to run and conversation to load
      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(conversationLib.getConversation).toHaveBeenCalledWith(
        'thread-123'
      );
      expect(result.current.conversation).toEqual(mockConversation);
      expect(result.current.messages).toEqual(mockConversation.messages);
      expect(result.current.currentDraft).toBe('Draft text');
      expect(result.current.storageWarning).toBeNull();
    });

    it('handles null conversation (thread not found)', async () => {
      vi.mocked(conversationLib.getConversation).mockReturnValue(null);

      const { result } = renderHook(() => useConversation('thread-999'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.conversation).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.currentDraft).toBe('');
      expect(result.current.storageWarning).toBeNull();
    });

    it('reloads conversation when threadId changes', async () => {
      const conversation1 = {
        messages: [{ role: 'user' as const, content: 'Thread 1' }],
        currentDraft: 'Draft 1',
        timestamp: Date.now(),
      };

      const conversation2 = {
        messages: [{ role: 'user' as const, content: 'Thread 2' }],
        currentDraft: 'Draft 2',
        timestamp: Date.now(),
      };

      vi.mocked(conversationLib.getConversation)
        .mockReturnValueOnce(conversation1)
        .mockReturnValueOnce(conversation2);

      const { result, rerender } = renderHook(
        ({ threadId }) => useConversation(threadId),
        { initialProps: { threadId: 'thread-1' } }
      );

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });
      expect(result.current.conversation).toEqual(conversation1);

      // Change threadId
      rerender({ threadId: 'thread-2' });

      await waitFor(() => {
        expect(result.current.conversation).toEqual(conversation2);
      });

      expect(conversationLib.getConversation).toHaveBeenCalledTimes(2);
      expect(conversationLib.getConversation).toHaveBeenNthCalledWith(
        1,
        'thread-1'
      );
      expect(conversationLib.getConversation).toHaveBeenNthCalledWith(
        2,
        'thread-2'
      );
    });
  });

  describe('addMessage', () => {
    it('adds message successfully', async () => {
      const updatedConversation = {
        messages: [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi!' },
        ],
        currentDraft: '',
        timestamp: Date.now(),
      };

      vi.mocked(conversationLib.getConversation).mockReturnValue(null);
      vi.mocked(conversationLib.addMessage).mockReturnValue(
        updatedConversation
      );

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addMessage('assistant', 'Hi!');
      });

      expect(conversationLib.addMessage).toHaveBeenCalledWith(
        'thread-123',
        'assistant',
        'Hi!'
      );
      expect(result.current.conversation).toEqual(updatedConversation);
      expect(result.current.messages).toEqual(updatedConversation.messages);
      expect(result.current.storageWarning).toBeNull();
    });

    it('shows storage warning when quota exceeded', async () => {
      vi.mocked(conversationLib.getConversation).mockReturnValue(null);
      vi.mocked(conversationLib.addMessage).mockReturnValue(null); // Quota exceeded

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.addMessage('user', 'Hello');
      });

      expect(result.current.storageWarning).toBe(
        'Storage limit reached. Old conversations were pruned. Please try again.'
      );
      expect(result.current.conversation).toBeNull(); // Not updated
    });

    it('clears storage warning on successful operation after failure', async () => {
      vi.mocked(conversationLib.getConversation).mockReturnValue(null);

      // First call fails, second succeeds
      vi.mocked(conversationLib.addMessage)
        .mockReturnValueOnce(null) // Quota exceeded
        .mockReturnValueOnce({
          messages: [{ role: 'user' as const, content: 'Hello' }],
          currentDraft: '',
          timestamp: Date.now(),
        });

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // First attempt fails
      act(() => {
        result.current.addMessage('user', 'Hello');
      });

      expect(result.current.storageWarning).not.toBeNull();

      // Second attempt succeeds
      act(() => {
        result.current.addMessage('user', 'Hello');
      });

      expect(result.current.storageWarning).toBeNull();
    });
  });

  describe('updateDraft', () => {
    it('updates draft successfully', async () => {
      const updatedConversation = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
        currentDraft: 'Updated draft text',
        timestamp: Date.now(),
      };

      vi.mocked(conversationLib.getConversation).mockReturnValue(null);
      vi.mocked(conversationLib.updateDraft).mockReturnValue(
        updatedConversation
      );

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.updateDraft('Updated draft text');
      });

      expect(conversationLib.updateDraft).toHaveBeenCalledWith(
        'thread-123',
        'Updated draft text'
      );
      expect(result.current.conversation).toEqual(updatedConversation);
      expect(result.current.currentDraft).toBe('Updated draft text');
      expect(result.current.storageWarning).toBeNull();
    });

    it('shows storage warning when quota exceeded', async () => {
      vi.mocked(conversationLib.getConversation).mockReturnValue(null);
      vi.mocked(conversationLib.updateDraft).mockReturnValue(null); // Quota exceeded

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      act(() => {
        result.current.updateDraft('Draft text');
      });

      expect(result.current.storageWarning).toBe(
        'Storage limit reached. Old conversations were pruned. Please try again.'
      );
      expect(result.current.conversation).toBeNull();
    });

    it('updates draft multiple times', async () => {
      vi.mocked(conversationLib.getConversation).mockReturnValue(null);

      const drafts = ['Draft 1', 'Draft 2', 'Draft 3'];
      drafts.forEach((draft, index) => {
        vi.mocked(conversationLib.updateDraft).mockReturnValueOnce({
          messages: [],
          currentDraft: draft,
          timestamp: Date.now() + index,
        });
      });

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      drafts.forEach((draft) => {
        act(() => {
          result.current.updateDraft(draft);
        });
        expect(result.current.currentDraft).toBe(draft);
      });

      expect(conversationLib.updateDraft).toHaveBeenCalledTimes(3);
    });
  });

  describe('clear', () => {
    it('clears conversation successfully', async () => {
      const initialConversation = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
        currentDraft: 'Draft',
        timestamp: Date.now(),
      };

      vi.mocked(conversationLib.getConversation).mockReturnValue(
        initialConversation
      );

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.conversation).toEqual(initialConversation);

      act(() => {
        result.current.clear();
      });

      expect(conversationLib.clearConversation).toHaveBeenCalledWith(
        'thread-123'
      );
      expect(result.current.conversation).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.currentDraft).toBe('');
      expect(result.current.storageWarning).toBeNull();
    });

    it('clears storage warning when clearing conversation', async () => {
      vi.mocked(conversationLib.getConversation).mockReturnValue(null);
      vi.mocked(conversationLib.addMessage).mockReturnValue(null); // Trigger warning

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      // Trigger storage warning
      act(() => {
        result.current.addMessage('user', 'Hello');
      });

      expect(result.current.storageWarning).not.toBeNull();

      // Clear should remove warning
      act(() => {
        result.current.clear();
      });

      expect(result.current.storageWarning).toBeNull();
    });
  });

  describe('computed properties', () => {
    it('provides empty messages array when conversation is null', async () => {
      vi.mocked(conversationLib.getConversation).mockReturnValue(null);

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.currentDraft).toBe('');
    });

    it('provides messages array when conversation exists', async () => {
      const mockConversation = {
        messages: [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi!' },
        ],
        currentDraft: 'Draft',
        timestamp: Date.now(),
      };

      vi.mocked(conversationLib.getConversation).mockReturnValue(
        mockConversation
      );

      const { result } = renderHook(() => useConversation('thread-123'));

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.messages).toEqual(mockConversation.messages);
      expect(result.current.currentDraft).toBe('Draft');
    });
  });

  describe('race conditions', () => {
    it('handles rapid threadId changes', async () => {
      vi.mocked(conversationLib.getConversation)
        .mockReturnValueOnce({
          messages: [{ role: 'user' as const, content: 'Thread 1' }],
          currentDraft: '',
          timestamp: Date.now(),
        })
        .mockReturnValueOnce({
          messages: [{ role: 'user' as const, content: 'Thread 2' }],
          currentDraft: '',
          timestamp: Date.now(),
        })
        .mockReturnValueOnce({
          messages: [{ role: 'user' as const, content: 'Thread 3' }],
          currentDraft: '',
          timestamp: Date.now(),
        });

      const { result, rerender } = renderHook(
        ({ threadId }) => useConversation(threadId),
        { initialProps: { threadId: 'thread-1' } }
      );

      await waitFor(() => expect(result.current.isLoaded).toBe(true));

      // Rapidly change threadId
      rerender({ threadId: 'thread-2' });
      rerender({ threadId: 'thread-3' });

      await waitFor(() => {
        expect(result.current.messages[0].content).toBe('Thread 3');
      });

      // Should have loaded all three threads
      expect(conversationLib.getConversation).toHaveBeenCalledTimes(3);
    });
  });
});
