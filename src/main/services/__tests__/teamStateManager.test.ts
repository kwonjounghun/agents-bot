/**
 * Team State Manager Unit Tests
 *
 * Tests for the team state manager module using AAA pattern.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTeamStateManager, TeamStateManager } from '../teamStateManager';

describe('TeamStateManager', () => {
  let manager: TeamStateManager;

  beforeEach(() => {
    manager = createTeamStateManager();
  });

  describe('addAgent', () => {
    it('should add an agent to the team', () => {
      // Arrange
      const agent = { id: 'agent-1', role: 'executor' as const };

      // Act
      manager.addAgent(agent);

      // Assert
      expect(manager.getAgentCount()).toBe(1);
      expect(manager.getAgent('agent-1')).toEqual(agent);
    });

    it('should not add duplicate agents', () => {
      // Arrange
      const agent = { id: 'agent-1', role: 'executor' as const };

      // Act
      manager.addAgent(agent);
      manager.addAgent(agent);

      // Assert
      expect(manager.getAgentCount()).toBe(1);
    });

    it('should add multiple different agents', () => {
      // Arrange
      const agent1 = { id: 'agent-1', role: 'executor' as const };
      const agent2 = { id: 'agent-2', role: 'explorer' as const };

      // Act
      manager.addAgent(agent1);
      manager.addAgent(agent2);

      // Assert
      expect(manager.getAgentCount()).toBe(2);
    });
  });

  describe('removeAgent', () => {
    it('should remove an existing agent', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });

      // Act
      manager.removeAgent('agent-1');

      // Assert
      expect(manager.getAgentCount()).toBe(1);
      expect(manager.getAgent('agent-1')).toBeUndefined();
      expect(manager.getAgent('agent-2')).toBeDefined();
    });

    it('should do nothing when removing non-existent agent', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });

      // Act
      manager.removeAgent('non-existent');

      // Assert
      expect(manager.getAgentCount()).toBe(1);
    });

    it('should adjust current index when removing current agent', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });
      manager.switchToNextAgent(); // Now at index 1 (agent-2)

      // Act
      manager.removeAgent('agent-2');

      // Assert
      expect(manager.getCurrentIndex()).toBe(0);
    });
  });

  describe('getCurrentAgent', () => {
    it('should return null when no agents', () => {
      // Arrange
      // Empty manager

      // Act
      const result = manager.getCurrentAgent();

      // Assert
      expect(result).toBeNull();
    });

    it('should return first agent initially', () => {
      // Arrange
      const agent1 = { id: 'agent-1', role: 'executor' as const };
      const agent2 = { id: 'agent-2', role: 'explorer' as const };
      manager.addAgent(agent1);
      manager.addAgent(agent2);

      // Act
      const result = manager.getCurrentAgent();

      // Assert
      expect(result).toEqual(agent1);
    });
  });

  describe('switchToNextAgent', () => {
    it('should cycle to next agent', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });
      manager.addAgent({ id: 'agent-3', role: 'planner' });

      // Act
      manager.switchToNextAgent();

      // Assert
      expect(manager.getCurrentAgent()?.id).toBe('agent-2');
    });

    it('should wrap around to first agent', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });

      // Act
      manager.switchToNextAgent();
      manager.switchToNextAgent();

      // Assert
      expect(manager.getCurrentAgent()?.id).toBe('agent-1');
    });

    it('should do nothing when no agents', () => {
      // Arrange
      // Empty manager

      // Act
      manager.switchToNextAgent();

      // Assert
      expect(manager.getCurrentAgent()).toBeNull();
    });
  });

  describe('maybeSwitchByTime', () => {
    it('should not switch if interval not passed', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });
      manager.resetSwitchTimer();

      // Act
      const switched = manager.maybeSwitchByTime();

      // Assert
      expect(switched).toBe(false);
      expect(manager.getCurrentAgent()?.id).toBe('agent-1');
    });
  });

  describe('getAllAgents', () => {
    it('should return empty array when no agents', () => {
      // Arrange
      // Empty manager

      // Act
      const result = manager.getAllAgents();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return all agents', () => {
      // Arrange
      const agent1 = { id: 'agent-1', role: 'executor' as const };
      const agent2 = { id: 'agent-2', role: 'explorer' as const };
      manager.addAgent(agent1);
      manager.addAgent(agent2);

      // Act
      const result = manager.getAllAgents();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(agent1);
      expect(result).toContainEqual(agent2);
    });

    it('should return a copy, not the original array', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });

      // Act
      const result = manager.getAllAgents();
      result.push({ id: 'agent-2', role: 'explorer' });

      // Assert
      expect(manager.getAgentCount()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all agents', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });

      // Act
      manager.clear();

      // Assert
      expect(manager.getAgentCount()).toBe(0);
      expect(manager.getCurrentAgent()).toBeNull();
    });

    it('should reset current index', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });
      manager.switchToNextAgent();

      // Act
      manager.clear();

      // Assert
      expect(manager.getCurrentIndex()).toBe(0);
    });
  });

  describe('hasAgent', () => {
    it('should return true for existing agent', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });

      // Act
      const result = manager.hasAgent('agent-1');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existing agent', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });

      // Act
      const result = manager.hasAgent('agent-2');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('setAgents', () => {
    it('should replace all agents', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      const newAgents = [
        { id: 'agent-2', role: 'explorer' as const },
        { id: 'agent-3', role: 'planner' as const }
      ];

      // Act
      manager.setAgents(newAgents);

      // Assert
      expect(manager.getAgentCount()).toBe(2);
      expect(manager.hasAgent('agent-1')).toBe(false);
      expect(manager.hasAgent('agent-2')).toBe(true);
      expect(manager.hasAgent('agent-3')).toBe(true);
    });

    it('should reset current index', () => {
      // Arrange
      manager.addAgent({ id: 'agent-1', role: 'executor' });
      manager.addAgent({ id: 'agent-2', role: 'explorer' });
      manager.switchToNextAgent();

      // Act
      manager.setAgents([{ id: 'agent-3', role: 'planner' }]);

      // Assert
      expect(manager.getCurrentIndex()).toBe(0);
    });
  });

  describe('custom config', () => {
    it('should respect custom switch interval', () => {
      // Arrange
      const customManager = createTeamStateManager({ switchIntervalMs: 100 });
      customManager.addAgent({ id: 'agent-1', role: 'executor' });
      customManager.addAgent({ id: 'agent-2', role: 'explorer' });

      // Act - immediately after creation, should not switch
      const switchedImmediately = customManager.maybeSwitchByTime();

      // Assert
      expect(switchedImmediately).toBe(false);
    });
  });
});
