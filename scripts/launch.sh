#!/usr/bin/env bash
# Lane Manager launcher for macOS/Linux.
# No API key needed: lanes authenticate through your Claude Code login
# (or ANTHROPIC_API_KEY if that's how your Claude Code is set up).
set -e

cd "$(dirname "$0")/.."

if [ ! -f "dist/index.js" ]; then
  npm install --silent
  npm run build --silent
fi

exec node dist/index.js "$@"
