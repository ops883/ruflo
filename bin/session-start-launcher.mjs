#!/usr/bin/env node
/**
 * Fast session-start launcher — single hook that replaces all SessionStart entries.
 *
 * Spawns background tasks via spawn(detached + unref) and exits immediately.
 *
 * Invoked by: node .claude/scripts/session-start-launcher.mjs
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

// ── 1. Helper: fire-and-forget a background process ─────────────────────────
function fireAndForget(cmd, args, label) {
  try {
    const proc = spawn(cmd, args, {
      cwd: projectRoot,
      stdio: 'ignore',     // Don't hold stdio pipes open
      detached: true,       // New process group
      shell: false,
      windowsHide: true     // No console popup on Windows
    });
    proc.unref();           // Let this process exit without waiting
  } catch {
    // If spawn fails (e.g. node not found), don't block startup
  }
}

// ── 2. Reset workflow state for new session ──────────────────────────────────
import { writeFileSync, mkdirSync } from 'fs';
const stateDir = resolve(projectRoot, '.claude');
const stateFile = resolve(stateDir, 'workflow-state.json');
try {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify({
    tasksCreated: false,
    taskCount: 0,
    memorySearched: false,
    sessionStart: new Date().toISOString()
  }, null, 2));
} catch {
  // Non-fatal - workflow gate will use defaults
}

// ── 3. Auto-sync scripts and helpers on version change ───────────────────────
// Controlled by `auto_update.enabled` in moflo.yaml (default: true).
// When moflo is upgraded (npm install), scripts and helpers may be stale.
// Detect version change and sync from source before running hooks.
let autoUpdateConfig = { enabled: true, scripts: true, helpers: true };
try {
  const mofloYaml = resolve(projectRoot, 'moflo.yaml');
  if (existsSync(mofloYaml)) {
    const yamlContent = readFileSync(mofloYaml, 'utf-8');
    // Simple YAML parsing for auto_update block (avoids js-yaml dependency)
    const enabledMatch = yamlContent.match(/auto_update:\s*\n\s+enabled:\s*(true|false)/);
    const scriptsMatch = yamlContent.match(/auto_update:\s*\n(?:\s+\w+:.*\n)*?\s+scripts:\s*(true|false)/);
    const helpersMatch = yamlContent.match(/auto_update:\s*\n(?:\s+\w+:.*\n)*?\s+helpers:\s*(true|false)/);
    if (enabledMatch) autoUpdateConfig.enabled = enabledMatch[1] === 'true';
    if (scriptsMatch) autoUpdateConfig.scripts = scriptsMatch[1] === 'true';
    if (helpersMatch) autoUpdateConfig.helpers = helpersMatch[1] === 'true';
  }
} catch { /* non-fatal — use defaults (all true) */ }

try {
  const mofloPkgPath = resolve(projectRoot, 'node_modules/moflo/package.json');
  const versionStampPath = resolve(projectRoot, '.claude-flow', 'moflo-version');
  if (autoUpdateConfig.enabled && existsSync(mofloPkgPath)) {
    const installedVersion = JSON.parse(readFileSync(mofloPkgPath, 'utf-8')).version;
    let cachedVersion = '';
    try { cachedVersion = readFileSync(versionStampPath, 'utf-8').trim(); } catch {}

    if (installedVersion !== cachedVersion) {
      const binDir = resolve(projectRoot, 'node_modules/moflo/bin');

      // Version changed — sync scripts from bin/
      if (autoUpdateConfig.scripts) {
        const scriptsDir = resolve(projectRoot, '.claude/scripts');
        const scriptFiles = [
          'hooks.mjs', 'session-start-launcher.mjs', 'index-guidance.mjs',
          'build-embeddings.mjs', 'generate-code-map.mjs', 'semantic-search.mjs',
        ];
        for (const file of scriptFiles) {
          const src = resolve(binDir, file);
          const dest = resolve(scriptsDir, file);
          if (existsSync(src)) {
            try { copyFileSync(src, dest); } catch { /* non-fatal */ }
          }
        }
      }

      // Sync helpers from bin/ and source .claude/helpers/
      if (autoUpdateConfig.helpers) {
        const helpersDir = resolve(projectRoot, '.claude/helpers');
        if (!existsSync(helpersDir)) mkdirSync(helpersDir, { recursive: true });

        // Gate and hook helpers — shipped as static files in bin/
        const binHelperFiles = [
          'gate.cjs', 'gate-hook.mjs', 'prompt-hook.mjs', 'hook-handler.cjs',
        ];
        for (const file of binHelperFiles) {
          const src = resolve(binDir, file);
          const dest = resolve(helpersDir, file);
          if (existsSync(src)) {
            try { copyFileSync(src, dest); } catch { /* non-fatal */ }
          }
        }

        // Other helpers from source .claude/helpers/
        const sourceHelpersDir = resolve(projectRoot, 'node_modules/moflo/src/@claude-flow/cli/.claude/helpers');
        const sourceHelperFiles = [
          'auto-memory-hook.mjs', 'statusline.cjs', 'pre-commit', 'post-commit',
        ];
        for (const file of sourceHelperFiles) {
          const src = resolve(sourceHelpersDir, file);
          const dest = resolve(helpersDir, file);
          if (existsSync(src)) {
            try { copyFileSync(src, dest); } catch { /* non-fatal */ }
          }
        }
      }

      // Sync guidance bootstrap file (moflo-bootstrap.md)
      // Ensures subagents can read guidance directly from disk
      const shippedBootstrap = resolve(projectRoot, 'node_modules/moflo/.claude/guidance/shipped/agent-bootstrap.md');
      const legacyBootstrap = resolve(projectRoot, 'node_modules/moflo/.claude/guidance/agent-bootstrap.md');
      const bootstrapSrc = existsSync(shippedBootstrap) ? shippedBootstrap : legacyBootstrap;
      const guidanceDir = resolve(projectRoot, '.claude/guidance');
      const bootstrapDest = resolve(guidanceDir, 'moflo-bootstrap.md');
      if (existsSync(bootstrapSrc)) {
        try {
          if (!existsSync(guidanceDir)) mkdirSync(guidanceDir, { recursive: true });
          const header = '<!-- AUTO-GENERATED by moflo session-start. Do not edit — changes will be overwritten. -->\n<!-- Source: node_modules/moflo/.claude/guidance/agent-bootstrap.md -->\n\n';
          const content = readFileSync(bootstrapSrc, 'utf-8');
          writeFileSync(bootstrapDest, header + content);
        } catch { /* non-fatal */ }
      }

      // Write version stamp
      try {
        const cfDir = resolve(projectRoot, '.claude-flow');
        if (!existsSync(cfDir)) mkdirSync(cfDir, { recursive: true });
        writeFileSync(versionStampPath, installedVersion);
      } catch {}
    }
  }
} catch {
  // Non-fatal — scripts will still work, just may be stale
}

// ── 3b. Ensure guidance bootstrap file exists (even without version change) ──
// Subagents need this file on disk for direct reads without memory search.
try {
  const shippedBs = resolve(projectRoot, 'node_modules/moflo/.claude/guidance/shipped/agent-bootstrap.md');
  const legacyBs = resolve(projectRoot, 'node_modules/moflo/.claude/guidance/agent-bootstrap.md');
  const bootstrapSrc = existsSync(shippedBs) ? shippedBs : legacyBs;
  const guidanceDir = resolve(projectRoot, '.claude/guidance');
  const bootstrapDest = resolve(guidanceDir, 'moflo-bootstrap.md');
  if (existsSync(bootstrapSrc) && !existsSync(bootstrapDest)) {
    if (!existsSync(guidanceDir)) mkdirSync(guidanceDir, { recursive: true });
    const header = '<!-- AUTO-GENERATED by moflo session-start. Do not edit — changes will be overwritten. -->\n<!-- Source: node_modules/moflo/.claude/guidance/agent-bootstrap.md -->\n\n';
    const content = readFileSync(bootstrapSrc, 'utf-8');
    writeFileSync(bootstrapDest, header + content);
  }
} catch { /* non-fatal */ }

// ── 4. Spawn background tasks ───────────────────────────────────────────────
const localCli = resolve(projectRoot, 'node_modules/moflo/src/@claude-flow/cli/bin/cli.js');
const hasLocalCli = existsSync(localCli);

// hooks.mjs session-start (daemon, indexer, pretrain, HNSW, neural patterns)
const hooksScript = resolve(projectRoot, '.claude/scripts/hooks.mjs');
if (existsSync(hooksScript)) {
  fireAndForget('node', [hooksScript, 'session-start'], 'hooks session-start');
}

// Patches are now baked into moflo@4.0.0 source — no runtime patching needed.

// ── 5. Done — exit immediately ──────────────────────────────────────────────
process.exit(0);
