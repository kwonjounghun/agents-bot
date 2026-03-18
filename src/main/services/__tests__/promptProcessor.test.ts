/**
 * Prompt Processor Unit Tests
 *
 * Tests for the prompt processor module using AAA pattern.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSlashCommand,
  buildFinalPrompt
} from '../promptProcessor';

describe('PromptProcessor', () => {
  describe('parseSlashCommand', () => {
    it('should parse valid slash command with args', () => {
      // Arrange
      const input = '/autopilot build me a feature';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('autopilot');
      expect(result?.args).toBe('build me a feature');
    });

    it('should parse slash command without args', () => {
      // Arrange
      const input = '/help';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('help');
      expect(result?.args).toBe('');
    });

    it('should handle mixed case commands', () => {
      // Arrange
      const input = '/AutoPilot Build Feature';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('autopilot');
    });

    it('should handle commands with hyphens', () => {
      // Arrange
      const input = '/code-review check this code';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('code-review');
      expect(result?.args).toBe('check this code');
    });

    it('should handle commands with numbers', () => {
      // Arrange
      const input = '/test123 args here';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('test123');
    });

    it('should return null for regular prompts', () => {
      // Arrange
      const input = 'Help me write some code';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for prompts starting with // (not slash command)', () => {
      // Arrange
      const input = '// This is a comment';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for prompts with slash in middle', () => {
      // Arrange
      const input = 'Check the /path/to/file';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle whitespace before command', () => {
      // Arrange
      const input = '  /autopilot build feature';

      // Act
      const result = parseSlashCommand(input);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('autopilot');
    });
  });

  describe('buildFinalPrompt', () => {
    it('should return base prompt when no contexts', () => {
      // Arrange
      const basePrompt = 'Build a feature';

      // Act
      const result = buildFinalPrompt(basePrompt);

      // Assert
      expect(result).toBe('Build a feature');
    });

    it('should prepend skill context', () => {
      // Arrange
      const basePrompt = 'Build a feature';
      const skillContext = '[OMC Skill: autopilot]\n\nSkill definition here';

      // Act
      const result = buildFinalPrompt(basePrompt, skillContext);

      // Assert
      expect(result).toContain('[OMC Skill: autopilot]');
      expect(result).toContain('User Request:');
      expect(result).toContain('Build a feature');
      expect(result.indexOf('OMC Skill')).toBeLessThan(result.indexOf('Build a feature'));
    });

    it('should prepend OMC context before everything', () => {
      // Arrange
      const basePrompt = 'Build a feature';
      const omcContext = '[SDK-OMC MODE: AUTOPILOT]';

      // Act
      const result = buildFinalPrompt(basePrompt, undefined, omcContext);

      // Assert
      expect(result).toContain('[SDK-OMC MODE: AUTOPILOT]');
      expect(result.indexOf('SDK-OMC MODE')).toBeLessThan(result.indexOf('Build a feature'));
    });

    it('should combine both contexts correctly', () => {
      // Arrange
      const basePrompt = 'Build a feature';
      const skillContext = 'Skill definition';
      const omcContext = '[SDK-OMC MODE: AUTOPILOT]';

      // Act
      const result = buildFinalPrompt(basePrompt, skillContext, omcContext);

      // Assert
      expect(result).toContain('SDK-OMC MODE');
      expect(result).toContain('Skill definition');
      expect(result).toContain('Build a feature');
      // Order: OMC context -> Skill context -> Base prompt
      expect(result.indexOf('SDK-OMC MODE')).toBeLessThan(result.indexOf('Skill definition'));
    });
  });

});
