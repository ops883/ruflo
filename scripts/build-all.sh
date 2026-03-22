#!/usr/bin/env bash
# Build all v3 packages in dependency order
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V3="$ROOT/v3/@claude-flow"

build_pkg() {
  local pkg="$1"
  local dir="$V3/$pkg"
  if [ ! -d "$dir" ]; then
    echo "SKIP: $pkg (not found)"
    return
  fi
  echo "Building @claude-flow/$pkg..."
  cd "$dir"
  [ ! -d node_modules ] && npm install --silent 2>/dev/null
  npx tsc 2>&1
  echo "  OK: @claude-flow/$pkg"
}

echo "=== Layer 0: Shared ==="
build_pkg shared

echo "=== Layer 1: Core ==="
for pkg in mcp security neural; do build_pkg "$pkg"; done

echo "=== Layer 2: Services ==="
for pkg in memory hooks swarm; do build_pkg "$pkg"; done

echo "=== Layer 3: Higher-level ==="
for pkg in guidance embeddings codex; do build_pkg "$pkg"; done

echo "=== Layer 4: Remaining ==="
for pkg in aidefence browser claims deployment integration performance plugins providers testing; do build_pkg "$pkg"; done

echo "=== Layer 5: CLI ==="
build_pkg cli

echo ""
echo "All packages built successfully."
