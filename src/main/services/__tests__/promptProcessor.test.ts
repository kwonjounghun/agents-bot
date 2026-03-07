/**
 * Prompt Processor Unit Tests
 *
 * Tests for the prompt processor module using AAA pattern.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSlashCommand,
  buildFinalPrompt,
  buildOmcAgentContext,
  processOMCCommand
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

  describe('buildOmcAgentContext', () => {
    it('should build context with suggested mode', () => {
      // Arrange
      const agents = {
        executor: { description: 'Executes code changes' },
        explorer: { description: 'Explores codebase' }
      };
      const suggestedMode = 'autopilot';

      // Act
      const result = buildOmcAgentContext(agents, suggestedMode);

      // Assert
      expect(result).toContain('[SDK-OMC MODE: AUTOPILOT]');
      expect(result).toContain('executor: Executes code changes');
      expect(result).toContain('explorer: Explores codebase');
    });

    it('should build context without suggested mode', () => {
      // Arrange
      const agents = {
        executor: { description: 'Executes code changes' }
      };

      // Act
      const result = buildOmcAgentContext(agents);

      // Assert
      expect(result).not.toContain('[SDK-OMC MODE:');
      expect(result).toContain('executor: Executes code changes');
    });

    it('should include available_agents tag', () => {
      // Arrange
      const agents = {
        executor: { description: 'Executes' }
      };

      // Act
      const result = buildOmcAgentContext(agents);

      // Assert
      expect(result).toContain('<available_agents>');
      expect(result).toContain('</available_agents>');
    });
  });

  describe('processOMCCommand', () => {
    it('should return original prompt when OMC not installed', () => {
      // Arrange
      const prompt = '/autopilot build feature';
      const installation = { isInstalled: false };
      const availableSkills: string[] = [];

      // Act
      const result = processOMCCommand(prompt, installation, availableSkills);

      // Assert
      expect(result.prompt).toBe(prompt);
      expect(result.skillContext).toBeUndefined();
    });

    it('should return original prompt for non-slash commands', () => {
      // Arrange
      const prompt = 'Build me a feature';
      const installation = { isInstalled: true, skillsPath: '/path/to/skills' };
      const availableSkills = ['autopilot'];

      // Act
      const result = processOMCCommand(prompt, installation, availableSkills);

      // Assert
      expect(result.prompt).toBe('Build me a feature');
      expect(result.skillContext).toBeUndefined();
    });

    it('should return original prompt for unknown skills', () => {
      // Arrange
      const prompt = '/unknown-skill do something';
      const installation = { isInstalled: true, skillsPath: '/path/to/skills' };
      const availableSkills = ['autopilot', 'help'];

      // Act
      const result = processOMCCommand(prompt, installation, availableSkills);

      // Assert
      expect(result.prompt).toBe(prompt);
      expect(result.skillContext).toBeUndefined();
    });
  });
});
