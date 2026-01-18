import { useCallback } from 'react';

/**
 * Creates a keyboard event handler that triggers an action on Cmd/Ctrl+Enter.
 * @param onSubmit - The function to call when the shortcut is pressed
 * @returns A keyboard event handler for textarea elements
 */
export function useKeyboardSubmit(
  onSubmit: () => void
): (e: React.KeyboardEvent<HTMLTextAreaElement>) => void {
  return useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );
}
