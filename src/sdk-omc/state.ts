/**
 * SDK-OMC State Management
 *
 * Utilities for managing mode state (autopilot, ralph, team, etc.)
 * State is persisted to .omc/state/ directory.
 *
 * Session-scoped state: .omc/state/sessions/{sessionId}/{mode}-state.json
 * Legacy fallback: .omc/state/{mode}-state.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ModeState, SkillMode, TeamState, RalphState, AutopilotState } from './types';

/**
 * State options for session-scoped operations
 */
export interface StateOptions {
  sessionId?: string;
}

/**
 * Get the state directory path
 */
export function getStateDir(workingDirectory: string, sessionId?: string): string {
  const baseDir = path.join(workingDirectory, '.omc', 'state');
  if (sessionId) {
    return path.join(baseDir, 'sessions', sessionId);
  }
  return baseDir;
}

/**
 * Get the state file path for a mode
 * When sessionId is provided, uses session-scoped path
 */
export function getStatePath(mode: SkillMode, workingDirectory: string, sessionId?: string): string {
  return path.join(getStateDir(workingDirectory, sessionId), `${mode}-state.json`);
}

/**
 * Ensure state directory exists
 */
export function ensureStateDir(workingDirectory: string, sessionId?: string): void {
  const stateDir = getStateDir(workingDirectory, sessionId);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

/**
 * Read state for a mode
 * When sessionId is provided, reads from session-scoped path first, then falls back to legacy
 */
export async function readState<T extends ModeState = ModeState>(
  mode: SkillMode,
  workingDirectory: string,
  options?: StateOptions
): Promise<T | null> {
  const sessionId = options?.sessionId;

  // Try session-scoped path first if sessionId provided
  if (sessionId) {
    const sessionPath = getStatePath(mode, workingDirectory, sessionId);
    try {
      if (fs.existsSync(sessionPath)) {
        const content = fs.readFileSync(sessionPath, 'utf-8');
        return JSON.parse(content) as T;
      }
    } catch (error) {
      console.error(`[SDK-OMC] Error reading ${mode} state from session ${sessionId}:`, error);
    }
  }

  // Fall back to legacy path
  const legacyPath = getStatePath(mode, workingDirectory);
  try {
    if (!fs.existsSync(legacyPath)) {
      return null;
    }

    const content = fs.readFileSync(legacyPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`[SDK-OMC] Error reading ${mode} state:`, error);
    return null;
  }
}

/**
 * Write state for a mode
 * When sessionId is provided, writes to session-scoped path
 */
export async function writeState<T extends ModeState = ModeState>(
  mode: SkillMode,
  state: T,
  workingDirectory: string,
  options?: StateOptions
): Promise<void> {
  const sessionId = options?.sessionId;
  ensureStateDir(workingDirectory, sessionId);
  const statePath = getStatePath(mode, workingDirectory, sessionId);

  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[SDK-OMC] Error writing ${mode} state:`, error);
    throw error;
  }
}

/**
 * Clear state for a mode
 * When sessionId is provided, clears from session-scoped path
 */
export async function clearState(
  mode: SkillMode,
  workingDirectory: string,
  options?: StateOptions
): Promise<void> {
  const sessionId = options?.sessionId;
  const statePath = getStatePath(mode, workingDirectory, sessionId);

  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
  } catch (error) {
    console.error(`[SDK-OMC] Error clearing ${mode} state:`, error);
    throw error;
  }
}

/**
 * List all active modes
 * When sessionId is provided, checks session-scoped state
 */
export async function listActiveModes(workingDirectory: string, options?: StateOptions): Promise<SkillMode[]> {
  const activeModes: SkillMode[] = [];

  const modes: SkillMode[] = ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan'];

  for (const mode of modes) {
    const state = await readState(mode, workingDirectory, options);
    if (state?.active) {
      activeModes.push(mode);
    }
  }

  return activeModes;
}

/**
 * List all active sessions
 */
export async function listActiveSessions(workingDirectory: string): Promise<string[]> {
  const sessionsDir = path.join(workingDirectory, '.omc', 'state', 'sessions');

  try {
    if (!fs.existsSync(sessionsDir)) {
      return [];
    }

    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Check if any mode is active
 */
export async function hasActiveModes(workingDirectory: string, options?: StateOptions): Promise<boolean> {
  const activeModes = await listActiveModes(workingDirectory, options);
  return activeModes.length > 0;
}

/**
 * Get status of all modes
 */
export async function getModeStatus(workingDirectory: string, options?: StateOptions): Promise<Record<SkillMode, ModeState | null>> {
  const modes: SkillMode[] = ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan'];
  const status: Record<string, ModeState | null> = {};

  for (const mode of modes) {
    status[mode] = await readState(mode, workingDirectory, options);
  }

  return status as Record<SkillMode, ModeState | null>;
}

// Specialized state helpers

/**
 * Create initial autopilot state
 */
export function createAutopilotState(goal: string): AutopilotState {
  return {
    active: true,
    iteration: 1,
    maxIterations: 10,
    currentPhase: 'planning',
    startedAt: new Date().toISOString(),
    goal,
    taskDescription: goal
  };
}

/**
 * Create initial ralph state
 */
export function createRalphState(task: string, maxIterations: number = 20): RalphState {
  return {
    active: true,
    iteration: 1,
    maxIterations,
    currentPhase: 'execution',
    startedAt: new Date().toISOString(),
    taskDescription: task
  };
}

/**
 * Create initial team state
 */
export function createTeamState(teamName: string, agentCount: number, task: string): TeamState {
  return {
    active: true,
    iteration: 1,
    currentPhase: 'team-plan',
    startedAt: new Date().toISOString(),
    teamName,
    agentCount,
    agentTypes: 'executor',
    taskDescription: task,
    fixLoopCount: 0,
    maxFixLoops: 3,
    stageHistory: `team-plan:${new Date().toISOString()}`
  };
}

/**
 * Shared read-transform-write helper for state mutations
 */
async function withStateTransaction<T>(
  mode: SkillMode,
  workingDirectory: string,
  options: StateOptions | undefined,
  transform: (state: ModeState) => ModeState & T,
  throwIfMissing = false
): Promise<void> {
  const state = await readState(mode, workingDirectory, options);
  if (!state) {
    if (throwIfMissing) throw new Error(`No active ${mode} state`);
    return;
  }
  await writeState(mode, transform(state), workingDirectory, options);
}

/**
 * Increment iteration for a mode
 */
export async function incrementIteration(
  mode: SkillMode,
  workingDirectory: string,
  options?: StateOptions
): Promise<number> {
  let newIteration = 0;
  await withStateTransaction(mode, workingDirectory, options, (state) => {
    newIteration = (state.iteration || 0) + 1;
    return { ...state, iteration: newIteration };
  }, true);
  return newIteration;
}

/**
 * Update phase for a mode
 */
export async function updatePhase(
  mode: SkillMode,
  phase: string,
  workingDirectory: string,
  options?: StateOptions
): Promise<void> {
  await withStateTransaction(mode, workingDirectory, options, (state) => ({ ...state, currentPhase: phase }), true);
}

/**
 * Mark mode as completed
 */
export async function completeMode(
  mode: SkillMode,
  workingDirectory: string,
  options?: StateOptions
): Promise<void> {
  await withStateTransaction(mode, workingDirectory, options, (state) => ({
    ...state,
    active: false,
    completedAt: new Date().toISOString(),
    currentPhase: 'completed'
  }));
}

/**
 * Mark mode as failed
 */
export async function failMode(
  mode: SkillMode,
  error: string,
  workingDirectory: string,
  options?: StateOptions
): Promise<void> {
  await withStateTransaction(mode, workingDirectory, options, (state) => ({
    ...state,
    active: false,
    completedAt: new Date().toISOString(),
    currentPhase: 'failed',
    error
  }));
}
