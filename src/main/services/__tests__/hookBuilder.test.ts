/**
 * Hook Builder Unit Tests
 *
 * Tests for the hook builder module using AAA pattern.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildBaseHooks,
  mergeHooks,
  buildQueryOptions
} from '../hookBuilder';

describe('HookBuilder', () => {
  describe('buildBaseHooks', () => {
    it('should create hooks with SubagentStart handler', () => {
      // Arrange
      const callbacks = {
        onAgentStart: vi.fn(),
        onAgentStop: vi.fn()
      };

      // Act
      const hooks = buildBaseHooks(callbacks);

      // Assert
      expect(hooks.SubagentStart).toBeDefined();
      expect(hooks.SubagentStart).toHaveLength(1);
      expect(hooks.SubagentStart![0].hooks).toHaveLength(1);
    });

    it('should create hooks with SubagentStop handler', () => {
      // Arrange
      const callbacks = {
        onAgentStart: vi.fn(),
        onAgentStop: vi.fn()
      };

      // Act
      const hooks = buildBaseHooks(callbacks);

      // Assert
      expect(hooks.SubagentStop).toBeDefined();
      expect(hooks.SubagentStop).toHaveLength(1);
      expect(hooks.SubagentStop![0].hooks).toHaveLength(1);
    });

    it('should call onAgentStart callback when SubagentStart hook executes', async () => {
      // Arrange
      const callbacks = {
        onAgentStart: vi.fn(),
        onAgentStop: vi.fn()
      };
      const hooks = buildBaseHooks(callbacks);
      const input = {
        agent_id: 'test-agent',
        subagent_type: 'executor'
      };

      // Act
      const hookFn = hooks.SubagentStart![0].hooks[0];
      const result = await hookFn(input);

      // Assert
      expect(callbacks.onAgentStart).toHaveBeenCalledWith({
        agentId: 'test-agent',
        agentType: 'executor'
      });
      expect(result.continue).toBe(true);
    });

    it('should call onAgentStop callback when SubagentStop hook executes', async () => {
      // Arrange
      const callbacks = {
        onAgentStart: vi.fn(),
        onAgentStop: vi.fn()
      };
      const hooks = buildBaseHooks(callbacks);
      const input = {
        agent_id: 'test-agent',
        agent_transcript_path: '/path/to/transcript'
      };

      // Act
      const hookFn = hooks.SubagentStop![0].hooks[0];
      const result = await hookFn(input);

      // Assert
      expect(callbacks.onAgentStop).toHaveBeenCalledWith({
        agentId: 'test-agent',
        transcriptPath: '/path/to/transcript'
      });
      expect(result.continue).toBe(true);
    });

    it('should extract agent_type when subagent_type is missing', async () => {
      // Arrange
      const callbacks = {
        onAgentStart: vi.fn(),
        onAgentStop: vi.fn()
      };
      const hooks = buildBaseHooks(callbacks);
      const input = {
        agent_id: 'test-agent',
        agent_type: 'planner'
      };

      // Act
      const hookFn = hooks.SubagentStart![0].hooks[0];
      await hookFn(input);

      // Assert
      expect(callbacks.onAgentStart).toHaveBeenCalledWith({
        agentId: 'test-agent',
        agentType: 'planner'
      });
    });

    it('should use "unknown" when no agent type fields present', async () => {
      // Arrange
      const callbacks = {
        onAgentStart: vi.fn(),
        onAgentStop: vi.fn()
      };
      const hooks = buildBaseHooks(callbacks);
      const input = { agent_id: 'test-agent' };

      // Act
      const hookFn = hooks.SubagentStart![0].hooks[0];
      await hookFn(input);

      // Assert
      expect(callbacks.onAgentStart).toHaveBeenCalledWith({
        agentId: 'test-agent',
        agentType: 'unknown'
      });
    });
  });

  describe('mergeHooks', () => {
    it('should return base hooks when additional is null', () => {
      // Arrange
      const baseHooks = {
        SubagentStart: [{ hooks: [vi.fn()] }]
      };

      // Act
      const result = mergeHooks(baseHooks, null);

      // Assert
      expect(result).toEqual(baseHooks);
    });

    it('should merge hooks with same key', () => {
      // Arrange
      const baseHooks = {
        SubagentStart: [{ hooks: [vi.fn()] }]
      };
      const additionalHooks = {
        SubagentStart: [{ hooks: [vi.fn()] }]
      };

      // Act
      const result = mergeHooks(baseHooks, additionalHooks);

      // Assert
      expect(result.SubagentStart).toHaveLength(2);
    });

    it('should add new keys from additional hooks', () => {
      // Arrange
      const baseHooks = {
        SubagentStart: [{ hooks: [vi.fn()] }]
      };
      const additionalHooks = {
        SubagentStop: [{ hooks: [vi.fn()] }]
      };

      // Act
      const result = mergeHooks(baseHooks, additionalHooks);

      // Assert
      expect(result.SubagentStart).toBeDefined();
      expect(result.SubagentStop).toBeDefined();
    });

    it('should preserve base hooks when merging', () => {
      // Arrange
      const baseFn = vi.fn();
      const additionalFn = vi.fn();
      const baseHooks = {
        SubagentStart: [{ hooks: [baseFn] }]
      };
      const additionalHooks = {
        SubagentStart: [{ hooks: [additionalFn] }]
      };

      // Act
      const result = mergeHooks(baseHooks, additionalHooks);

      // Assert
      expect(result.SubagentStart![0].hooks[0]).toBe(baseFn);
      expect(result.SubagentStart![1].hooks[0]).toBe(additionalFn);
    });
  });

  describe('buildQueryOptions', () => {
    it('should build query options with required fields', () => {
      // Arrange
      const params = {
        workingDirectory: '/path/to/project'
      };

      // Act
      const result = buildQueryOptions(params);

      // Assert
      expect(result.cwd).toBe('/path/to/project');
      expect(result.permissionMode).toBe('bypassPermissions');
      expect(result.allowDangerouslySkipPermissions).toBe(true);
      expect(result.includePartialMessages).toBe(true);
    });

    it('should include model when provided', () => {
      // Arrange
      const params = {
        workingDirectory: '/path/to/project',
        model: 'claude-3-opus'
      };

      // Act
      const result = buildQueryOptions(params);

      // Assert
      expect(result.model).toBe('claude-3-opus');
    });

    it('should include abortController when provided', () => {
      // Arrange
      const abortController = new AbortController();
      const params = {
        workingDirectory: '/path/to/project',
        abortController
      };

      // Act
      const result = buildQueryOptions(params);

      // Assert
      expect(result.abortController).toBe(abortController);
    });

    it('should include hooks when provided', () => {
      // Arrange
      const hooks = { SubagentStart: [{ hooks: [vi.fn()] }] };
      const params = {
        workingDirectory: '/path/to/project',
        hooks
      };

      // Act
      const result = buildQueryOptions(params);

      // Assert
      expect(result.hooks).toBe(hooks);
    });

    it('should include agents when provided', () => {
      // Arrange
      const agents = { executor: { name: 'executor' } };
      const params = {
        workingDirectory: '/path/to/project',
        agents
      };

      // Act
      const result = buildQueryOptions(params);

      // Assert
      expect(result.agents).toBe(agents);
    });
  });
});
