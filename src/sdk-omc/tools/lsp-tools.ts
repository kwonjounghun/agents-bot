/**
 * SDK-OMC LSP Tools
 *
 * Language Server Protocol tools for code intelligence.
 * These tools provide hover, goto definition, find references, etc.
 *
 * Note: These are simplified implementations that use basic file operations.
 * For full LSP functionality, you would need to connect to actual language servers.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../skills';

// Simple regex patterns for common symbol types
const PATTERNS = {
  typescript: {
    function: /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|\([^)]*\))/g,
    class: /class\s+(\w+)/g,
    interface: /interface\s+(\w+)/g,
    type: /type\s+(\w+)/g,
    export: /export\s+(?:default\s+)?(?:function|const|class|interface|type)\s+(\w+)/g
  },
  javascript: {
    function: /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|\([^)]*\))/g,
    class: /class\s+(\w+)/g,
    export: /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g
  },
  python: {
    function: /def\s+(\w+)\s*\(/g,
    class: /class\s+(\w+)/g
  }
};

interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
  character: number;
  file: string;
}

/**
 * Get file extension
 */
function getExtension(file: string): string {
  return path.extname(file).slice(1).toLowerCase();
}

/**
 * Get patterns for file type
 */
function getPatternsForFile(file: string): Record<string, RegExp> | null {
  const ext = getExtension(file);
  if (['ts', 'tsx'].includes(ext)) return PATTERNS.typescript;
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return PATTERNS.javascript;
  if (ext === 'py') return PATTERNS.python;
  return null;
}

/**
 * Find symbol at position
 */
function findSymbolAtPosition(content: string, line: number, character: number): string | null {
  const lines = content.split('\n');
  if (line < 1 || line > lines.length) return null;

  const lineText = lines[line - 1];
  if (character < 0 || character >= lineText.length) return null;

  // Find word boundaries around the position
  let start = character;
  let end = character;

  while (start > 0 && /\w/.test(lineText[start - 1])) start--;
  while (end < lineText.length && /\w/.test(lineText[end])) end++;

  return lineText.slice(start, end) || null;
}

/**
 * Find all occurrences of a symbol in a file
 */
function findSymbolInFile(content: string, symbolName: string): Array<{ line: number; character: number }> {
  const results: Array<{ line: number; character: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      results.push({ line: i + 1, character: match.index });
    }
  }

  return results;
}

/**
 * LSP Hover Tool
 */
export const lspHoverTool: ToolDefinition = {
  name: 'lsp_hover',
  description: 'Get type information, documentation, and signature at a specific position in a file.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the source file'
      },
      line: {
        type: 'number',
        description: 'Line number (1-indexed)'
      },
      character: {
        type: 'number',
        description: 'Character position in the line (0-indexed)'
      }
    },
    required: ['file', 'line', 'character']
  },
  handler: async (args, context) => {
    const file = args.file as string;
    const line = args.line as number;
    const character = args.character as number;

    if (!fs.existsSync(file)) {
      return { content: [{ type: 'text', text: `File not found: ${file}` }] };
    }

    const content = fs.readFileSync(file, 'utf-8');
    const symbol = findSymbolAtPosition(content, line, character);

    if (!symbol) {
      return { content: [{ type: 'text', text: 'No symbol found at position' }] };
    }

    // Find definition context
    const lines = content.split('\n');
    const lineText = lines[line - 1];

    return {
      content: [{
        type: 'text',
        text: `**Symbol**: ${symbol}
**File**: ${file}:${line}:${character}
**Line**: ${lineText.trim()}`
      }]
    };
  }
};

/**
 * LSP Go to Definition Tool
 */
export const lspGotoDefinitionTool: ToolDefinition = {
  name: 'lsp_goto_definition',
  description: 'Find the definition location of a symbol. Returns the file path and position where the symbol is defined.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the source file'
      },
      line: {
        type: 'number',
        description: 'Line number (1-indexed)'
      },
      character: {
        type: 'number',
        description: 'Character position in the line (0-indexed)'
      }
    },
    required: ['file', 'line', 'character']
  },
  handler: async (args, context) => {
    const file = args.file as string;
    const line = args.line as number;
    const character = args.character as number;

    if (!fs.existsSync(file)) {
      return { content: [{ type: 'text', text: `File not found: ${file}` }] };
    }

    const content = fs.readFileSync(file, 'utf-8');
    const symbol = findSymbolAtPosition(content, line, character);

    if (!symbol) {
      return { content: [{ type: 'text', text: 'No symbol found at position' }] };
    }

    // Search for definition patterns
    const patterns = getPatternsForFile(file);
    if (!patterns) {
      return { content: [{ type: 'text', text: `Unsupported file type: ${getExtension(file)}` }] };
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const [kind, pattern] of Object.entries(patterns)) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(lines[i])) !== null) {
          if (match[1] === symbol) {
            return {
              content: [{
                type: 'text',
                text: `**Definition Found**
**Symbol**: ${symbol}
**Kind**: ${kind}
**Location**: ${file}:${i + 1}:${match.index}
**Line**: ${lines[i].trim()}`
              }]
            };
          }
        }
      }
    }

    return { content: [{ type: 'text', text: `Definition not found for: ${symbol}` }] };
  }
};

/**
 * LSP Find References Tool
 */
export const lspFindReferencesTool: ToolDefinition = {
  name: 'lsp_find_references',
  description: 'Find all references to a symbol across the codebase.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the source file'
      },
      line: {
        type: 'number',
        description: 'Line number (1-indexed)'
      },
      character: {
        type: 'number',
        description: 'Character position in the line (0-indexed)'
      },
      includeDeclaration: {
        type: 'boolean',
        description: 'Include the declaration in results',
        default: true
      }
    },
    required: ['file', 'line', 'character']
  },
  handler: async (args, context) => {
    const file = args.file as string;
    const line = args.line as number;
    const character = args.character as number;

    if (!fs.existsSync(file)) {
      return { content: [{ type: 'text', text: `File not found: ${file}` }] };
    }

    const content = fs.readFileSync(file, 'utf-8');
    const symbol = findSymbolAtPosition(content, line, character);

    if (!symbol) {
      return { content: [{ type: 'text', text: 'No symbol found at position' }] };
    }

    // Find references in the same file
    const references = findSymbolInFile(content, symbol);

    const lines = content.split('\n');
    const results = references.map(ref => {
      const lineText = lines[ref.line - 1].trim();
      return `${file}:${ref.line}:${ref.character} - ${lineText}`;
    });

    return {
      content: [{
        type: 'text',
        text: `**References to "${symbol}"** (${references.length} found in current file)\n\n${results.join('\n')}`
      }]
    };
  }
};

/**
 * LSP Document Symbols Tool
 */
export const lspDocumentSymbolsTool: ToolDefinition = {
  name: 'lsp_document_symbols',
  description: 'Get a hierarchical outline of all symbols in a file (functions, classes, variables, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the source file'
      }
    },
    required: ['file']
  },
  handler: async (args, context) => {
    const file = args.file as string;

    if (!fs.existsSync(file)) {
      return { content: [{ type: 'text', text: `File not found: ${file}` }] };
    }

    const content = fs.readFileSync(file, 'utf-8');
    const patterns = getPatternsForFile(file);

    if (!patterns) {
      return { content: [{ type: 'text', text: `Unsupported file type: ${getExtension(file)}` }] };
    }

    const symbols: SymbolInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      for (const [kind, pattern] of Object.entries(patterns)) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(lines[i])) !== null) {
          symbols.push({
            name: match[1],
            kind,
            line: i + 1,
            character: match.index,
            file
          });
        }
      }
    }

    if (symbols.length === 0) {
      return { content: [{ type: 'text', text: 'No symbols found in file' }] };
    }

    const output = symbols.map(s => `[${s.kind}] ${s.name} (line ${s.line})`).join('\n');

    return {
      content: [{
        type: 'text',
        text: `**Document Symbols** (${symbols.length} found)\n\n${output}`
      }]
    };
  }
};

/**
 * LSP Diagnostics Tool
 */
export const lspDiagnosticsTool: ToolDefinition = {
  name: 'lsp_diagnostics',
  description: 'Get language server diagnostics (errors, warnings) for a file. Note: This is a simplified implementation.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the source file'
      },
      severity: {
        type: 'string',
        enum: ['error', 'warning', 'info', 'hint'],
        description: 'Filter by severity level'
      }
    },
    required: ['file']
  },
  handler: async (args, context) => {
    const file = args.file as string;

    if (!fs.existsSync(file)) {
      return { content: [{ type: 'text', text: `File not found: ${file}` }] };
    }

    // For a real implementation, you would connect to a language server
    // This is a placeholder that suggests using tsc or eslint
    return {
      content: [{
        type: 'text',
        text: `**Diagnostics for ${file}**

For TypeScript/JavaScript diagnostics, run:
\`\`\`bash
npx tsc --noEmit ${file}
\`\`\`

For ESLint diagnostics, run:
\`\`\`bash
npx eslint ${file}
\`\`\`

Note: Full LSP diagnostics require connecting to a language server.`
      }]
    };
  }
};

/**
 * All LSP tools
 */
export const lspTools: ToolDefinition[] = [
  lspHoverTool,
  lspGotoDefinitionTool,
  lspFindReferencesTool,
  lspDocumentSymbolsTool,
  lspDiagnosticsTool
];
