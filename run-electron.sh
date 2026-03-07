#!/bin/bash
# Clear ELECTRON_RUN_AS_NODE and run Electron
export ELECTRON_RUN_AS_NODE=
unset ELECTRON_RUN_AS_NODE

# Run electron-vite with clean environment
exec env -i \
  HOME="$HOME" \
  PATH="$PATH" \
  USER="$USER" \
  TERM="$TERM" \
  SHELL="$SHELL" \
  npm run build && \
  ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
