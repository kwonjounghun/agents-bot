/**
 * Shared filesystem utilities for SDK-OMC tools
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Ensure the .omc directory exists under workingDirectory
 */
export function ensureOmcDir(workingDirectory: string): void {
  const omcDir = path.join(workingDirectory, '.omc');
  if (!fs.existsSync(omcDir)) {
    fs.mkdirSync(omcDir, { recursive: true });
  }
}
