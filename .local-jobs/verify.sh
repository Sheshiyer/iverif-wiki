#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
[[ -x node_modules/.bin/astro ]] || { echo 'Install the locked dependencies locally before verification.' >&2; exit 2; }
bun run test:verification
bun run verify:data
./node_modules/.bin/astro check
bun run build
bun run verify:routes
