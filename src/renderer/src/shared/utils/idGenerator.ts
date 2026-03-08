/**
 * ID Generator Utilities
 *
 * Generate unique IDs for sections and messages.
 */

/**
 * Generate a unique section ID
 */
export function generateSectionId(): string {
  return `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
