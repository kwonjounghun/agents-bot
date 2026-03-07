/**
 * StreamRouter Unit Tests
 *
 * Tests for the StreamRouter service using AAA pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StreamRouter,
  createStreamRouter,
  normalizeAgentType,
  type AgentContext,
  type StreamRouterConfig
} from '../streamRouter';

// Mock WidgetManager
const createMockWidgetManager = () => ({
  createWidget: vi.fn().mockResolvedValue({ id: 1 }),
  sendMessageToWidget: vi.fn(),
  sendStatusToWidget: vi.fn(),
  closeWidget: vi.fn(),
  closeAllWidgets: vi.fn(),
  getWidgetCount: vi.fn().mockReturnValue(0),
  hasWidget: vi.fn().mockReturnValue(false)
});

describe('StreamRouter', () => {
  let streamRouter: StreamRouter;
  let mockWidgetManager: ReturnType<typeof createMockWidgetManager>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWidgetManager = createMockWidgetManager();
    streamRouter = createStreamRouter({ autoCloseDelayMs: 3000 });
    streamRouter.setWidgetManager(mockWidgetManager as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('normalizeAgentType', () => {
    it('should remove oh-my-claudecode: prefix', () => {
      // Act
      const result = normalizeAgentType('oh-my-claudecode:executor');

      // Assert
      expect(result).toBe('executor');
    });

    it('should return agent type in lowercase', () => {
      // Act
      const result = normalizeAgentType('Planner');

      // Assert
      expect(result).toBe('planner');
    });

    it('should handle empty string by returning executor', () => {
      // Act
      const result = normalizeAgentType('');

      // Assert
      expect(result).toBe('executor');
    });

    it('should convert SDK Explore to lowercase explore', () => {
      // Act
      const result = normalizeAgentType('Explore');

      // Assert
      expect(result).toBe('explore');
    });

    it('should map general-purpose to executor', () => {
      // Act
      const result = normalizeAgentType('general-purpose');

      // Assert
      expect(result).toBe('executor');
    });
  });

  describe('pushContext', () => {
    it('should add agent to context stack', async () => {
      // Act
      await streamRouter.pushContext('agent-1', 'oh-my-claudecode:executor', false);

      // Assert
      expect(streamRouter.getStackDepth()).toBe(1);
      expect(streamRouter.hasAgent('agent-1')).toBe(true);
    });

    it('should create widget for the agent', async () => {
      // Act
      await streamRouter.pushContext('agent-1', 'oh-my-claudecode:executor', false);

      // Assert
      expect(mockWidgetManager.createWidget).toHaveBeenCalledWith('agent-1', 'executor', 0);
    });

    it('should send initial thinking status', async () => {
      // Act
      await streamRouter.pushContext('agent-1', 'oh-my-claudecode:executor', false);

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-1', 'thinking');
    });

    it('should normalize agent type in context', async () => {
      // Act
      const context = await streamRouter.pushContext('agent-1', 'oh-my-claudecode:executor', false);

      // Assert
      expect(context.normalizedRole).toBe('executor');
      expect(context.agentType).toBe('oh-my-claudecode:executor');
    });

    it('should track team membership', async () => {
      // Act
      const context = await streamRouter.pushContext('agent-1', 'executor', true);

      // Assert
      expect(context.isTeamMember).toBe(true);
    });

    it('should respect max context depth limit', async () => {
      // Arrange
      const router = createStreamRouter({ maxContextDepth: 2 });
      router.setWidgetManager(mockWidgetManager as any);

      // Act
      await router.pushContext('agent-1', 'executor', false);
      await router.pushContext('agent-2', 'planner', false);
      await router.pushContext('agent-3', 'architect', false); // Should be ignored

      // Assert
      expect(router.getStackDepth()).toBe(2);
      expect(router.hasAgent('agent-3')).toBe(false);
    });
  });

  describe('popContext', () => {
    it('should remove agent from context stack', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);

      // Act
      const context = streamRouter.popContext('agent-1');

      // Assert
      expect(streamRouter.getStackDepth()).toBe(0);
      expect(streamRouter.hasAgent('agent-1')).toBe(false);
      expect(context?.agentId).toBe('agent-1');
    });

    it('should send complete status to widget', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      vi.clearAllMocks();

      // Act
      streamRouter.popContext('agent-1');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-1', 'complete');
    });

    it('should send complete message to widget', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      vi.clearAllMocks();

      // Act
      streamRouter.popContext('agent-1');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          type: 'complete',
          content: 'Task completed'
        })
      );
    });

    it('should schedule auto-close after delay', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);

      // Act
      streamRouter.popContext('agent-1');

      // Assert - widget not closed immediately
      expect(mockWidgetManager.closeWidget).not.toHaveBeenCalled();

      // Advance timer
      vi.advanceTimersByTime(3000);

      // Assert - widget closed after delay
      expect(mockWidgetManager.closeWidget).toHaveBeenCalledWith('agent-1');
    });

    it('should return undefined for unknown agent', () => {
      // Act
      const context = streamRouter.popContext('unknown-agent');

      // Assert
      expect(context).toBeUndefined();
    });

    it('should pop correct agent from middle of stack', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);
      await streamRouter.pushContext('agent-3', 'architect', false);

      // Act
      const context = streamRouter.popContext('agent-2');

      // Assert
      expect(context?.agentId).toBe('agent-2');
      expect(streamRouter.getStackDepth()).toBe(2);
      expect(streamRouter.hasAgent('agent-1')).toBe(true);
      expect(streamRouter.hasAgent('agent-2')).toBe(false);
      expect(streamRouter.hasAgent('agent-3')).toBe(true);
    });
  });

  describe('getCurrentAgent', () => {
    it('should return null when stack is empty', () => {
      // Act
      const result = streamRouter.getCurrentAgent();

      // Assert
      expect(result).toBeNull();
    });

    it('should return top of stack', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);

      // Act
      const result = streamRouter.getCurrentAgent();

      // Assert
      expect(result?.agentId).toBe('agent-2');
    });
  });

  describe('getAllAgents', () => {
    it('should return empty array when no agents', () => {
      // Act
      const result = streamRouter.getAllAgents();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return all agents in stack', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);

      // Act
      const result = streamRouter.getAllAgents();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].agentId).toBe('agent-1');
      expect(result[1].agentId).toBe('agent-2');
    });

    it('should return a copy of the stack', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);

      // Act
      const result = streamRouter.getAllAgents();
      result.push({} as AgentContext);

      // Assert
      expect(streamRouter.getStackDepth()).toBe(1);
    });
  });

  describe('routeMessage', () => {
    it('should not send message when no active agent', () => {
      // Act
      streamRouter.routeMessage('speaking', 'Hello');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).not.toHaveBeenCalled();
    });

    it('should send message to current agent widget', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      vi.clearAllMocks();

      // Act
      streamRouter.routeMessage('speaking', 'Hello world');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          role: 'executor',
          type: 'speaking',
          content: 'Hello world'
        })
      );
    });

    it('should route to topmost agent in stack', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);
      vi.clearAllMocks();

      // Act
      streamRouter.routeMessage('thinking', 'Analyzing...');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-2',
          role: 'planner'
        })
      );
    });

    it('should cancel pending auto-close when receiving message', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      streamRouter.popContext('agent-1');
      // Re-push to simulate agent becoming active again
      await streamRouter.pushContext('agent-1', 'executor', false);
      vi.clearAllMocks();

      // Act
      streamRouter.routeMessage('speaking', 'Still working');
      vi.advanceTimersByTime(3000);

      // Assert - closeWidget should not be called because message was received
      expect(mockWidgetManager.closeWidget).not.toHaveBeenCalled();
    });
  });

  describe('routeStatus', () => {
    it('should not send status when no active agent', () => {
      // Act
      streamRouter.routeStatus('responding');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).not.toHaveBeenCalled();
    });

    it('should send status to current agent widget', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      vi.clearAllMocks();

      // Act
      streamRouter.routeStatus('responding');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-1', 'responding');
    });
  });

  describe('routeError', () => {
    it('should not send error when no active agent', () => {
      // Act
      streamRouter.routeError('Something went wrong');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).not.toHaveBeenCalled();
    });

    it('should send error to current agent only', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);
      vi.clearAllMocks();

      // Act
      streamRouter.routeError('Task failed');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledTimes(1);
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-2', 'error');
    });

    it('should send error to specific agent when agentId provided', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);
      vi.clearAllMocks();

      // Act
      streamRouter.routeError('Task failed', 'agent-1');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-1', 'error');
    });

    it('should schedule auto-close after error', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);

      // Act
      streamRouter.routeError('Task failed');
      vi.advanceTimersByTime(3000);

      // Assert
      expect(mockWidgetManager.closeWidget).toHaveBeenCalledWith('agent-1');
    });
  });

  describe('broadcastMessage', () => {
    it('should send message to all active agents', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);
      vi.clearAllMocks();

      // Act
      streamRouter.broadcastMessage('complete', 'All done');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledTimes(2);
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1' })
      );
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-2' })
      );
    });
  });

  describe('broadcastStatus', () => {
    it('should send status to all active agents', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);
      vi.clearAllMocks();

      // Act
      streamRouter.broadcastStatus('complete');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledTimes(2);
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-1', 'complete');
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-2', 'complete');
    });
  });

  describe('clear', () => {
    it('should clear all contexts', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      await streamRouter.pushContext('agent-2', 'planner', false);

      // Act
      streamRouter.clear();

      // Assert
      expect(streamRouter.getStackDepth()).toBe(0);
    });

    it('should close all widgets', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);

      // Act
      streamRouter.clear();

      // Assert
      expect(mockWidgetManager.closeAllWidgets).toHaveBeenCalled();
    });

    it('should cancel pending auto-close timers', async () => {
      // Arrange
      await streamRouter.pushContext('agent-1', 'executor', false);
      streamRouter.popContext('agent-1');

      // Act
      streamRouter.clear();
      vi.advanceTimersByTime(5000);

      // Assert - closeWidget should not be called (timer was cancelled)
      expect(mockWidgetManager.closeWidget).not.toHaveBeenCalled();
    });
  });

  describe('createStreamRouter', () => {
    it('should create router with default config', () => {
      // Act
      const router = createStreamRouter();

      // Assert
      expect(router).toBeInstanceOf(StreamRouter);
    });

    it('should create router with custom config', async () => {
      // Arrange
      const router = createStreamRouter({ autoCloseDelayMs: 5000 });
      router.setWidgetManager(mockWidgetManager as any);
      await router.pushContext('agent-1', 'executor', false);

      // Act
      router.popContext('agent-1');
      vi.advanceTimersByTime(3000);

      // Assert - should not be closed yet
      expect(mockWidgetManager.closeWidget).not.toHaveBeenCalled();

      // Advance to 5 seconds
      vi.advanceTimersByTime(2000);

      // Assert - should be closed now
      expect(mockWidgetManager.closeWidget).toHaveBeenCalledWith('agent-1');
    });
  });
});
