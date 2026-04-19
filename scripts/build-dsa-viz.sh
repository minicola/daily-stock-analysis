#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
pushd "${ROOT_DIR}/apps/dsa-viz" >/dev/null
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run build
popd >/dev/null
