#!/bin/bash
# Claude Code Stop Hook - Sync latest session to Obsidian on session end
# Add to ~/.claude/settings.json under hooks.Stop
#
# Usage in settings.json:
# {
#   "hooks": {
#     "Stop": [{
#       "matcher": "",
#       "hooks": [{
#         "type": "command",
#         "command": "bash /path/to/obsidian-logger/src/hook/stop-hook.sh"
#       }]
#     }]
#   }
# }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGGER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Run sync in background to avoid blocking Claude Code
(node "$LOGGER_DIR/dist/index.js" sync --recent 1 2>/dev/null &)
