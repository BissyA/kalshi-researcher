#!/bin/bash
# Shell wrapper for transcribe-x.mjs that truly orphans the process from Next.js.
#
# Why: spawning node directly from a Next.js API route with detached+unref+stdio:ignore
# STILL results in the child dying when Next.js dev server restarts or cycles.
# Using `nohup` + `setsid` + background + fully-redirected stdio gives us a process
# that survives anything short of a reboot.
#
# Usage: scripts/transcribe-x.sh <transcriptId> <url> [--cookies-from-browser]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

mkdir -p logs

# Find node — try common paths, then PATH
NODE_BIN=""
for path in \
  "$HOME/.nvm/versions/node/v22.15.1/bin/node" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node" \
  "$(which node 2>/dev/null || true)"; do
  if [ -x "$path" ]; then
    NODE_BIN="$path"
    break
  fi
done

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found" >> logs/transcribe-x.log
  exit 1
fi

# Launch the worker fully detached: setsid new session, nohup to ignore SIGHUP,
# stdin closed, stdout/stderr redirected to log. Then background and disown.
setsid nohup "$NODE_BIN" "$SCRIPT_DIR/transcribe-x.mjs" "$@" \
  </dev/null >>logs/transcribe-x.log 2>&1 &

# Print the PID so the caller can log it if needed
echo "$!"

# Disown so this shell's exit doesn't affect the backgrounded process
disown
