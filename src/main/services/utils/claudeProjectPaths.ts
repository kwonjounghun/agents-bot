/**
 * Claude Project Paths Utilities
 * Single Responsibility: Resolve Claude project directory paths
 *
 * Claude stores project data at:
 * ~/.claude/projects/{project-slug}/{session-id}/
 *
 * Where project-slug is derived from the working directory path
 * by replacing all non-alphanumeric characters with hyphens.
 */

import { stat, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/**
 * UUID regex pattern for session directory validation
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Get the Claude projects base directory
 * @returns Path to ~/.claude/projects
 */
export function getClaudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

/**
 * Convert a working directory path to a Claude project slug
 *
 * Claude replaces ALL non-alphanumeric characters with hyphens.
 * e.g., /Users/foo/Documents/02_side-projects/scope
 *    -> -Users-foo-Documents-02-side-projects-scope
 *
 * @param workingDirectory - Absolute path to the working directory
 * @returns Project slug for Claude directory structure
 */
export function getProjectSlug(workingDirectory: string): string {
  return workingDirectory.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Get the project directory path for a working directory
 *
 * @param workingDirectory - Absolute path to the working directory
 * @returns Path to the Claude project directory
 */
export function getProjectDir(workingDirectory: string): string {
  const projectsDir = getClaudeProjectsDir();
  const projectSlug = getProjectSlug(workingDirectory);
  return join(projectsDir, projectSlug);
}

/**
 * Find the most recent session directory for a project
 *
 * Sessions are stored as UUID-named directories, sorted by modification time.
 *
 * @param projectDir - Path to the project directory
 * @returns Session ID (UUID) or null if not found
 */
export async function findLatestSessionDir(projectDir: string): Promise<string | null> {
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });

    // Filter for UUID-like directories (session IDs)
    const sessionDirs = entries.filter(
      (e) => e.isDirectory() && UUID_PATTERN.test(e.name)
    );

    if (sessionDirs.length === 0) {
      return null;
    }

    // Get stats for each directory and sort by modification time
    const dirStats = await Promise.all(
      sessionDirs.map(async (dir) => {
        const dirPath = join(projectDir, dir.name);
        const stats = await stat(dirPath);
        // Use birthtime (creation time) instead of mtime (modification time).
        // mtime updates whenever files inside are written, so an active older
        // session can appear "newer" than a just-created session for another team.
        // birthtime never changes after creation — reliable for ordering sessions.
        return { name: dir.name, birthtime: stats.birthtime };
      })
    );

    dirStats.sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());

    return dirStats[0]?.name || null;
  } catch {
    return null;
  }
}

/**
 * Get the subagents directory for the current session
 *
 * @param workingDirectory - Absolute path to the working directory
 * @returns Path to subagents directory or null if not found
 */
export async function getSubagentsDir(workingDirectory: string): Promise<string | null> {
  const projectDir = getProjectDir(workingDirectory);
  const projectSlug = getProjectSlug(workingDirectory);

  const sessionId = await findLatestSessionDir(projectDir);
  if (!sessionId) {
    console.log('[ClaudeProjectPaths] No session directory found for project:', projectSlug);
    return null;
  }

  return join(projectDir, sessionId, 'subagents');
}

/**
 * Get the session directory for the current session
 *
 * @param workingDirectory - Absolute path to the working directory
 * @returns Path to session directory or null if not found
 */
export async function getSessionDir(workingDirectory: string): Promise<string | null> {
  const projectDir = getProjectDir(workingDirectory);

  const sessionId = await findLatestSessionDir(projectDir);
  if (!sessionId) {
    return null;
  }

  return join(projectDir, sessionId);
}

/**
 * Search ALL session directories for a JSONL file whose name matches agentId.
 *
 * File naming: agent-a{hash}.jsonl
 * SDK agentId: full long hash (e.g. "aa6b472238f7dc475")
 * Match: sdkId.includes(fileHash) where fileHash is extracted from filename
 *
 * This is the correct way to find a sub-agent's transcript file in a
 * multi-team setup — no need to know the session directory in advance.
 *
 * @param workingDirectory - Absolute path to the working directory
 * @param agentId - SDK agentId to search for
 * @returns Full path to the matching JSONL file, or null if not found yet
 */
export async function findAgentTranscriptFile(
  workingDirectory: string,
  agentId: string
): Promise<string | null> {
  if (!agentId) return null;

  const projectDir = getProjectDir(workingDirectory);

  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const sessionDirs = entries
    .filter((e) => e.isDirectory() && UUID_PATTERN.test(e.name))
    .map((e) => join(projectDir, e.name, 'subagents'));

  for (const subagentsDir of sessionDirs) {
    let files: string[];
    try {
      files = await readdir(subagentsDir);
    } catch {
      continue; // subagents dir may not exist yet
    }

    for (const file of files) {
      if (!file.startsWith('agent-a') || !file.endsWith('.jsonl') || file.includes('compact')) {
        continue;
      }
      // Extract hash from filename: agent-a{hash}.jsonl -> {hash}
      const match = file.match(/^agent-a([a-f0-9]+)\.jsonl$/i);
      if (!match) continue;

      const fileHash = match[1]; // e.g. "a6b4722"
      // Match: does the SDK agentId contain this hash?
      if (agentId.includes(fileHash) || fileHash.includes(agentId.substring(0, 7))) {
        return join(subagentsDir, file);
      }
    }
  }

  return null;
}

