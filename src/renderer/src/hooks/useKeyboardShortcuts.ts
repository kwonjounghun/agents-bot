/**
 * useKeyboardShortcuts Hook
 * Provides keyboard shortcut handling for the application
 */

import { useEffect, useCallback } from 'react';

export interface ShortcutConfig {
  /** Key to listen for (e.g., 'Enter', 'Escape', 'k') */
  key: string;
  /** Require Cmd (Mac) or Ctrl (Windows/Linux) */
  meta?: boolean;
  /** Require Shift key */
  shift?: boolean;
  /** Require Alt/Option key */
  alt?: boolean;
  /** Handler function to execute */
  handler: () => void;
  /** Description for documentation */
  description: string;
  /** Allow triggering while focused on input elements */
  allowInInput?: boolean;
}

interface UseKeyboardShortcutsOptions {
  /** Enable/disable all shortcuts */
  enabled?: boolean;
}

/**
 * Custom hook for handling keyboard shortcuts
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: UseKeyboardShortcutsOptions = {}
): void {
  const { enabled = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Check if focused on input element
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        // Check modifier keys
        const metaMatch = shortcut.meta
          ? event.metaKey || event.ctrlKey
          : !event.metaKey && !event.ctrlKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && shiftMatch && altMatch && keyMatch) {
          // Skip if focused on input and not allowed
          if (isInputFocused && !shortcut.allowInInput) {
            continue;
          }

          event.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export default useKeyboardShortcuts;
