/**
 * Widget Router Unit Tests
 *
 * Tests for the widget router module using AAA pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWidgetRouter } from '../widgetRouter';
import type { TeamStateManager } from '../teamStateManager';
import type { WidgetManagerInterface } from '../widgetRouter';

describe('WidgetRouter', () => {
  let mockTeamStateManager: TeamStateManager;
  let mockWidgetManager: WidgetManagerInterface;

  beforeEach(() => {
    mockTeamStateManager = {
      addAgent: vi.fn(),
      removeAgent: vi.fn(),
      getAgent: vi.fn(),
      getCurrentAgent: vi.fn(),
      switchToNextAgent: vi.fn(),
      maybeSwitchByTime: vi.fn(),
      getAllAgents: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      getAgentCount: vi.fn().mockReturnValue(0),
      hasAgent: vi.fn(),
      setAgents: vi.fn(),
      getCurrentIndex: vi.fn(),
      resetSwitchTimer: vi.fn()
    };

    mockWidgetManager = {
      sendMessageToWidget: vi.fn(),
      sendStatusToWidget: vi.fn()
    };
  });

  describe('sendToActive', () => {
    it('should send message to current agent widget', () => {
      // Arrange
      const currentAgent = { id: 'agent-1', role: 'executor' as const };
      mockTeamStateManager.getCurrentAgent = vi.fn().mockReturnValue(currentAgent);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.sendToActive('speaking', 'Hello world');

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

    it('should not send when no current agent', () => {
      // Arrange
      mockTeamStateManager.getCurrentAgent = vi.fn().mockReturnValue(null);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.sendToActive('speaking', 'Hello');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).not.toHaveBeenCalled();
    });

    it('should not send when widget manager is null', () => {
      // Arrange
      const currentAgent = { id: 'agent-1', role: 'executor' as const };
      mockTeamStateManager.getCurrentAgent = vi.fn().mockReturnValue(currentAgent);
      const router = createWidgetRouter(mockTeamStateManager, null);

      // Act
      router.sendToActive('speaking', 'Hello');

      // Assert - no error thrown
      expect(true).toBe(true);
    });

    it('should include timestamp in message', () => {
      // Arrange
      const currentAgent = { id: 'agent-1', role: 'executor' as const };
      mockTeamStateManager.getCurrentAgent = vi.fn().mockReturnValue(currentAgent);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.sendToActive('thinking', 'Processing');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('sendToAll', () => {
    it('should send message to all agent widgets', () => {
      // Arrange
      const agents = [
        { id: 'agent-1', role: 'executor' as const },
        { id: 'agent-2', role: 'explorer' as const }
      ];
      mockTeamStateManager.getAllAgents = vi.fn().mockReturnValue(agents);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.sendToAll('thinking', 'Processing...');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledTimes(2);
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1' })
      );
      expect(mockWidgetManager.sendMessageToWidget).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-2' })
      );
    });

    it('should not send when no agents', () => {
      // Arrange
      mockTeamStateManager.getAllAgents = vi.fn().mockReturnValue([]);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.sendToAll('thinking', 'Processing...');

      // Assert
      expect(mockWidgetManager.sendMessageToWidget).not.toHaveBeenCalled();
    });

    it('should not send when widget manager is null', () => {
      // Arrange
      const agents = [{ id: 'agent-1', role: 'executor' as const }];
      mockTeamStateManager.getAllAgents = vi.fn().mockReturnValue(agents);
      const router = createWidgetRouter(mockTeamStateManager, null);

      // Act
      router.sendToAll('thinking', 'Processing...');

      // Assert - no error thrown
      expect(true).toBe(true);
    });
  });

  describe('updateActiveStatus', () => {
    it('should update status of current agent widget', () => {
      // Arrange
      const currentAgent = { id: 'agent-1', role: 'executor' as const };
      mockTeamStateManager.getCurrentAgent = vi.fn().mockReturnValue(currentAgent);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.updateActiveStatus('responding');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-1', 'responding');
    });

    it('should not update when no current agent', () => {
      // Arrange
      mockTeamStateManager.getCurrentAgent = vi.fn().mockReturnValue(null);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.updateActiveStatus('responding');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).not.toHaveBeenCalled();
    });
  });

  describe('updateAllStatus', () => {
    it('should update status of all agent widgets', () => {
      // Arrange
      const agents = [
        { id: 'agent-1', role: 'executor' as const },
        { id: 'agent-2', role: 'explorer' as const },
        { id: 'agent-3', role: 'planner' as const }
      ];
      mockTeamStateManager.getAllAgents = vi.fn().mockReturnValue(agents);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.updateAllStatus('complete');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledTimes(3);
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-1', 'complete');
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-2', 'complete');
      expect(mockWidgetManager.sendStatusToWidget).toHaveBeenCalledWith('agent-3', 'complete');
    });

    it('should not update when no agents', () => {
      // Arrange
      mockTeamStateManager.getAllAgents = vi.fn().mockReturnValue([]);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      router.updateAllStatus('complete');

      // Assert
      expect(mockWidgetManager.sendStatusToWidget).not.toHaveBeenCalled();
    });
  });

  describe('hasActiveWidgets', () => {
    it('should return true when agents exist', () => {
      // Arrange
      mockTeamStateManager.getAgentCount = vi.fn().mockReturnValue(2);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      const result = router.hasActiveWidgets();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when no agents', () => {
      // Arrange
      mockTeamStateManager.getAgentCount = vi.fn().mockReturnValue(0);
      const router = createWidgetRouter(mockTeamStateManager, mockWidgetManager);

      // Act
      const result = router.hasActiveWidgets();

      // Assert
      expect(result).toBe(false);
    });
  });
});
