#!/usr/bin/env bash
set -euo pipefail

rm -rf \
"build" \
"frontend/dist" \
"frontend/src/lib/wailsjs" \
"frontend/.vite" \
"frontend/.svelte-kit" \
"release"