#!/usr/bin/env node
/**
 * Fast session-start launcher — single hook that replaces all SessionStart entries.
 *
 * Spawns background tasks via spawn(detached + unref) and exits immediately.
 *
 * Invoked by: node .claude/scripts/session-start-launcher.mjs
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
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

// ── 3. Spawn background tasks ───────────────────────────────────────────────
const localCli = resolve(projectRoot, 'node_modules/moflo/src/@claude-flow/cli/bin/cli.js');
const hasLocalCli = existsSync(localCli);

// hooks.mjs session-start (daemon, indexer, pretrain, HNSW, neural patterns)
const hooksScript = resolve(projectRoot, '.claude/scripts/hooks.mjs');
if (existsSync(hooksScript)) {
  fireAndForget('node', [hooksScript, 'session-start'], 'hooks session-start');
}

// Patches are now baked into moflo@4.0.0 source — no runtime patching needed.

// ── 4. Done — exit immediately ──────────────────────────────────────────────
process.exit(0);
