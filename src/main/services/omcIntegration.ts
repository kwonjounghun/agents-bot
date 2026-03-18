/**
 * OMC Integration Service (Minimal)
 *
 * With settingSources: ["user", "project"], the SDK automatically loads
 * agents, hooks, skills, and CLAUDE.md from the filesystem.
 * This service is reduced to a simple working directory holder.
 */

export interface OMCIntegrationConfig {
  workingDirectory: string;
}

export class OMCIntegration {
  private workingDirectory: string;

  constructor(config: OMCIntegrationConfig) {
    this.workingDirectory = config.workingDirectory;
  }

  setWorkingDirectory(workingDirectory: string): void {
    this.workingDirectory = workingDirectory;
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}

export function createOMCIntegration(config: OMCIntegrationConfig): OMCIntegration {
  return new OMCIntegration(config);
}
