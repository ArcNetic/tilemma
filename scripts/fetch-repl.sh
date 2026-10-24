#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tag="v$(sed -E 's#.*:v?##' lean/lean-toolchain | tr -d '[:space:]')"
if [ ! -d .repl ]; then
  git clone --depth 1 --branch "$tag" https://github.com/leanprover-community/repl.git .repl
fi
(cd .repl && lake build)
