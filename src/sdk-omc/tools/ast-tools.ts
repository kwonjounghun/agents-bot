/**
 * SDK-OMC AST Tools
 *
 * Abstract Syntax Tree tools for structural code search and replace.
 * These are simplified implementations using regex patterns.
 *
 * For full AST functionality, you would need @ast-grep/napi.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../skills';

// Common AST-like patterns for search
const AST_PATTERNS: Record<string, Record<string, RegExp>> = {
  javascript: {
    'function $NAME($$$ARGS)': /function\s+(\w+)\s*\(([^)]*)\)/g,
    'const $NAME = ($$$ARGS) =>': /const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/g,
    'class $NAME': /class\s+(\w+)/g,
    'import $$$IMPORTS from "$MODULE"': /import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/g,
    'console.log($MSG)': /console\.log\(([^)]+)\)/g,
    'if ($COND)': /if\s*\(([^)]+)\)/g
  },
  typescript: {
    'function $NAME($$$ARGS): $TYPE': /function\s+(\w+)\s*\(([^)]*)\)\s*:\s*(\w+)/g,
    'interface $NAME': /interface\s+(\w+)/g,
    'type $NAME = ': /type\s+(\w+)\s*=/g,
    'const $NAME: $TYPE =': /const\s+(\w+)\s*:\s*([^=]+)\s*=/g
  },
  python: {
    'def $NAME($$$ARGS):': /def\s+(\w+)\s*\(([^)]*)\)\s*:/g,
    'class $NAME:': /class\s+(\w+)\s*:/g,
    'import $MODULE': /import\s+(\w+)/g,
    'from $MODULE import $$$IMPORTS': /from\s+(\w+)\s+import\s+(.+)/g
  }
};

interface ASTMatch {
  pattern: string;
  match: string;
  line: number;
  column: number;
  file: string;
  captures: Record<string, string>;
}

/**
 * Convert user pattern to regex
 */
function patternToRegex(pattern: string): RegExp {
  // Replace meta-variables with capture groups
  let regexStr = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\\\$\\\$\\\$(\w+)/g, '(.+?)') // $$$VAR -> capture multiple
    .replace(/\\\$(\w+)/g, '(\\w+)'); // $VAR -> capture single word

  return new RegExp(regexStr, 'g');
}

/**
 * Extract meta-variable names from pattern
 */
function extractMetaVars(pattern: string): string[] {
  const matches = pattern.match(/\$+\w+/g) || [];
  return matches.map(m => m.replace(/^\$+/, ''));
}

/**
 * Walk a directory recursively, calling onFile for each file encountered.
 * Skips dotfiles and node_modules. Stops early if shouldStop returns true.
 */
function walkDirectory(dir: string, onFile: (file: string) => void, shouldStop?: () => boolean): void {
  if (!fs.existsSync(dir)) return;

  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    onFile(dir);
    return;
  }

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (shouldStop?.()) break;
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const fullPath = path.join(dir, entry);
    const entryStat = fs.statSync(fullPath);

    if (entryStat.isDirectory()) {
      walkDirectory(fullPath, onFile, shouldStop);
    } else if (entryStat.isFile()) {
      onFile(fullPath);
    }
  }
}

/**
 * Get language from file extension
 */
function getLanguage(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase();
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python'
  };
  return langMap[ext] || ext;
}

/**
 * Search for pattern in file
 */
function searchInFile(
  content: string,
  file: string,
  pattern: string,
  regex: RegExp
): ASTMatch[] {
  const results: ASTMatch[] = [];
  const lines = content.split('\n');
  const metaVars = extractMetaVars(pattern);

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      const currentMatch = match; // Capture for closure
      const captures: Record<string, string> = {};
      metaVars.forEach((name, index) => {
        if (currentMatch[index + 1]) {
          captures[name] = currentMatch[index + 1];
        }
      });

      results.push({
        pattern,
        match: match[0],
        line: lineNum + 1,
        column: match.index,
        file,
        captures
      });
    }
  }

  return results;
}

/**
 * AST Grep Search Tool
 */
export const astGrepSearchTool: ToolDefinition = {
  name: 'ast_grep_search',
  description: `Search for code patterns using AST matching. More precise than text search.

Use meta-variables in patterns:
- $NAME - matches any single AST node (identifier, expression, etc.)
- $$$ARGS - matches multiple nodes (for function arguments, list items, etc.)

Examples:
- "function $NAME($$$ARGS)" - find all function declarations
- "console.log($MSG)" - find all console.log calls
- "if ($COND)" - find all if statements
- "import $$$IMPORTS from '$MODULE'" - find imports`,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'AST pattern with meta-variables ($VAR, $$$VARS)'
      },
      language: {
        type: 'string',
        enum: ['javascript', 'typescript', 'python'],
        description: 'Programming language'
      },
      path: {
        type: 'string',
        description: 'File or directory to search in'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results',
        default: 50
      }
    },
    required: ['pattern', 'language']
  },
  handler: async (args, context) => {
    const pattern = args.pattern as string;
    const language = args.language as string;
    const searchPath = (args.path as string) || context?.cwd || process.cwd();
    const maxResults = (args.maxResults as number) || 50;

    const regex = patternToRegex(pattern);
    const results: ASTMatch[] = [];

    const processFile = (file: string) => {
      if (!fs.existsSync(file)) return;

      const fileLang = getLanguage(file);
      if (fileLang !== language) return;

      const content = fs.readFileSync(file, 'utf-8');
      const matches = searchInFile(content, file, pattern, regex);
      results.push(...matches);
    };

    walkDirectory(searchPath, processFile, () => results.length >= maxResults);

    const limited = results.slice(0, maxResults);

    if (limited.length === 0) {
      return {
        content: [{ type: 'text', text: `No matches found for pattern: ${pattern}` }]
      };
    }

    const output = limited.map(r => {
      const captures = Object.entries(r.captures)
        .map(([k, v]) => `$${k}="${v}"`)
        .join(', ');
      return `${r.file}:${r.line}:${r.column}\n  Match: ${r.match}\n  Captures: ${captures || 'none'}`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `**AST Search Results** (${limited.length}${results.length > maxResults ? ` of ${results.length}` : ''} matches)\n\n${output}`
      }]
    };
  }
};

/**
 * AST Grep Replace Tool
 */
export const astGrepReplaceTool: ToolDefinition = {
  name: 'ast_grep_replace',
  description: `Replace code patterns using AST matching. Preserves matched content via meta-variables.

Use meta-variables in both pattern and replacement:
- $NAME in pattern captures a node, use $NAME in replacement to insert it
- $$$ARGS captures multiple nodes

Examples:
- Pattern: "console.log($MSG)" -> Replacement: "logger.info($MSG)"
- Pattern: "var $NAME = $VALUE" -> Replacement: "const $NAME = $VALUE"

IMPORTANT: dryRun=true (default) only previews changes. Set dryRun=false to apply.`,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Pattern to match'
      },
      replacement: {
        type: 'string',
        description: 'Replacement pattern (use same meta-variables)'
      },
      language: {
        type: 'string',
        enum: ['javascript', 'typescript', 'python'],
        description: 'Programming language'
      },
      path: {
        type: 'string',
        description: 'File or directory to process'
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview changes without applying',
        default: true
      }
    },
    required: ['pattern', 'replacement', 'language']
  },
  handler: async (args, context) => {
    const pattern = args.pattern as string;
    const replacement = args.replacement as string;
    const language = args.language as string;
    const searchPath = (args.path as string) || context?.cwd || process.cwd();
    const dryRun = args.dryRun !== false;

    const regex = patternToRegex(pattern);
    const metaVars = extractMetaVars(pattern);

    interface ReplaceResult {
      file: string;
      line: number;
      original: string;
      replaced: string;
    }

    const results: ReplaceResult[] = [];

    const processFile = (file: string) => {
      if (!fs.existsSync(file)) return;

      const fileLang = getLanguage(file);
      if (fileLang !== language) return;

      let content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      let modified = false;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        regex.lastIndex = 0;

        if (regex.test(line)) {
          regex.lastIndex = 0;
          const newLine = line.replace(regex, (match, ...groups) => {
            // Build replacement with captured values
            let result = replacement;
            metaVars.forEach((name, index) => {
              const value = groups[index] || '';
              result = result.replace(new RegExp(`\\$\\$\\$${name}|\\$${name}`, 'g'), value);
            });
            return result;
          });

          if (newLine !== line) {
            results.push({
              file,
              line: lineNum + 1,
              original: line.trim(),
              replaced: newLine.trim()
            });
            lines[lineNum] = newLine;
            modified = true;
          }
        }
      }

      if (modified && !dryRun) {
        fs.writeFileSync(file, lines.join('\n'), 'utf-8');
      }
    };

    walkDirectory(searchPath, processFile);

    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: `No matches found for pattern: ${pattern}` }]
      };
    }

    const output = results.map(r =>
      `${r.file}:${r.line}\n  - ${r.original}\n  + ${r.replaced}`
    ).join('\n\n');

    const status = dryRun ? '(DRY RUN - no changes applied)' : `(${results.length} replacements applied)`;

    return {
      content: [{
        type: 'text',
        text: `**AST Replace Results** ${status}\n\n${output}`
      }]
    };
  }
};

/**
 * All AST tools
 */
export const astTools: ToolDefinition[] = [
  astGrepSearchTool,
  astGrepReplaceTool
];
