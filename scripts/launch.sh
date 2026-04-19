#!/usr/bin/env bash
# Lane Manager launcher for macOS/Linux.
set -e

cd "$(dirname "$0")/.."

if [ -z "$ANTHROPIC_API_KEY" ]; then
  if [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
  fi
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set. export it in your shell or put it in .env"
  exit 1
fi

if [ ! -f "dist/index.js" ]; then
  npm install --silent
  npm run build --silent
fi

exec node dist/index.js "$@"
