# Installation

Ruflo requires **Node.js 20+** and **npm 9+** (or pnpm/bun).

!!! info "Prerequisite: Claude Code"
    Ruflo is designed to work with Claude Code. Install it first:
    ```bash
    npm install -g @anthropic-ai/claude-code
    ```

---

## Option 1: One-Line Installer (Recommended)

```bash
# Standard install
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/claude-flow@main/scripts/install.sh | bash

# Full setup (global install + MCP + diagnostics)
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/claude-flow@main/scripts/install.sh | bash -s -- --full
```

### Installer Options

| Flag | Description |
|------|-------------|
| `--global`, `-g` | Install globally (`npm install -g`) |
| `--minimal`, `-m` | Skip optional ML/embedding deps (~15s) |
| `--setup-mcp` | Auto-configure MCP server for Claude Code |
| `--doctor`, `-d` | Run diagnostics after install |
| `--full`, `-f` | Global + MCP + doctor |
| `--version=X.X.X` | Install a specific version |

---

## Option 2: npx / npm

```bash
# Quick start — no install needed
npx ruflo@latest init

# Install globally
npm install -g ruflo@latest
ruflo init

# With Bun (faster)
bunx ruflo@latest init
```

---

## Install Profiles

| Profile | Size | Use Case |
|---------|------|----------|
| `--omit=optional` | ~45 MB | Core CLI only |
| Default | ~340 MB | Full ML + embeddings |

```bash
# Minimal (skip ML/embeddings)
npm install -g ruflo@latest --omit=optional
```

---

## Upgrading

!!! note "Version tags"
    `ruflo@latest` installs the latest stable release. `ruflo@v3alpha` targets the v3 alpha channel with the newest features. Use whichever matches your project.

```bash
# Update helpers and statusline (preserves data)
npx ruflo@latest init upgrade

# Update and add any new skills/agents
npx ruflo@latest init upgrade --add-missing
```

---

## Install Speed Reference

| Method | Time |
|--------|------|
| npx (cached) | ~3s |
| npx (fresh) | ~20s |
| global | ~35s |
| `--minimal` | ~15s |

---

## Next Steps

→ [Quick Start](quickstart.md)  
→ [Claude Code Integration](claude-code.md)
