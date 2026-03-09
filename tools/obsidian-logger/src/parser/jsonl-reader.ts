import { readFile } from 'fs/promises';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { TranscriptEntry } from '../types.js';

export async function readTranscript(filePath: string): Promise<TranscriptEntry[]> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const entries: TranscriptEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed.type === 'user' || parsed.type === 'assistant' || parsed.type === 'progress') &&
        parsed.message &&
        typeof parsed.message === 'object'
      ) {
        entries.push(parsed as TranscriptEntry);
      }
    } catch {
      // Skip malformed JSON lines
    }
  }

  return entries;
}

interface FileWithMtime {
  path: string;
  mtime: number;
}

export function findTranscripts(projectsDir: string): string[] {
  const results: FileWithMtime[] = [];

  function scanSync(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const s = statSync(fullPath);
        if (s.isDirectory()) {
          scanSync(fullPath);
        } else if (entry.endsWith('.jsonl')) {
          results.push({ path: fullPath, mtime: s.mtimeMs });
        }
      } catch {
        continue;
      }
    }
  }

  scanSync(projectsDir);
  results.sort((a, b) => b.mtime - a.mtime);
  return results.map(r => r.path);
}

export function findProjectTranscripts(projectsDir: string, projectName: string): string[] {
  const all = findTranscripts(projectsDir);
  const lowerProject = projectName.toLowerCase();

  // Project dirs are like: -Users-jonghunkwon-Documents-02-side-projects-scope
  // We match by checking if the directory name contains the projectName
  return all.filter(filePath => {
    // Get the project dir portion (parent dir of the jsonl file)
    const parts = filePath.split('/');
    // Find the segment that is within projectsDir
    const projectsDirParts = projectsDir.split('/').filter(Boolean);
    // The project dir name is the segment right after projectsDir
    const projectDirIndex = projectsDirParts.length;
    const projectDirName = parts.filter(Boolean)[projectDirIndex] ?? '';
    return projectDirName.toLowerCase().includes(lowerProject.replace(/[^a-z0-9]/gi, '-').toLowerCase());
  });
}
