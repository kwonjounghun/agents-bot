/**
 * Agent Normalizer Unit Tests
 *
 * Tests for the agent normalizer module using AAA pattern.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeAgentType,
  createAgentNormalizer,
  getTypeMappings,
  isKnownAgentType,
  DEFAULT_AGENT_TYPE_MAP
} from '../agentNormalizer';

describe('AgentNormalizer', () => {
  describe('normalizeAgentType', () => {
    it('should normalize oh-my-claudecode:executor to executor', () => {
      // Arrange
      const input = 'oh-my-claudecode:executor';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('executor');
    });

    it('should normalize oh-my-claudecode:explore to explore', () => {
      // Arrange
      const input = 'oh-my-claudecode:explore';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('explore');
    });

    it('should normalize general-purpose to executor', () => {
      // Arrange
      const input = 'general-purpose';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('executor');
    });

    it('should normalize general to executor', () => {
      // Arrange
      const input = 'general';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('executor');
    });

    it('should normalize default to executor', () => {
      // Arrange
      const input = 'default';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('executor');
    });

    it('should normalize plan to planner', () => {
      // Arrange
      const input = 'plan';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('planner');
    });

    it('should normalize explorer to explore', () => {
      // Arrange
      const input = 'explorer';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('explore');
    });

    it('should handle uppercase input', () => {
      // Arrange
      const input = 'EXECUTOR';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('executor');
    });

    it('should handle mixed case with prefix', () => {
      // Arrange
      const input = 'Oh-My-ClaudeCode:Executor';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('executor');
    });

    it('should return executor for empty string', () => {
      // Arrange
      const input = '';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('executor');
    });

    it('should pass through unknown types as-is (lowercase)', () => {
      // Arrange
      const input = 'custom-agent';

      // Act
      const result = normalizeAgentType(input);

      // Assert
      expect(result).toBe('custom-agent');
    });

    it('should use custom mappings when provided', () => {
      // Arrange
      const input = 'my-custom-type';
      const customMappings = { 'my-custom-type': 'planner' as const };

      // Act
      const result = normalizeAgentType(input, customMappings);

      // Assert
      expect(result).toBe('planner');
    });
  });

  describe('createAgentNormalizer', () => {
    it('should create normalizer with default mappings', () => {
      // Arrange
      const normalizer = createAgentNormalizer();

      // Act
      const result = normalizer('general-purpose');

      // Assert
      expect(result).toBe('executor');
    });

    it('should create normalizer with custom mappings', () => {
      // Arrange
      const normalizer = createAgentNormalizer({
        'my-agent': 'architect'
      });

      // Act
      const result = normalizer('my-agent');

      // Assert
      expect(result).toBe('architect');
    });

    it('should override default mappings with custom ones', () => {
      // Arrange
      const normalizer = createAgentNormalizer({
        'general-purpose': 'planner'
      });

      // Act
      const result = normalizer('general-purpose');

      // Assert
      expect(result).toBe('planner');
    });
  });

  describe('getTypeMappings', () => {
    it('should return a copy of default mappings', () => {
      // Arrange
      // No setup needed

      // Act
      const mappings = getTypeMappings();

      // Assert
      expect(mappings).toEqual(DEFAULT_AGENT_TYPE_MAP);
      expect(mappings).not.toBe(DEFAULT_AGENT_TYPE_MAP); // Should be a copy
    });

    it('should include expected default mappings', () => {
      // Arrange
      // No setup needed

      // Act
      const mappings = getTypeMappings();

      // Assert
      expect(mappings['general-purpose']).toBe('executor');
      expect(mappings['plan']).toBe('planner');
      expect(mappings['explorer']).toBe('explore');
    });
  });

  describe('isKnownAgentType', () => {
    it('should return true for known types', () => {
      // Arrange
      const knownTypes = ['general-purpose', 'general', 'default', 'plan', 'explorer'];

      // Act & Assert
      knownTypes.forEach(type => {
        expect(isKnownAgentType(type)).toBe(true);
      });
    });

    it('should return false for unknown types', () => {
      // Arrange
      const input = 'custom-unknown-type';

      // Act
      const result = isKnownAgentType(input);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle prefixed types (strip prefix before check)', () => {
      // Arrange
      const input = 'oh-my-claudecode:general-purpose';

      // Act
      const result = isKnownAgentType(input);

      // Assert
      expect(result).toBe(true);
    });
  });
});
