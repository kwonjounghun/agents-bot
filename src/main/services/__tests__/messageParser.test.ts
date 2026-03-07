/**
 * Message Parser Unit Tests
 *
 * Tests for the message parser module using AAA pattern.
 * All functions in messageParser are pure functions, making them ideal for unit testing.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTextDelta,
  parseThinkingDelta,
  parseToolUse,
  parseStreamEvent,
  parseAssistantMessage,
  parseResultMessage,
  parseSystemMessage,
  parseMessage,
  isMessageArray
} from '../messageParser';

describe('MessageParser', () => {
  describe('parseTextDelta', () => {
    it('should parse text delta correctly', () => {
      // Arrange
      const delta = { type: 'text_delta' as const, text: 'Hello world' };

      // Act
      const result = parseTextDelta(delta);

      // Assert
      expect(result.type).toBe('text');
      expect(result.content).toBe('Hello world');
    });

    it('should handle empty text', () => {
      // Arrange
      const delta = { type: 'text_delta' as const, text: '' };

      // Act
      const result = parseTextDelta(delta);

      // Assert
      expect(result.type).toBe('text');
      expect(result.content).toBe('');
    });
  });

  describe('parseThinkingDelta', () => {
    it('should parse thinking delta correctly', () => {
      // Arrange
      const delta = { type: 'thinking_delta' as const, thinking: 'Let me think...' };

      // Act
      const result = parseThinkingDelta(delta);

      // Assert
      expect(result.type).toBe('thinking');
      expect(result.content).toBe('Let me think...');
    });
  });

  describe('parseToolUse', () => {
    it('should parse tool use block correctly', () => {
      // Arrange
      const block = {
        type: 'tool_use' as const,
        name: 'Read',
        input: { file_path: '/path/to/file.ts' }
      };

      // Act
      const result = parseToolUse(block);

      // Assert
      expect(result.type).toBe('tool_use');
      expect(result.content).toBe('Using Read');
      expect(result.toolName).toBe('Read');
      expect(result.toolInput).toContain('file_path');
    });

    it('should stringify complex input', () => {
      // Arrange
      const block = {
        type: 'tool_use' as const,
        name: 'Write',
        input: { file_path: '/path/to/file.ts', content: 'const x = 1;' }
      };

      // Act
      const result = parseToolUse(block);

      // Assert
      expect(result.toolInput).toContain('file_path');
      expect(result.toolInput).toContain('content');
    });
  });

  describe('parseStreamEvent', () => {
    it('should parse text_delta stream event', () => {
      // Arrange
      const message = {
        type: 'stream_event' as const,
        event: {
          type: 'content_block_delta' as const,
          delta: { type: 'text_delta' as const, text: 'Hello' }
        }
      };

      // Act
      const result = parseStreamEvent(message);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.type).toBe('text');
      expect(result?.content).toBe('Hello');
    });

    it('should parse thinking_delta stream event', () => {
      // Arrange
      const message = {
        type: 'stream_event' as const,
        event: {
          type: 'content_block_delta' as const,
          delta: { type: 'thinking_delta' as const, thinking: 'Processing...' }
        }
      };

      // Act
      const result = parseStreamEvent(message);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.type).toBe('thinking');
      expect(result?.content).toBe('Processing...');
    });

    it('should return null for non-content_block_delta events', () => {
      // Arrange
      const message = {
        type: 'stream_event' as const,
        event: { type: 'other_event', delta: { type: 'unknown' } } as any
      };

      // Act
      const result = parseStreamEvent(message as any);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when event is missing', () => {
      // Arrange
      const message = { type: 'stream_event' as const };

      // Act
      const result = parseStreamEvent(message);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('parseAssistantMessage', () => {
    it('should extract tool_use blocks from assistant message', () => {
      // Arrange
      const message = {
        type: 'assistant' as const,
        message: {
          content: [
            { type: 'tool_use' as const, name: 'Read', input: { file: 'test.ts' } },
            { type: 'text', content: 'Some text' },
            { type: 'tool_use' as const, name: 'Write', input: { file: 'out.ts' } }
          ]
        }
      };

      // Act
      const results = parseAssistantMessage(message);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].toolName).toBe('Read');
      expect(results[1].toolName).toBe('Write');
    });

    it('should return empty array when no content', () => {
      // Arrange
      const message = { type: 'assistant' as const };

      // Act
      const results = parseAssistantMessage(message);

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should return empty array when no tool_use blocks', () => {
      // Arrange
      const message = {
        type: 'assistant' as const,
        message: {
          content: [{ type: 'text', content: 'Just text' }]
        }
      };

      // Act
      const results = parseAssistantMessage(message);

      // Assert
      expect(results).toHaveLength(0);
    });
  });

  describe('parseResultMessage', () => {
    it('should parse successful result', () => {
      // Arrange
      const message = {
        type: 'result' as const,
        subtype: 'success' as const,
        result: 'Task completed successfully',
        total_cost_usd: 0.05,
        num_turns: 3
      };

      // Act
      const result = parseResultMessage(message);

      // Assert
      expect(result.type).toBe('result');
      expect(result.content).toBe('Task completed successfully');
      expect(result.costUsd).toBe(0.05);
      expect(result.turns).toBe(3);
      expect(result.isSuccess).toBe(true);
    });

    it('should parse error result', () => {
      // Arrange
      const message = {
        type: 'result' as const,
        subtype: 'error' as const,
        errors: ['Something went wrong', 'Another error']
      };

      // Act
      const result = parseResultMessage(message);

      // Assert
      expect(result.type).toBe('result');
      expect(result.content).toContain('Error');
      expect(result.content).toContain('Something went wrong');
      expect(result.isSuccess).toBe(false);
    });

    it('should handle missing optional fields', () => {
      // Arrange
      const message = {
        type: 'result' as const,
        subtype: 'success' as const
      };

      // Act
      const result = parseResultMessage(message);

      // Assert
      expect(result.costUsd).toBe(0);
      expect(result.turns).toBe(0);
      expect(result.content).toBe('Completed');
    });
  });

  describe('parseSystemMessage', () => {
    it('should parse init message with agents', () => {
      // Arrange
      const message = {
        type: 'system' as const,
        subtype: 'init',
        agents: ['executor', 'explorer', 'planner']
      };

      // Act
      const result = parseSystemMessage(message);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.type).toBe('system');
      expect(result?.agents).toEqual(['executor', 'explorer', 'planner']);
    });

    it('should return null for non-init messages', () => {
      // Arrange
      const message = {
        type: 'system' as const,
        subtype: 'other'
      };

      // Act
      const result = parseSystemMessage(message);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when agents array is empty', () => {
      // Arrange
      const message = {
        type: 'system' as const,
        subtype: 'init',
        agents: []
      };

      // Act
      const result = parseSystemMessage(message);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('parseMessage', () => {
    it('should route to correct parser based on type', () => {
      // Arrange
      const resultMessage = {
        type: 'result',
        subtype: 'success',
        result: 'Done'
      };

      // Act
      const result = parseMessage(resultMessage);

      // Assert
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(false);
      expect((result as any).type).toBe('result');
    });

    it('should return null for null input', () => {
      // Arrange
      const input = null;

      // Act
      const result = parseMessage(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for user messages', () => {
      // Arrange
      const message = { type: 'user', content: 'test' };

      // Act
      const result = parseMessage(message);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for unknown message types', () => {
      // Arrange
      const message = { type: 'unknown_type' };

      // Act
      const result = parseMessage(message);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('isMessageArray', () => {
    it('should return true for arrays', () => {
      // Arrange
      const result = [{ type: 'text', content: 'test' }];

      // Act & Assert
      expect(isMessageArray(result as any)).toBe(true);
    });

    it('should return false for single message', () => {
      // Arrange
      const result = { type: 'text', content: 'test' };

      // Act & Assert
      expect(isMessageArray(result as any)).toBe(false);
    });

    it('should return false for null', () => {
      // Arrange
      const result = null;

      // Act & Assert
      expect(isMessageArray(result)).toBe(false);
    });
  });
});
