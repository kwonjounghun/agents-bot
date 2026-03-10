/**
 * Persistent Mode Service
 *
 * Manages persistent execution modes (Ralph, Autopilot).
 * Single responsibility: persistent execution loop lifecycle.
 */

import { EventEmitter } from 'events';
import type { ExecutionResult, SkillMode } from '../../sdk-omc/types';
import {
  PersistentModeExecutor,
  createPersistentModeExecutor,
  type QueryResult
} from '../../sdk-omc/executor';

export interface PersistentModeConfig {
  workingDirectory: string;
  maxIterations?: number;
  requireVerification?: boolean;
}

export interface PersistentModeEvents {
  modeStarted: { mode: string; task: string };
  iterationStarted: { iteration: number; maxIterations: number };
  iterationCompleted: { iteration: number; response: string };
  completionChecked: { checkResult: { isComplete: boolean } };
  verificationCompleted: { approved: boolean };
  modeCompleted: { mode: string; iteration: number };
  modeEnded: { mode: string; success: boolean };
}

/**
 * Query function type for executing prompts
 */
export type QueryFunction = (prompt: string) => Promise<QueryResult>;

/**
 * Persistent Mode Service
 *
 * Manages the lifecycle of persistent execution modes like Ralph and Autopilot.
 */
export class PersistentModeService extends EventEmitter {
  private workingDirectory: string;
  private executor: PersistentModeExecutor | null = null;
  private queryFn: QueryFunction;
  private maxIterations: number;
  private requireVerification: boolean;

  constructor(config: PersistentModeConfig, queryFn: QueryFunction) {
    super();
    this.workingDirectory = config.workingDirectory;
    this.queryFn = queryFn;
    this.maxIterations = config.maxIterations || 20;
    this.requireVerification = config.requireVerification ?? true;
  }

  /**
   * Set working directory
   */
  setWorkingDirectory(workingDirectory: string): void {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Execute a persistent mode (Ralph, Autopilot, etc.)
   */
  async execute(
    mode: SkillMode,
    task: string,
    options?: { maxIterations?: number; requireVerification?: boolean }
  ): Promise<ExecutionResult> {
    // Create executor if not exists
    if (!this.executor) {
      this.executor = createPersistentModeExecutor(
        this.workingDirectory,
        this.queryFn,
        {
          maxIterations: options?.maxIterations || this.maxIterations,
          requireVerification: options?.requireVerification ?? this.requireVerification
        }
      );

      // Forward executor events
      this.setupExecutorEvents(mode);
    }

    // Execute the appropriate mode
    switch (mode) {
      case 'ralph':
        return this.executor.executeRalph(task);
      case 'autopilot':
        return this.executor.executeAutopilot(task);
      default:
        return {
          success: false,
          mode,
          iterations: 0,
          error: `Persistent execution not implemented for mode: ${mode}`
        };
    }
  }

  /**
   * Stop persistent mode execution
   */
  stop(): void {
    if (this.executor) {
      this.executor.stop();
    }
  }

  /**
   * Check if persistent mode is running
   */
  isRunning(): boolean {
    return this.executor?.getIsRunning() || false;
  }

  /**
   * Reset the executor (for cleanup)
   */
  reset(): void {
    if (this.executor) {
      this.executor.stop();
      this.executor = null;
    }
  }

  /**
   * Setup executor event forwarding
   */
  private setupExecutorEvents(mode: SkillMode): void {
    if (!this.executor) return;

    this.executor.on('modeStarted', (data) => {
      this.emit('modeStarted', { ...data, mode });
    });

    this.executor.on('iterationStarted', (data) => {
      this.emit('iterationStarted', data);
    });

    this.executor.on('iterationCompleted', (data) => {
      this.emit('iterationCompleted', data);
    });

    this.executor.on('completionChecked', (data) => {
      this.emit('completionChecked', data);
    });

    this.executor.on('verificationCompleted', (data) => {
      this.emit('verificationCompleted', data);
    });

    this.executor.on('modeCompleted', (data) => {
      this.emit('modeCompleted', { ...data, mode });
    });

    this.executor.on('modeEnded', (data) => {
      this.emit('modeEnded', { ...data, mode });
    });
  }
}

/**
 * Create a persistent mode service instance
 */
export function createPersistentModeService(
  config: PersistentModeConfig,
  queryFn: QueryFunction
): PersistentModeService {
  return new PersistentModeService(config, queryFn);
}
