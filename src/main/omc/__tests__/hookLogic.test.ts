/**
 * Hook Logic Unit Tests
 *
 * Tests for pure functions in hookLogic.ts using AAA pattern.
 * All functions are pure with no side effects, making them ideal for unit testing.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSlashCommand,
  isSkillAvailable,
  mapKeywordToSkill,
  buildSkillContext,
  buildModeContext,
  buildDirectivesContext,
  buildNotesContext,
  buildActiveModesContext,
  buildProjectMemoryContext,
  isSkillProtected,
  isModeActive,
  buildSkillProtectionMessage,
  buildModeActiveMessage,
  processUserPrompt,
  processSessionStart,
  checkShouldPreventStop,
  getProjectMemoryPath,
  getSkillStatePath,
  getModeStatePath,
  getSkillDefinitionPaths,
  KEYWORD_SKILL_MAP,
  PERSISTENT_MODES
} from '../hookLogic';

describe('HookLogic', () => {
  describe('parseSlashCommand', () => {
    it('should parse simple slash command', () => {
      // Arrange
      const prompt = '/autopilot';

      // Act
      const result = parseSlashCommand(prompt);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('autopilot');
      expect(result?.args).toBe('');
    });

    it('should parse slash command with arguments', () => {
      // Arrange
      const prompt = '/autopilot build the feature';

      // Act
      const result = parseSlashCommand(prompt);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('autopilot');
      expect(result?.args).toBe('build the feature');
    });

    it('should handle hyphenated skill names', () => {
      // Arrange
      const prompt = '/oh-my-claudecode setup';

      // Act
      const result = parseSlashCommand(prompt);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('oh-my-claudecode');
      expect(result?.args).toBe('setup');
    });

    it('should return null for non-slash commands', () => {
      // Arrange
      const prompt = 'Hello world';

      // Act
      const result = parseSlashCommand(prompt);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle whitespace in prompt', () => {
      // Arrange
      const prompt = '  /ralph start  ';

      // Act
      const result = parseSlashCommand(prompt);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('ralph');
      expect(result?.args).toBe('start');
    });

    it('should be case insensitive', () => {
      // Arrange
      const prompt = '/AutoPilot';

      // Act
      const result = parseSlashCommand(prompt);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.skill).toBe('autopilot');
    });
  });

  describe('isSkillAvailable', () => {
    it('should return true when skill is in list', () => {
      // Arrange
      const skillName = 'autopilot';
      const availableSkills = ['autopilot', 'ralph', 'team'];

      // Act
      const result = isSkillAvailable(skillName, availableSkills);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when skill is not in list', () => {
      // Arrange
      const skillName = 'unknown';
      const availableSkills = ['autopilot', 'ralph', 'team'];

      // Act
      const result = isSkillAvailable(skillName, availableSkills);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for empty list', () => {
      // Arrange
      const skillName = 'autopilot';
      const availableSkills: string[] = [];

      // Act
      const result = isSkillAvailable(skillName, availableSkills);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('mapKeywordToSkill', () => {
    it('should map known keyword to skill', () => {
      // Arrange
      const keywordType = 'autopilot';

      // Act
      const result = mapKeywordToSkill(keywordType);

      // Assert
      expect(result).toBe('autopilot');
    });

    it('should map swarm to team', () => {
      // Arrange
      const keywordType = 'swarm';

      // Act
      const result = mapKeywordToSkill(keywordType);

      // Assert
      expect(result).toBe('team');
    });

    it('should return null for unknown keyword', () => {
      // Arrange
      const keywordType = 'unknown';

      // Act
      const result = mapKeywordToSkill(keywordType);

      // Assert
      expect(result).toBeNull();
    });

    it('should use custom mapping when provided', () => {
      // Arrange
      const keywordType = 'custom';
      const customMapping = { custom: 'my-skill' };

      // Act
      const result = mapKeywordToSkill(keywordType, customMapping);

      // Assert
      expect(result).toBe('my-skill');
    });
  });

  describe('buildSkillContext', () => {
    it('should format skill context correctly', () => {
      // Arrange
      const skillName = 'autopilot';
      const skillDefinition = '# Autopilot\nAutomatic execution mode.';

      // Act
      const result = buildSkillContext(skillName, skillDefinition);

      // Assert
      expect(result).toBe('[OMC Skill Activated: autopilot]\n\n# Autopilot\nAutomatic execution mode.');
    });
  });

  describe('buildModeContext', () => {
    it('should format mode context correctly', () => {
      // Arrange
      const keywordType = 'ralph';
      const skillDefinition = '# Ralph Mode\nPersistent loop mode.';

      // Act
      const result = buildModeContext(keywordType, skillDefinition);

      // Assert
      expect(result).toBe('[OMC Mode: ralph]\n\n# Ralph Mode\nPersistent loop mode.');
    });
  });

  describe('buildDirectivesContext', () => {
    it('should format directives correctly', () => {
      // Arrange
      const directives = [
        { directive: 'Use TypeScript strict mode' },
        { directive: 'Follow SRP principle', priority: 'high' }
      ];

      // Act
      const result = buildDirectivesContext(directives);

      // Assert
      expect(result).toContain('## Project Directives');
      expect(result).toContain('- Use TypeScript strict mode');
      expect(result).toContain('- Follow SRP principle');
    });

    it('should return empty string for empty directives', () => {
      // Arrange
      const directives: Array<{ directive: string }> = [];

      // Act
      const result = buildDirectivesContext(directives);

      // Assert
      expect(result).toBe('');
    });

    it('should return empty string for null directives', () => {
      // Arrange
      const directives = null as any;

      // Act
      const result = buildDirectivesContext(directives);

      // Assert
      expect(result).toBe('');
    });
  });

  describe('buildNotesContext', () => {
    it('should format notes by category', () => {
      // Arrange
      const notes = {
        build: ['Use npm run build', 'Check for type errors'],
        test: ['Run vitest']
      };

      // Act
      const result = buildNotesContext(notes);

      // Assert
      expect(result).toContain('## Project Notes');
      expect(result).toContain('### build');
      expect(result).toContain('- Use npm run build');
      expect(result).toContain('### test');
      expect(result).toContain('- Run vitest');
    });

    it('should return empty string for empty notes', () => {
      // Arrange
      const notes = {};

      // Act
      const result = buildNotesContext(notes);

      // Assert
      expect(result).toBe('');
    });

    it('should skip empty categories', () => {
      // Arrange
      const notes = {
        build: ['Some note'],
        empty: []
      };

      // Act
      const result = buildNotesContext(notes);

      // Assert
      expect(result).toContain('### build');
      expect(result).not.toContain('### empty');
    });
  });

  describe('buildActiveModesContext', () => {
    it('should format active modes correctly', () => {
      // Arrange
      const activeModes = ['autopilot', 'ralph'];

      // Act
      const result = buildActiveModesContext(activeModes);

      // Assert
      expect(result).toContain('## Active OMC Modes');
      expect(result).toContain('- autopilot');
      expect(result).toContain('- ralph');
    });

    it('should return empty string for no active modes', () => {
      // Arrange
      const activeModes: string[] = [];

      // Act
      const result = buildActiveModesContext(activeModes);

      // Assert
      expect(result).toBe('');
    });
  });

  describe('buildProjectMemoryContext', () => {
    it('should combine directives and notes', () => {
      // Arrange
      const memory = {
        directives: [{ directive: 'Use strict mode' }],
        notes: { build: ['npm run build'] }
      };

      // Act
      const result = buildProjectMemoryContext(memory);

      // Assert
      expect(result).toContain('## Project Directives');
      expect(result).toContain('## Project Notes');
    });

    it('should handle empty memory', () => {
      // Arrange
      const memory = {};

      // Act
      const result = buildProjectMemoryContext(memory);

      // Assert
      expect(result).toBe('');
    });
  });

  describe('isSkillProtected', () => {
    it('should return true when active with reinforcement', () => {
      // Arrange
      const skillState = { active: true, reinforcement_count: 3 };

      // Act
      const result = isSkillProtected(skillState);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when not active', () => {
      // Arrange
      const skillState = { active: false, reinforcement_count: 3 };

      // Act
      const result = isSkillProtected(skillState);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when no reinforcement count', () => {
      // Arrange
      const skillState = { active: true, reinforcement_count: 0 };

      // Act
      const result = isSkillProtected(skillState);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('isModeActive', () => {
    it('should return true when active', () => {
      // Arrange
      const modeState = { active: true };

      // Act
      const result = isModeActive(modeState);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when not active', () => {
      // Arrange
      const modeState = { active: false };

      // Act
      const result = isModeActive(modeState);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('buildSkillProtectionMessage', () => {
    it('should format protection message correctly', () => {
      // Arrange
      const skillName = 'autopilot';

      // Act
      const result = buildSkillProtectionMessage(skillName);

      // Assert
      expect(result).toBe('[SKILL PROTECTION] autopilot is still active. Continue working until completion.');
    });
  });

  describe('buildModeActiveMessage', () => {
    it('should format mode active message correctly', () => {
      // Arrange
      const modeName = 'ralph';

      // Act
      const result = buildModeActiveMessage(modeName);

      // Assert
      expect(result).toBe('[RALPH MODE ACTIVE] Continue working. Run /oh-my-claudecode:cancel when all tasks are complete.');
    });
  });

  describe('processUserPrompt', () => {
    it('should process slash command', () => {
      // Arrange
      const params = {
        prompt: '/autopilot build',
        availableSkills: ['autopilot', 'ralph'],
        detectedKeywords: [],
        loadSkillDefinition: (name: string) => name === 'autopilot' ? '# Autopilot' : null
      };

      // Act
      const result = processUserPrompt(params);

      // Assert
      expect(result.activatedSkill).toBe('autopilot');
      expect(result.additionalContext).toContain('[OMC Skill Activated: autopilot]');
    });

    it('should process keyword when no slash command', () => {
      // Arrange
      const params = {
        prompt: 'use autopilot to build this',
        availableSkills: ['autopilot'],
        detectedKeywords: [{ type: 'autopilot' }],
        loadSkillDefinition: () => '# Mode Definition'
      };

      // Act
      const result = processUserPrompt(params);

      // Assert
      expect(result.activatedMode).toBe('autopilot');
      expect(result.additionalContext).toContain('[OMC Mode: autopilot]');
    });

    it('should return empty context when no match', () => {
      // Arrange
      const params = {
        prompt: 'hello world',
        availableSkills: ['autopilot'],
        detectedKeywords: [],
        loadSkillDefinition: () => null
      };

      // Act
      const result = processUserPrompt(params);

      // Assert
      expect(result.additionalContext).toBe('');
      expect(result.activatedSkill).toBeUndefined();
      expect(result.activatedMode).toBeUndefined();
    });
  });

  describe('processSessionStart', () => {
    it('should build context from memory and modes', () => {
      // Arrange
      const params = {
        projectMemory: {
          directives: [{ directive: 'Use strict mode' }]
        },
        activeModes: ['autopilot']
      };

      // Act
      const result = processSessionStart(params);

      // Assert
      expect(result).toContain('## Project Directives');
      expect(result).toContain('## Active OMC Modes');
    });

    it('should return empty string for null memory and no modes', () => {
      // Arrange
      const params = {
        projectMemory: null,
        activeModes: []
      };

      // Act
      const result = processSessionStart(params);

      // Assert
      expect(result).toBe('');
    });
  });

  describe('checkShouldPreventStop', () => {
    it('should prevent stop when skill is protected', () => {
      // Arrange
      const params = {
        skillState: { active: true, skill_name: 'autopilot', reinforcement_count: 2 },
        modeStates: []
      };

      // Act
      const result = checkShouldPreventStop(params);

      // Assert
      expect(result.shouldPreventStop).toBe(true);
      expect(result.reason).toBe('skill_protected');
      expect(result.systemMessage).toContain('autopilot');
    });

    it('should prevent stop when mode is active', () => {
      // Arrange
      const params = {
        skillState: null,
        modeStates: [{ mode: 'ralph', state: { active: true } }]
      };

      // Act
      const result = checkShouldPreventStop(params);

      // Assert
      expect(result.shouldPreventStop).toBe(true);
      expect(result.reason).toBe('mode_active:ralph');
    });

    it('should allow stop when nothing is active', () => {
      // Arrange
      const params = {
        skillState: null,
        modeStates: []
      };

      // Act
      const result = checkShouldPreventStop(params);

      // Assert
      expect(result.shouldPreventStop).toBe(false);
      expect(result.systemMessage).toBeUndefined();
    });
  });

  describe('File path helpers', () => {
    it('getProjectMemoryPath should return correct path', () => {
      // Arrange
      const cwd = '/project';

      // Act
      const result = getProjectMemoryPath(cwd);

      // Assert
      expect(result).toBe('/project/.omc/project-memory.json');
    });

    it('getSkillStatePath should return correct path', () => {
      // Arrange
      const cwd = '/project';

      // Act
      const result = getSkillStatePath(cwd);

      // Assert
      expect(result).toBe('/project/.omc/state/skill-active-state.json');
    });

    it('getModeStatePath should return correct path', () => {
      // Arrange
      const cwd = '/project';
      const mode = 'autopilot';

      // Act
      const result = getModeStatePath(cwd, mode);

      // Assert
      expect(result).toBe('/project/.omc/state/autopilot-state.json');
    });

    it('getSkillDefinitionPaths should return all possible paths', () => {
      // Arrange
      const skillsPath = '/skills';
      const skillName = 'autopilot';

      // Act
      const result = getSkillDefinitionPaths(skillsPath, skillName);

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toContain('/skills/autopilot/SKILL.md');
      expect(result).toContain('/skills/autopilot/index.md');
      expect(result).toContain('/skills/autopilot/README.md');
    });
  });

  describe('Constants', () => {
    it('KEYWORD_SKILL_MAP should contain expected mappings', () => {
      // Assert
      expect(KEYWORD_SKILL_MAP.autopilot).toBe('autopilot');
      expect(KEYWORD_SKILL_MAP.ralph).toBe('ralph');
      expect(KEYWORD_SKILL_MAP.swarm).toBe('team');
    });

    it('PERSISTENT_MODES should contain expected modes', () => {
      // Assert
      expect(PERSISTENT_MODES).toContain('autopilot');
      expect(PERSISTENT_MODES).toContain('ralph');
      expect(PERSISTENT_MODES).toContain('team');
      expect(PERSISTENT_MODES).toContain('ultrawork');
    });
  });
});
