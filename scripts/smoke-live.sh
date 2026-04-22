#!/usr/bin/env bash
set -euo pipefail

PROMPT=${1:-"Generate a tiny flat blue square icon on a transparent background."}
OUTPUT=${2:-"./smoke-output.png"}

printf '%s\n' 'Running unsupported live smoke test against the private Codex backend...'
node src/cli/generate.js --prompt "$PROMPT" --output "$OUTPUT" --debug
printf 'Saved image to %s\n' "$OUTPUT"
