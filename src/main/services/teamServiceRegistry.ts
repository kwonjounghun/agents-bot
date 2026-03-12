/**
 * TeamServiceRegistry
 *
 * Owns per-team execution infrastructure: one ClaudeAgentService,
 * StreamRouter, TranscriptWatcher, and TranscriptMessageHandler per team.
 *
 * Replaces the five global singletons in main/index.ts so that multiple
 * teams can run concurrently without sharing execution state.
 */

import type { ClaudeAgentService } from '../claudeAgentService';
import type { StreamRouter } from './streamRouter';
import type { TranscriptWatcher } from './transcriptWatcher';
import type { TranscriptMessageHandler } from './transcriptMessageHandler';

export interface TeamServiceSet {
  claudeService: ClaudeAgentService;
  streamRouter: StreamRouter;
  transcriptWatcher: TranscriptWatcher;
  transcriptHandler: TranscriptMessageHandler;
  /** Streaming message ID for text accumulation (per-team, replaces global var) */
  textMessageId: string | null;
  /** Streaming message ID for thinking accumulation (per-team, replaces global var) */
  thinkingMessageId: string | null;
}

export class TeamServiceRegistry {
  private services: Map<string, TeamServiceSet> = new Map();

  /**
   * Register a service set for a team.
   */
  set(teamId: string, serviceSet: TeamServiceSet): void {
    this.services.set(teamId, serviceSet);
  }

  /**
   * Retrieve the service set for a team.
   */
  get(teamId: string): TeamServiceSet | undefined {
    return this.services.get(teamId);
  }

  has(teamId: string): boolean {
    return this.services.has(teamId);
  }

  /**
   * Stop a single team's execution and clean up its resources.
   * Does NOT remove the entry — the team remains registered for future commands.
   */
  stopTeam(teamId: string): void {
    const svc = this.services.get(teamId);
    if (!svc) return;

    svc.claudeService.stop();
    svc.streamRouter.clear();
    svc.transcriptWatcher.stopAll();
    svc.transcriptHandler.clearAllAccumulators();
    svc.textMessageId = null;
    svc.thinkingMessageId = null;

    console.log('[TeamServiceRegistry] Team stopped:', teamId);
  }

  /**
   * Fully remove a team's service set and stop any running execution.
   */
  delete(teamId: string): boolean {
    const svc = this.services.get(teamId);
    if (!svc) return false;

    svc.claudeService.stop();
    svc.transcriptWatcher.stopAll();
    svc.transcriptHandler.clearAllAccumulators();
    this.services.delete(teamId);

    console.log('[TeamServiceRegistry] Team service set deleted:', teamId);
    return true;
  }

  /**
   * Stop all teams.
   */
  stopAll(): void {
    for (const teamId of this.services.keys()) {
      this.stopTeam(teamId);
    }
  }

  /**
   * Stop all teams and remove all service sets.
   */
  clear(): void {
    this.stopAll();
    this.services.clear();
    console.log('[TeamServiceRegistry] All service sets cleared');
  }

  get size(): number {
    return this.services.size;
  }
}

export function createTeamServiceRegistry(): TeamServiceRegistry {
  return new TeamServiceRegistry();
}
