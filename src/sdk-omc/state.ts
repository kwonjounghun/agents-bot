/**
 * SDK-OMC State Management
 *
 * Utilities for managing mode state (autopilot, ralph, team, etc.)
 * State is persisted to .omc/state/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ModeState, SkillMode, TeamState, RalphState, AutopilotState } from './types';

/**
 * Get the state directory path
 */
export function getStateDir(workingDirectory: string): string {
  return path.join(workingDirectory, '.omc', 'state');
}

/**
 * Get the state file path for a mode
 */
export function getStatePath(mode: SkillMode, workingDirectory: string): string {
  return path.join(getStateDir(workingDirectory), `${mode}-state.json`);
}

/**
 * Ensure state directory exists
 */
export function ensureStateDir(workingDirectory: string): void {
  const stateDir = getStateDir(workingDirectory);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

/**
 * Read state for a mode
 */
export async function readState<T extends ModeState = ModeState>(
  mode: SkillMode,
  workingDirectory: string
): Promise<T | null> {
  const statePath = getStatePath(mode, workingDirectory);

  try {
    if (!fs.existsSync(statePath)) {
      return null;
    }

    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`[SDK-OMC] Error reading ${mode} state:`, error);
    return null;
  }
}

/**
 * Write state for a mode
 */
export async function writeState<T extends ModeState = ModeState>(
  mode: SkillMode,
  state: T,
  workingDirectory: string
): Promise<void> {
  ensureStateDir(workingDirectory);
  const statePath = getStatePath(mode, workingDirectory);

  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[SDK-OMC] Error writing ${mode} state:`, error);
    throw error;
  }
}

/**
 * Clear state for a mode
 */
export async function clearState(
  mode: SkillMode,
  workingDirectory: string
): Promise<void> {
  const statePath = getStatePath(mode, workingDirectory);

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
 */
export async function listActiveModes(workingDirectory: string): Promise<SkillMode[]> {
  const stateDir = getStateDir(workingDirectory);
  const activeModes: SkillMode[] = [];

  const modes: SkillMode[] = ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan'];

  for (const mode of modes) {
    const state = await readState(mode, workingDirectory);
    if (state?.active) {
      activeModes.push(mode);
    }
  }

  return activeModes;
}

/**
 * Check if any mode is active
 */
export async function hasActiveModes(workingDirectory: string): Promise<boolean> {
  const activeModes = await listActiveModes(workingDirectory);
  return activeModes.length > 0;
}

/**
 * Get status of all modes
 */
export async function getModeStatus(workingDirectory: string): Promise<Record<SkillMode, ModeState | null>> {
  const modes: SkillMode[] = ['autopilot', 'ralph', 'team', 'ultrawork', 'ultrapilot', 'pipeline', 'plan'];
  const status: Record<string, ModeState | null> = {};

  for (const mode of modes) {
    status[mode] = await readState(mode, workingDirectory);
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
 * Increment iteration for a mode
 */
export async function incrementIteration(
  mode: SkillMode,
  workingDirectory: string
): Promise<number> {
  const state = await readState(mode, workingDirectory);
  if (!state) {
    throw new Error(`No active ${mode} state`);
  }

  const newIteration = (state.iteration || 0) + 1;
  await writeState(mode, { ...state, iteration: newIteration }, workingDirectory);

  return newIteration;
}

/**
 * Update phase for a mode
 */
export async function updatePhase(
  mode: SkillMode,
  phase: string,
  workingDirectory: string
): Promise<void> {
  const state = await readState(mode, workingDirectory);
  if (!state) {
    throw new Error(`No active ${mode} state`);
  }

  await writeState(mode, { ...state, currentPhase: phase }, workingDirectory);
}

/**
 * Mark mode as completed
 */
export async function completeMode(
  mode: SkillMode,
  workingDirectory: string
): Promise<void> {
  const state = await readState(mode, workingDirectory);
  if (!state) {
    return;
  }

  await writeState(mode, {
    ...state,
    active: false,
    completedAt: new Date().toISOString(),
    currentPhase: 'completed'
  }, workingDirectory);
}

/**
 * Mark mode as failed
 */
export async function failMode(
  mode: SkillMode,
  error: string,
  workingDirectory: string
): Promise<void> {
  const state = await readState(mode, workingDirectory);
  if (!state) {
    return;
  }

  await writeState(mode, {
    ...state,
    active: false,
    completedAt: new Date().toISOString(),
    currentPhase: 'failed',
    error
  }, workingDirectory);
}
